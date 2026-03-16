import { NextResponse } from 'next/server'
import { getAnthropicApiKey } from '@/lib/anthropic'

export const dynamic = 'force-dynamic'

/**
 * Deep Research API - ステップ分割版
 *
 * step=research: Web検索リサーチ（役職確認・企業・人物）
 * step=analyze:  分析（プロダクト適合性 + Why You）
 *
 * フロントエンドが各ステップを順番に呼び出す。
 * 各呼び出しは短時間で完了し、Workersタイムアウトを回避。
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { step } = body

    const apiKey = await getAnthropicApiKey()

    if (step === 'research') {
      return await handleResearch(apiKey, body)
    } else if (step === 'analyze') {
      return await handleAnalyze(apiKey, body)
    } else {
      return NextResponse.json({ error: 'Invalid step' }, { status: 400 })
    }
  } catch (error) {
    console.error('Deep research error:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: 'リサーチに失敗しました', detail: errorMessage },
      { status: 500 }
    )
  }
}

/** Step 1: Web検索リサーチ */
async function handleResearch(
  apiKey: string,
  body: { companyName: string; contactName: string; contactTitle?: string; contactDepartment?: string },
) {
  const { companyName, contactName, contactTitle, contactDepartment } = body

  const result = await webSearchClaude(apiKey, `以下の企業・人物について包括的にWeb検索し、情報をまとめてください。

企業名: ${companyName}
氏名: ${contactName}
役職: ${contactTitle ?? '不明'}
部署: ${contactDepartment ?? '不明'}

以下3セクションで報告:

## セクション1: 役職確認
- 公式サイトで${contactName}の現在の役職を確認
- 直近の人事異動ニュースを確認
- 現在の役職、変更有無、宛先適切性

## セクション2: 企業リサーチ
- 中期経営計画・重点戦略
- 採用体制
- 人事戦略・人的資本経営
- 直近ニュース

## セクション3: 人物リサーチ
- インタビュー記事・講演
- 経歴
- 課題感・注力テーマ

各項目は出典URLを含め、簡潔に。ソースは直近半年以内を優先。`, 5)

  const roleVerification = extractSection(result, 'セクション1', 'セクション2')
  const companyResearch = extractSection(result, 'セクション2', 'セクション3')
  const personResearch = extractSection(result, 'セクション3', null)

  return NextResponse.json({
    roleVerification,
    companyResearch,
    personResearch,
  })
}

/** Step 2: 分析（Web検索不要） */
async function handleAnalyze(
  apiKey: string,
  body: {
    companyName: string
    contactName: string
    contactTitle?: string
    contactDepartment?: string
    roleVerification: string
    companyResearch: string
    personResearch: string
    knowledgeContext?: Array<{ category: string; title: string; content: string }>
  },
) {
  const {
    companyName, contactName, contactTitle, contactDepartment,
    roleVerification, companyResearch, personResearch, knowledgeContext,
  } = body

  let knowledgeSection = ''
  if (knowledgeContext && knowledgeContext.length > 0) {
    const knowledgeText = knowledgeContext
      .map((k) => `[${k.category}] ${k.title}\n${k.content}`)
      .join('\n\n')
    knowledgeSection = `\n【プロダクトナレッジ】\n${knowledgeText}`
  }

  const analysis = await callClaudeText(apiKey, `BtoB営業戦略エキスパートとして分析してください。

【対象者】${contactName} / ${contactTitle ?? ''} / ${contactDepartment ?? ''} / ${companyName}

【役職確認】${roleVerification}
【企業リサーチ】${companyResearch}
【人物リサーチ】${personResearch}
${knowledgeSection}

## Part A: プロダクト適合性
1. 課題仮説 2. フィットポイント 3. 推奨事例 4. 推奨アプローチ角度 5. 注意点

## Part B: Why You
1. Why You: この方に連絡すべき理由
2. パーソナライズポイント: 固有フック（記事・発言等）
3. 推奨送付トリガー
4. 推奨書き出し（2-3パターン）
5. 宛先適切性の判断

簡潔に。`)

  const productFitAnalysis = extractSection(analysis, 'Part A', 'Part B')
  const whyYouAnalysis = extractSection(analysis, 'Part B', null)

  return NextResponse.json({
    productFitAnalysis,
    whyYouAnalysis,
  })
}

/** セクション抽出 */
function extractSection(text: string, startMarker: string, endMarker: string | null): string {
  const startIdx = text.indexOf(startMarker)
  if (startIdx === -1) return endMarker ? '' : text

  const contentStart = text.indexOf('\n', startIdx)
  if (contentStart === -1) return ''

  if (endMarker) {
    const endIdx = text.indexOf(endMarker, contentStart)
    if (endIdx === -1) return text.slice(contentStart).trim()
    return text.slice(contentStart, endIdx).trim()
  }
  return text.slice(contentStart).trim()
}

/** 429リトライ */
async function fetchWithRetry(
  apiKey: string,
  body: Record<string, unknown>,
  maxRetries = 3,
): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    })

    if (res.ok) {
      return res.json() as Promise<Record<string, unknown>>
    }

    if (res.status === 429 && attempt < maxRetries) {
      const retryAfter = res.headers.get('retry-after')
      const waitMs = retryAfter
        ? parseInt(retryAfter, 10) * 1000
        : Math.min(2000 * Math.pow(2, attempt), 30000)
      await new Promise(resolve => setTimeout(resolve, waitMs))
      continue
    }

    const errorBody = await res.text()
    throw new Error(`Anthropic API error (${res.status}): ${errorBody}`)
  }
  throw new Error('Anthropic API: max retries exceeded')
}

/** Web Search付きClaude */
async function webSearchClaude(apiKey: string, prompt: string, maxSearchUses = 5): Promise<string> {
  const data = await fetchWithRetry(apiKey, {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    tools: [
      {
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: maxSearchUses,
      },
    ],
    messages: [{ role: 'user', content: prompt }],
  })

  const content = (data.content ?? []) as Array<{ type: string; text?: string }>
  return content.filter((c) => c.type === 'text').map((c) => c.text ?? '').join('\n') || ''
}

/** 通常Claude */
async function callClaudeText(apiKey: string, prompt: string): Promise<string> {
  const data = await fetchWithRetry(apiKey, {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  })

  const content = (data.content ?? []) as Array<{ type: string; text?: string }>
  const textBlock = content.find((c) => c.type === 'text')
  return textBlock?.text ?? ''
}
