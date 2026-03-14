import { NextResponse } from 'next/server'
import { callClaude, getTextFromResponse } from '@/lib/anthropic'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SYSTEM_PROMPT = `あなたはBtoB営業のプロフェッショナルです。
日本の大手企業の役員に送る、高反応率のパーソナライズ手紙を作成します。

【出力フォーマット】
以下のJSONフォーマットで出力してください。JSONのみを出力し、マークダウンのコードブロックや説明は一切付けないでください。

{
  "body_text": "手紙本文（マーカー付き）",
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
- 文字数: 830〜870文字
- 段落数: 7段落
- 構成:
  1. 時候の挨拶・自己紹介（Why You：なぜあなたに書いたか）
  2. 課題仮説の提示
  3. ケーススタディ（1社のみ、具体的な数値を含む）
  4. 自社ソリューションとの接続
  5. CTA（具体的なアクション提案）
  6. 締め
- 各段落の文頭は1字下げ
- 敬語は最高敬語を使用
- 営業感を出さず、課題解決の文脈で書く

【ソースマーカーのルール】
- 本文中の事実情報（具体的な数値・固有名詞・出来事）に[①][②][③]等のマーカーを挿入
- 例: 「採用件数が前年比40%増加[①]しておられることを拝察し」
- sourcesには本文中の全ての具体的な数値・固有名詞・出来事を含める
- 抽象的な表現はsourcesに含めない
- マーカーの番号はsources配列のindexと対応させる

【重要】
提供されたナレッジ情報がある場合、その内容を活用して手紙の説得力を高めてください。
- プロダクト情報 → ソリューションの具体的な説明に活用
- 導入事例 → 最も宛先企業に近い業種・課題の事例を選んで使用
- 営業資料 → 説得力のあるフレーズや数値を活用
- 市場動向 → 課題仮説の裏付けに活用

【ディープリサーチ情報がある場合】
- 企業の中期経営計画や注力領域に即した課題仮説を立てる
- 人物リサーチから得た発言・記事内容をWhy Youのフックに使う
- プロダクト適合性分析の推奨アプローチ角度に沿って訴求する
- Why You分析の推奨書き出しを参考にパーソナライズする`

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const {
      contact,
      client,
      caseStudy,
      whyYouAngle,
      sendTrigger,
      collectedContext,
      knowledgeContext,
      // Deep research results (optional)
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
      if (deepResearch.companyResearch) {
        deepResearchSection += `\n\n--- 企業IR・中期経営計画 ---\n${deepResearch.companyResearch}`
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

【使用するケーススタディ】
企業名: ${caseStudy?.company_name ?? ''}
解決した課題: ${caseStudy?.challenge_tags?.join(', ') ?? ''}
成果: ${caseStudy?.result_summary ?? ''}

【提供するソリューション】
クライアント: ${client?.name ?? ''}
商材: ${client?.product_name ?? ''}
${knowledgeSection}${deepResearchSection}
【差出人情報】
bizmote株式会社
代表取締役 山岡大輔`

    const response = await callClaude({
      model: 'claude-opus-4-20250514',
      system: SYSTEM_PROMPT,
      max_tokens: 4096,
      messages: [
        { role: 'user', content: userPrompt },
      ],
    })

    const rawText = getTextFromResponse(response)

    // Parse JSON response from Claude
    let letter = rawText
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
      // Extract JSON from response (may be wrapped in markdown code block)
      const jsonMatch = rawText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        if (parsed.body_text) {
          letter = parsed.body_text
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

    return NextResponse.json({ letter, sources })
  } catch (error) {
    console.error('Letter generation error:', error)
    return NextResponse.json(
      { error: '手紙の生成に失敗しました' },
      { status: 500 }
    )
  }
}
