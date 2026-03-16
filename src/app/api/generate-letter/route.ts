import { NextResponse } from 'next/server'
import { callClaude, getTextFromResponse } from '@/lib/anthropic'

export const dynamic = 'force-dynamic'

const SYSTEM_PROMPT = `あなたはBtoB企業向けのABM（Account Based Marketing）営業手紙を作成するエキスパートです。
クライアントのプロダクトを、大手企業の人事責任者（CHRO/人事部長クラス）宛に手紙として送付する施策を支援します。

【出力フォーマット】
以下のJSONフォーマットで出力してください。JSONのみを出力し、マークダウンのコードブロックや説明は一切付けないでください。

{
  "title": "タイトル行のテキスト（○○業界における○○に関するご提案機会のお願い）",
  "body_text": "手紙本文（ソースマーカーなし、タイトル行は含めない）",
  "personalization": {
    "recipient": "宛先の要約（例: 高橋氏（執行役員 グループ人事部長）※製造業界20年→2022年入社。2024年1月に執行役員昇格）",
    "why_you": "Why Youの要約（例: 「パーパス経営を支える人材戦略の推進と職種別採用の高度化に取り組まれている高橋様が…」← JACインタビュー記事の核心テーマ＋HR AGE記事の職種別採用改革を反映）",
    "hypothesis": "課題仮説の要約（例: パーパス「すこやかな毎日、ゆたかな人生」のもと…ESだけでは見えにくい価値観や意欲を初期段階で把握することが一層重要）",
    "case_study": "事例名（例: 三菱食品（同じ食品業界＋録画選考×AI→合格率20%上昇・採用期間2ヶ月短縮））",
    "case_study_reason": "事例選定理由（例: 食品業界の同業事例であり業界親近感が高い。既に職種別採用の改革は進んでおり、次のステップとして「初期選考でのマッチング精度向上」にharutakaが位置づけられる）"
  },
  "sources": [
    {
      "index": 1,
      "fact": "本文中で使用した具体的な事実（一文で）",
      "source_name": "情報源の名称",
      "source_url": "URL（ある場合、なければ空文字）",
      "fetched_at": "YYYY-MM-DD形式（情報の取得日・推定日）"
    }
  ]
}

【手紙本文のルール】
- 文字数: 約850文字
- 段落数: 7段落構成
- 構成（上から順に、タイトルは含めない）:
  1. 挨拶「拝啓　時下ますますご清栄のこととお慶び申し上げます。突然のお手紙にて失礼いたします。」
  2. Why You + 自己紹介 + ベネフィット（1段落）
  3. 課題仮説（1段落）
  4. 事例タイトル（■ 太字で事例企業名と括弧で業界/特徴）
  5. 事例本文（1段落：課題→施策→成果の流れ、具体的な数値を含む）
  6. CTA「つきましては、追ってお電話にてご連絡いたしますので、その際に忌憚なくご意見いただけますと幸いでございます。以上、ご多忙のところ恐縮ながらご検討の程宜しくお願い申し上げます。」
  7. （空行後）「敬具」（この行は右揃えで出力するため、本文の最後の行として含める）
- 各段落の文頭は1字下げ（挨拶行とCTA行と敬具を除く）
- 敬語は最高敬語を使用
- 営業感を出さず、課題解決の文脈で書く
- 事例に従業員数は記載しない

【タイトルの書き方】
「○○業界における○○に関するご提案機会のお願い」
- 業界名は宛先企業に合わせる（例：商用車メーカー、総合化学メーカー、半導体材料メーカー）
- 提案内容はプロダクトの主な提供価値に合わせる

【Why You（なぜあなたに送るのか）の書き方】
- 宛先の役職・担当領域に触れる（「CHROとして〜」「人事本部を統括されている〜」）
- 想定される課題感を提示する
- プロダクトの自己紹介（1文）
- 事例に触れて「お力添えできるのではないか」で締める
- 宛先個人のインタビュー記事で語られている言葉やテーマがあれば、それを踏まえた表現にする

【課題仮説の書き方】
- 公開情報から読み取れる企業固有の構造的課題を提示する
- 「あくまで外部からの仮説」という謙虚な姿勢を保つ
- 具体的な拠点名・事業名・組織構造に触れることで「この人、うちのことちゃんと調べてるな」と思わせる
- 事例への橋渡し「以下の事例がご参考になれば幸いです」で締める

【事例の書き方】
- 事例企業名と括弧で業界/特徴
- 課題→施策→成果の流れで3〜4文
- 具体的な数値（○%改善、○ヶ月短縮等）を入れる
- 「このほかにも〜に関する事例がございます」で締める（他の事例もあることを示唆）
- 事例に従業員数は記載しない

【事例選定の原則】
- 宛先の関心軸から逆算して選ぶ（事例ありきではなく、課題仮説→最適な事例）
- 業界親近感を重視する（同業界の事例があれば優先）
- 毎回同じ事例を使わない

【事例選定マッチング参考】
- 面接官育成・候補者体験 → 面接データ可視化→お手本面接官のナレッジ化
- 初期選考の効率化・見極め精度 → 録画選考×AI→合格率UP・採用期間短縮
- 全国拠点の面接標準化 → AI面接で24時間選考・リードタイム短縮
- 技術系採用・研究プレゼンの見極め → エントリー動画で技術的素養を初期把握
- 面接の業務負荷軽減 → AI要約機能で面接官・人事双方の工数削減
- データドリブン採用 → 発言データ分析で見極め力の定量化
- CFO兼任・投資対効果重視 → 採用期間短縮・工数削減の数値成果
- 人材育成志向のCHRO → 面接データのナレッジ化→面接官講習→育成の仕組み化
- DX推進・データ活用志向 → 面接データの可視化→ナレッジ化→組織学習
- 事業再編期・多忙な現場 → AI要約で面接官の負荷軽減

【ソースのルール】
- 本文中にはソースマーカー[①][②]等を一切入れないこと。手紙本文はクリーンなテキストにする
- ただしsources配列には、本文中で使用した全ての具体的な事実（数値・固有名詞・出来事）を記録する
- 抽象的な表現はsourcesに含めない
- ソースは直近半年以内の情報に限定する

【ナレッジ活用】
提供されたナレッジ情報がある場合:
- プロダクト情報 → ソリューションの具体的な説明に活用
- 導入事例 → 宛先の関心軸に最適な事例を1社選定して使用
- 営業資料 → 説得力のあるフレーズや数値を活用
- 市場動向 → 課題仮説の裏付けに活用

【ディープリサーチ情報がある場合】
- 企業の中期経営計画や注力領域に即した課題仮説を立てる
- 人物リサーチから得た発言・記事内容をWhy Youのフックに使う
- 役職確認結果を反映する（最新の役職を使用）
- プロダクト適合性分析の推奨アプローチ角度に沿って訴求する
- Why You分析の推奨書き出しを参考にパーソナライズする`

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const {
      contact,
      client,
      whyYouAngle,
      sendTrigger,
      collectedContext,
      knowledgeContext,
      deepResearch,
    } = body

    let knowledgeSection = ''
    if (knowledgeContext && knowledgeContext.length > 0) {
      knowledgeSection = `\n\n【ナレッジベース（以下の情報を活用して手紙を作成）】\n`
      for (const k of knowledgeContext) {
        knowledgeSection += `\n--- ${k.category}: ${k.title} ---\n${k.content}\n`
      }
    }

    let deepResearchSection = ''
    if (deepResearch) {
      deepResearchSection = '\n\n【ディープリサーチ結果（以下の調査結果を最大限活用して手紙をパーソナライズ）】'
      if (deepResearch.roleVerification) {
        deepResearchSection += `\n\n--- 役職確認結果（最重要：最新の役職を使用すること） ---\n${deepResearch.roleVerification}`
      }
      if (deepResearch.companyResearch) {
        deepResearchSection += `\n\n--- 企業リサーチ ---\n${deepResearch.companyResearch}`
      }
      if (deepResearch.personResearch) {
        deepResearchSection += `\n\n--- 人物リサーチ ---\n${deepResearch.personResearch}`
      }
      if (deepResearch.productFitAnalysis) {
        deepResearchSection += `\n\n--- プロダクト適合性分析 ---\n${deepResearch.productFitAnalysis}`
      }
      if (deepResearch.whyYouAnalysis) {
        deepResearchSection += `\n\n--- Why You分析 ---\n${deepResearch.whyYouAnalysis}`
      }
    }

    const userPrompt = `【宛先情報】
会社名: ${contact.company_name}
部署: ${contact.department ?? ''}
役職: ${contact.title ?? ''}
氏名: ${contact.full_name ?? '（担当者様）'}

【企業の直近コンテキスト】
${collectedContext || '特になし'}

【Why Youの切り口】
${whyYouAngle}

【送付トリガー】
${sendTrigger || '特になし'}

【提供するソリューション】
クライアント: ${client?.name ?? ''}
商材: ${client?.product_name ?? ''}
${knowledgeSection}${deepResearchSection}
【差出人情報】
bizmote株式会社
代表取締役 山岡大輔`

    const response = await callClaude({
      model: 'claude-sonnet-4-20250514',
      system: SYSTEM_PROMPT,
      max_tokens: 2048,
      messages: [
        { role: 'user', content: userPrompt },
      ],
    })

    const rawText = getTextFromResponse(response)

    let letter = rawText
    let title = ''
    let personalization = null
    let sources: Array<{
      index: number
      fact: string
      source_name: string
      source_url: string
      fetched_at: string
      is_verified: boolean
      freshness: string
    }> = []

    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        if (parsed.body_text) {
          letter = parsed.body_text
        }
        if (parsed.title) {
          title = parsed.title
        }
        if (parsed.personalization) {
          personalization = parsed.personalization
        }
        if (Array.isArray(parsed.sources)) {
          const today = new Date()
          sources = parsed.sources.map((s: { index: number; fact: string; source_name: string; source_url?: string; fetched_at?: string }) => {
            const fetchedAt = s.fetched_at || today.toISOString().split('T')[0]
            const fetchedDate = new Date(fetchedAt)
            const daysDiff = Math.floor((today.getTime() - fetchedDate.getTime()) / (1000 * 60 * 60 * 24))
            let freshness = 'fresh'
            if (daysDiff > 180) freshness = 'stale'
            else if (daysDiff > 30) freshness = 'caution'
            return {
              index: s.index,
              fact: s.fact,
              source_name: s.source_name,
              source_url: s.source_url || '',
              fetched_at: fetchedAt,
              is_verified: false,
              freshness,
            }
          })
        }
      }
    } catch {
      // If JSON parsing fails, return raw text as letter body with no sources
    }

    return NextResponse.json({ letter, title, personalization, sources })
  } catch (error) {
    console.error('Letter generation error:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return NextResponse.json(
      { error: '手紙の生成に失敗しました', detail: errorMessage },
      { status: 500 }
    )
  }
}
