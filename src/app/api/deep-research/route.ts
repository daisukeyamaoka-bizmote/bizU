import { NextResponse } from 'next/server'
import { getAnthropicApiKey } from '@/lib/anthropic'

export const dynamic = 'force-dynamic'

/**
 * Deep Research API - ABMワークフロー準拠
 *
 * Steps:
 * 1. 役職の最新確認（最重要ステップ）
 * 2. 企業リサーチ（IR・中計・採用体制・人事戦略）
 * 3. 宛先個人リサーチ（インタビュー・講演・経歴・課題感）
 * 4. プロダクト適合性分析（ナレッジベース活用）
 * 5. Why You分析
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

    // Step 1: 役職の最新確認（最重要ステップ）
    const roleVerification = await webSearchClaude(apiKey, `以下の人物の現在の役職を確認してください。これは手紙送付のための最重要確認事項です。

企業名: ${companyName}
氏名: ${contactName}
登録役職: ${contactTitle ?? '不明'}
部署: ${contactDepartment ?? '不明'}

以下を全てチェックし、確認結果を報告してください:

1. 【公式サイト役員一覧】${companyName}の公式サイトの役員一覧ページで現在の役職を確認
2. 【直近の人事異動】プレスリリースや人事異動ニュースで異動・退任・昇格がないか確認
3. 【日経人事記事】日経新聞の人事異動記事を検索
4. 【異動ニュースサイト】relocation-personnel.com等の人事異動サイトを確認

確認結果を以下の形式で報告:
- 現在の役職: （確認した最新の役職）
- 役職変更有無: あり/なし（変更があった場合は詳細を記載）
- 宛先適切性: 適切/要検討（人事・採用の意思決定者として適切かの判断）
- 注意事項: （CFO兼務の場合や人事専任でない場合のリスク等）
- 確認ソース: （確認に使用したURL）

【注意事項】
- 古い役職で手紙を送ると信頼性が致命的に損なわれるため、必ず最新情報を確認する
- 人事専任のCHROがいない企業でCFOや管理本部長が人事を兼務している場合、その人が本当に適切な宛先か検討する
- CFO兼任の場合、本人が人事・採用について具体的にインタビュー等で語っているかを確認する`, 8)

    // レート制限回避: API呼び出し間にディレイを挿入
    await new Promise(r => setTimeout(r, 5000))

    // Step 2: 企業リサーチ
    const companyResearch = await webSearchClaude(apiKey, `以下の日本企業について、ABM営業手紙作成に必要な情報をWebで検索してまとめてください。ソースは直近半年以内に限定してください。

企業名: ${companyName}

以下の観点で情報を整理してください:

1. 【中期経営計画・事業構造】
   - 中計の名称、期間、重点戦略、数値目標
   - 事業構造（拠点、事業領域、組織再編）

2. 【採用体制】
   - 新卒/中途比率、採用人数、採用拠点
   - 採用に関する直近のニュースや取り組み

3. 【人事戦略・人的資本経営】
   - 人的資本経営の取り組み
   - 人事制度改革、定年引上げ等

4. 【直近のニュース】
   - M&A、事業再編、新規事業
   - 決算情報、業績動向

5. 【組織変更】
   - 直近の組織再編、部門統廃合

各項目は具体的な数値と出典情報（URL含む）を含めてください。情報がない項目はスキップ。
必ずWebで検索してから回答してください。`, 8)

    await new Promise(r => setTimeout(r, 5000))

    // Step 3: 宛先個人リサーチ（最も重要）
    const personResearch = await webSearchClaude(apiKey, `以下の人物について、最新の情報をWebで検索してまとめてください。ソースは直近半年以内を優先してください。

企業名: ${companyName}
氏名: ${contactName}
役職: ${contactTitle ?? ''}
部署: ${contactDepartment ?? ''}

以下の観点で情報を整理してください（これが手紙のパーソナライゼーションの核心です）:

1. 【インタビュー記事・講演情報・セミナー登壇】
   - この方が登場する最新の記事、インタビュー内容
   - 講演・セミナーでの発言内容
   - 具体的な引用があれば記載

2. 【経歴】
   - 前職、専門分野、現職就任時期
   - キャリアの特徴

3. 【本人が語っている課題感・注力テーマ】
   - 記事やインタビューで語られている課題意識
   - 注力しているプロジェクトやテーマ
   - 人事・採用に関する具体的な発言

4. 【外部活動】
   - 業界団体での活動
   - 寄稿、書籍出版
   - SNS活動

具体的な記事タイトル、日付、URLを含めてください。情報がない項目はスキップ。
必ずWebで検索してから回答してください。`, 8)

    await new Promise(r => setTimeout(r, 5000))

    // Step 4: プロダクト適合性分析（Claude通常呼び出し、Web検索不要）
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

【宛先個人の情報】
${personResearch}

【プロダクトナレッジ】
${knowledgeText}

以下の観点で分析してください:
1. 【課題仮説】企業の経営課題・注力領域に対して、プロダクトがどの課題を解決できるか
2. 【フィットポイント】中期経営計画や注力テーマとプロダクトの接点
3. 【推奨事例】ナレッジ内の事例から、この宛先に最適な事例はどれか（関心軸から逆算）
4. 【推奨アプローチ角度】手紙で訴求すべきポイント（具体的に）
5. 【注意点】避けるべきトピックやアプローチ

簡潔かつ具体的に。`)
    }

    await new Promise(r => setTimeout(r, 5000))

    // Step 5: Why You 分析
    const whyYouAnalysis = await callClaudeText(apiKey, `あなたはBtoB営業のパーソナライゼーション専門家です。
以下の情報をもとに「なぜこの方に手紙を書くのか」の理由を明確にしてください。

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

${productFitAnalysis ? `【プロダクト適合性分析】\n${productFitAnalysis}` : ''}

以下を出力してください:
1. 【Why You（なぜあなたに）】この方にこそ連絡すべき理由（役職・権限・取り組みテーマとの関連）
2. 【パーソナライズポイント】手紙に入れるべきこの方固有のフック（記事内容、発言、人事異動など）
   - 宛先個人のインタビュー記事で語られている言葉やテーマがあれば、具体的に引用
3. 【推奨送付トリガー】今この時期に送る理由（決算、人事異動、新規事業発表など）
4. 【推奨書き出し】手紙の冒頭で使える具体的なフレーズ案（2-3パターン）
   - 「CHROとして〜」「人事本部を統括されている〜」等、役職に触れる書き出し
5. 【宛先適切性の判断】この方が人事・採用の意思決定者として適切かどうかの判断と理由

簡潔かつ具体的に。`)

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
    max_tokens: 2048,
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
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  })

  const content = (data.content ?? []) as Array<{ type: string; text?: string }>
  const textBlock = content.find((c) => c.type === 'text')
  return textBlock?.text ?? ''
}
