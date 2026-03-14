import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

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
- 手紙本文のみを出力し、説明や注釈は一切付けない`

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { contact, client, caseStudy, whyYouAngle, sendTrigger, collectedContext } = body

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
