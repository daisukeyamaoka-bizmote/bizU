import { NextResponse } from 'next/server'
import { getAnthropicApiKey } from '@/lib/anthropic'

export const dynamic = 'force-dynamic'

/**
 * Deep Research API - ABMワークフロー準拠（2ステップ統合版）
 *
 * Step 1: Web検索で包括的リサーチ（役職確認・企業・人物を1回で）
 * Step 2: 分析（プロダクト適合性 + Why You を1回で）
 */
export async function POST(request: Request) {
  try {
    const {
      companyName,
      contactName,
      contactTitle,
      contactDepartment,
      knowledgeContext,
    } = await request.json()

    const apiKey = await getAnthropicApiKey()

    // Step 1: 包括的Web検索リサーチ（役職確認 + 企業 + 人物を1回で実行）
    const researchResult = await webSearchClaude(apiKey, `あなたはABM営業のためのディープリサーチャーです。以下の企業・人物について包括的にWebで検索し、情報をまとめてください。

【対象】
企業名: ${companyName}
氏名: ${contactName}
登録役職: ${contactTitle ?? '不明'}
部署: ${contactDepartment ?? '不明'}

以下の3つのセクションに分けて報告してください:

===== セクション1: 役職の最新確認 =====
- ${companyName}の公式サイトで${contactName}の現在の役職を確認
- 直近の人事異動ニュースで異動・退任・昇格がないか確認
- 現在の役職、役職変更有無、宛先適切性を報告

===== セクション2: 企業リサーチ =====
- 中期経営計画・重点戦略
- 採用体制（新卒/中途、採用人数）
- 人事戦略・人的資本経営の取り組み
- 直近のニュース（M&A、決算、組織変更）

===== セクション3: 人物リサーチ =====
- ${contactName}のインタビュー記事・講演・セミナー登壇
- 経歴（前職、専門分野、現職就任時期）
- 本人が語っている課題感・注力テーマ
- 人事・採用に関する具体的な発言

各項目は具体的な数値と出典URL を含めてください。情報がない項目はスキップ。
ソースは直近半年以内を優先。必ずWebで検索してから回答してください。`, 15)

    // リサーチ結果をセクション分割
    const roleVerification = extractSection(researchResult, 'セクション1', 'セクション2')
    const companyResearch = extractSection(researchResult, 'セクション2', 'セクション3')
    const personResearch = extractSection(researchResult, 'セクション3', null)

    // Step 2: プロダクト適合性 + Why You 統合分析（Web検索不要）
    let knowledgeSection = ''
    if (knowledgeContext && knowledgeContext.length > 0) {
      const knowledgeText = knowledgeContext
        .map((k: { category: string; title: string; content: string }) =>
          `[${k.category}] ${k.title}\n${k.content}`)
        .join('\n\n')
      knowledgeSection = `\n【プロダクトナレッジ】\n${knowledgeText}`
    }

    const analysis = await callClaudeText(apiKey, `あなたはBtoB営業戦略のエキスパートです。
以下の情報をもとに、プロダクト適合性分析とWhy You分析を行ってください。

【対象者】
氏名: ${contactName}
役職: ${contactTitle ?? ''}
部署: ${contactDepartment ?? ''}
企業: ${companyName}

【役職確認結果】
${roleVerification}

【企業リサーチ】
${companyResearch}

【人物リサーチ】
${personResearch}
${knowledgeSection}

===== Part A: プロダクト適合性分析 =====
1. 課題仮説: 企業の経営課題に対してプロダクトが解決できること
2. フィットポイント: 中計や注力テーマとの接点
3. 推奨事例: ナレッジ内から最適な事例（あれば）
4. 推奨アプローチ角度
5. 注意点

===== Part B: Why You分析 =====
1. Why You: この方にこそ連絡すべき理由
2. パーソナライズポイント: 手紙に入れるべき固有フック（記事・発言・人事異動等）
3. 推奨送付トリガー: 今この時期に送る理由
4. 推奨書き出し: 手紙冒頭のフレーズ案（2-3パターン）
5. 宛先適切性の判断

簡潔かつ具体的に。`)

    const productFitAnalysis = extractSection(analysis, 'Part A', 'Part B')
    const whyYouAnalysis = extractSection(analysis, 'Part B', null)

    return NextResponse.json({
      roleVerification,
      companyResearch,
      personResearch,
      productFitAnalysis,
      whyYouAnalysis,
    })
  } catch (error) {
    console.error('Deep research error:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: 'リサーチに失敗しました', detail: errorMessage },
      { status: 500 }
    )
  }
}

/** セクション抽出ヘルパー */
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

/** 429レート制限時に指数バックオフでリトライ */
async function fetchWithRetry(
  apiKey: string,
  body: Record<string, unknown>,
  maxRetries = 4,
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
        : Math.min(2000 * Math.pow(2, attempt), 60000)
      console.log(`[deep-research] Rate limited, retrying in ${waitMs}ms (attempt ${attempt + 1}/${maxRetries})`)
      await new Promise(resolve => setTimeout(resolve, waitMs))
      continue
    }

    const errorBody = await res.text()
    throw new Error(`Anthropic API error (${res.status}): ${errorBody}`)
  }
  throw new Error('Anthropic API: max retries exceeded')
}

/** Web Search付きClaude呼び出し */
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
  const textBlocks = content
    .filter((c) => c.type === 'text')
    .map((c) => c.text ?? '')
  return textBlocks.join('\n') || ''
}

/** 通常Claude呼び出し（Web検索なし） */
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
