import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Deep Research API
 * 企業＋人物の多段階リサーチを実行し、手紙作成に必要なコンテキストを構築する
 *
 * Steps:
 * 1. 企業IR・中期経営計画の理解
 * 2. プロダクト適合性の確認（ナレッジベース活用）
 * 3. 担当者の人事異動・最新記事の調査
 * 4. Why You（なぜあなたに連絡するのか）の明確化
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

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY が設定されていません')
    }

    // Step 1: 企業IR・中期経営計画リサーチ
    const companyResearch = await webSearchClaude(apiKey, `以下の日本企業について、BtoB営業に役立つ最新情報をWebで検索してまとめてください。

企業名: ${companyName}

以下の観点で情報を整理してください:
1. 【IR・決算情報】直近の売上高、営業利益、前年比成長率、業績予想
2. 【中期経営計画】中計の名称、期間、重点戦略、数値目標（売上・利益目標）
3. 【経営課題・注力領域】DX、人材、海外展開、M&A、コスト削減などの主要テーマ
4. 【組織変更・新規事業】直近の組織再編、新規事業立ち上げ、子会社設立
5. 【業界ポジション・競合状況】市場シェア、競合他社との差別化ポイント

各項目は具体的な数値と出典情報を含めてください。情報がない項目はスキップ。
必ずWebで検索してから回答してください。`)

    // Step 2: 人物リサーチ（人事異動・最新記事）
    const personResearch = await webSearchClaude(apiKey, `以下の人物について、最新の情報をWebで検索してまとめてください。

企業名: ${companyName}
氏名: ${contactName}
役職: ${contactTitle ?? ''}
部署: ${contactDepartment ?? ''}

以下の観点で情報を整理してください:
1. 【人事異動】この方の直近の人事異動情報（いつ現職に就任したか、前職は何か）
2. 【メディア記事・インタビュー】この方が登場する最新の記事、インタビュー、講演内容
3. 【注力テーマ】この方が発信している課題意識やビジョン、取り組みテーマ
4. 【SNS・外部活動】LinkedIn、業界イベント登壇、寄稿などの活動

具体的な記事タイトルや日付を含めてください。情報がない項目はスキップ。
必ずWebで検索してから回答してください。`)

    // Step 3: プロダクト適合性分析（Claude通常呼び出し、Web検索不要）
    let productFitAnalysis = ''
    if (knowledgeContext && knowledgeContext.length > 0) {
      const knowledgeText = knowledgeContext
        .map((k: { category: string; title: string; content: string }) =>
          `[${k.category}] ${k.title}\n${k.content}`)
        .join('\n\n')

      productFitAnalysis = await callClaudeText(apiKey, `あなたはBtoB営業戦略のエキスパートです。
以下の企業情報とプロダクトのナレッジを照合し、プロダクトの適合性を分析してください。

【対象企業】${companyName}
【企業リサーチ結果】
${companyResearch}

【プロダクトナレッジ】
${knowledgeText}

以下の観点で分析してください:
1. 【課題仮説】企業の経営課題・注力領域に対して、プロダクトがどの課題を解決できるか
2. 【フィットポイント】中期経営計画や注力テーマとプロダクトの接点
3. 【推奨アプローチ角度】手紙で訴求すべきポイント（具体的に）
4. 【注意点】避けるべきトピックやアプローチ

簡潔かつ具体的に。`)
    }

    // Step 4: Why You 分析
    const whyYouAnalysis = await callClaudeText(apiKey, `あなたはBtoB営業のパーソナライゼーション専門家です。
以下の情報をもとに「なぜこの方に手紙を書くのか」の理由を明確にしてください。

【対象者】
氏名: ${contactName}
役職: ${contactTitle ?? ''}
部署: ${contactDepartment ?? ''}
企業: ${companyName}

【企業リサーチ】
${companyResearch}

【人物リサーチ】
${personResearch}

${productFitAnalysis ? `【プロダクト適合性分析】\n${productFitAnalysis}` : ''}

以下を出力してください:
1. 【Why You（なぜあなたに）】この方にこそ連絡すべき理由（役職・権限・取り組みテーマとの関連）
2. 【パーソナライズポイント】手紙に入れるべきこの方固有のフック（記事内容、発言、人事異動など）
3. 【推奨送付トリガー】今この時期に送る理由（決算、人事異動、新規事業発表など）
4. 【推奨書き出し】手紙の冒頭で使える具体的なフレーズ案（2-3パターン）

簡潔かつ具体的に。`)

    return NextResponse.json({
      companyResearch,
      personResearch,
      productFitAnalysis,
      whyYouAnalysis,
    })
  } catch (error) {
    console.error('Deep research error:', error)
    return NextResponse.json(
      { error: 'リサーチに失敗しました' },
      { status: 500 }
    )
  }
}

/** Web Search付きClaude呼び出し */
async function webSearchClaude(apiKey: string, prompt: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      tools: [
        {
          type: 'web_search_20250305',
          name: 'web_search',
          max_uses: 5,
        },
      ],
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) {
    const errorBody = await res.text()
    throw new Error(`Anthropic API error (${res.status}): ${errorBody}`)
  }

  const data = await res.json()
  const textBlocks = (data.content ?? [])
    .filter((c: { type: string }) => c.type === 'text')
    .map((c: { text: string }) => c.text)
  return textBlocks.join('\n') || ''
}

/** 通常Claude呼び出し（Web検索なし） */
async function callClaudeText(apiKey: string, prompt: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) {
    const errorBody = await res.text()
    throw new Error(`Anthropic API error (${res.status}): ${errorBody}`)
  }

  const data = await res.json()
  const textBlock = (data.content ?? []).find((c: { type: string }) => c.type === 'text')
  return textBlock?.text ?? ''
}
