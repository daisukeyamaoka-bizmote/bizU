import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SYSTEM_PROMPT = `あなたはBtoB営業のプロフェッショナルです。
日本の大手企業の役員に送る、高反応率のパーソナライズ手紙を作成します。

【出力フォーマット】
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
- 数値・固有名詞は具体的に
- 営業感を出さず、課題解決の文脈で書く
- 手紙本文のみを出力し、説明や注釈は一切付けない

【重要】
提供されたナレッジ情報がある場合、その内容を活用して手紙の説得力を高めてください。
- プロダクト情報 → ソリューションの具体的な説明に活用
- 導入事例 → 最も宛先企業に近い業種・課題の事例を選んで使用
- 営業資料 → 説得力のあるフレーズや数値を活用
- 市場動向 → 課題仮説の裏付けに活用`

export async function POST(request: Request) {
  try {
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    })
    const body = await request.json()
    const { contact, client, caseStudy, whyYouAngle, sendTrigger, collectedContext, knowledgeContext } = body

    let knowledgeSection = ''
    if (knowledgeContext && knowledgeContext.length > 0) {
      knowledgeSection = `\n\n【ナレッジベース（以下の情報を活用して手紙を作成）】\n`
      for (const k of knowledgeContext) {
        knowledgeSection += `\n--- ${k.category}: ${k.title} ---\n${k.content}\n`
      }
    }

    const userPrompt = `【宛先情報】
会社名: ${contact.company_name}
部署: ${contact.department ?? ''}
役職: ${contact.title ?? ''}
氏名: ${contact.full_name}

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
${knowledgeSection}
【差出人情報】
bizmote株式会社
代表取締役 山岡大輔`

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: userPrompt },
      ],
    })

    const letter = message.content[0].type === 'text' ? message.content[0].text : ''

    return NextResponse.json({ letter })
  } catch (error) {
    console.error('Letter generation error:', error)
    return NextResponse.json(
      { error: '手紙の生成に失敗しました' },
      { status: 500 }
    )
  }
}
