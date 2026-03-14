import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const EXTRACTION_PROMPT = `以下のテキストから、BtoB営業に活用できるナレッジ情報を抽出してください。

必ず以下のJSON形式で出力してください。JSONのみを出力し、他のテキストは一切含めないでください。

{
  "items": [
    {
      "category": "カテゴリ（以下から選択: product_info / case_study / sales_material / competitor / market / other）",
      "title": "簡潔なタイトル（例: harutaka製品概要、西松屋チェーン導入事例）",
      "content": "営業に使える形に整理した内容（300〜500文字）。数値・固有名詞を含め具体的に。",
      "tags": ["タグ1", "タグ2"],
      "case_study": null
    }
  ]
}

カテゴリの説明:
- product_info: プロダクト/サービスの概要、特徴、強み
- case_study: 導入事例（企業名・課題・成果を含む）
- sales_material: 営業トーク、提案書、FAQ等の営業支援情報
- competitor: 競合情報、差別化ポイント
- market: 市場動向、業界トレンド
- other: その他

case_studyカテゴリの場合は、case_studyフィールドに以下の形式で情報を追加:
{
  "company_name": "事例企業名",
  "industry": "業種（製造/商社/小売/HR Tech/物流/建設/金融/IT/食品/その他）",
  "challenge_tags": ["課題1", "課題2"],
  "result_summary": "成果要約（数値を含める）"
}

テキスト全体から、営業活動に使える情報をすべて抽出してください。1つのソースから複数のナレッジを抽出してOKです。`

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get('content-type') ?? ''

    let textContent = ''
    let sourceName = ''
    let sourceType: 'url' | 'pdf' | 'file' = 'file'

    if (contentType.includes('application/json')) {
      const { url, text, name } = await request.json()

      if (text) {
        textContent = text
        sourceName = name ?? 'テキスト入力'
        sourceType = 'file'
      } else if (url) {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 bizU Knowledge Extractor' },
        })
        if (!res.ok) {
          return NextResponse.json({ error: 'URLの取得に失敗しました' }, { status: 400 })
        }
        textContent = await res.text()
        textContent = textContent.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        textContent = textContent.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        textContent = textContent.replace(/<[^>]+>/g, ' ')
        textContent = textContent.replace(/\s+/g, ' ').trim()
        textContent = textContent.slice(0, 15000)
        sourceName = url
        sourceType = 'url'
      }
    } else if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData()
      const file = formData.get('file') as File | null
      if (!file) {
        return NextResponse.json({ error: 'ファイルが見つかりません' }, { status: 400 })
      }
      sourceName = file.name

      if (file.type === 'application/pdf') {
        const arrayBuffer = await file.arrayBuffer()
        const base64 = Buffer.from(arrayBuffer).toString('base64')

        const message = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4096,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'document',
                  source: { type: 'base64', media_type: 'application/pdf', data: base64 },
                },
                { type: 'text', text: EXTRACTION_PROMPT },
              ],
            },
          ],
        })

        const responseText = message.content[0].type === 'text' ? message.content[0].text : ''
        const jsonMatch = responseText.match(/\{[\s\S]*\}/)
        if (!jsonMatch) {
          return NextResponse.json({ error: '抽出結果の解析に失敗しました' }, { status: 500 })
        }
        const result = JSON.parse(jsonMatch[0])
        return NextResponse.json({
          ...result,
          source_type: 'pdf',
          source_name: sourceName,
        })
      }

      textContent = await file.text()
      textContent = textContent.slice(0, 15000)
      sourceType = 'file'
    }

    if (!textContent) {
      return NextResponse.json({ error: 'テキストが見つかりません' }, { status: 400 })
    }

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: `${EXTRACTION_PROMPT}\n\n--- 以下がソースのテキストです ---\n\n${textContent}`,
        },
      ],
    })

    const responseText = message.content[0].type === 'text' ? message.content[0].text : ''
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({ error: '抽出結果の解析に失敗しました' }, { status: 500 })
    }

    const result = JSON.parse(jsonMatch[0])
    return NextResponse.json({
      ...result,
      source_type: sourceType,
      source_name: sourceName,
    })
  } catch (error) {
    console.error('Knowledge extraction error:', error)
    return NextResponse.json({ error: 'ナレッジの抽出に失敗しました' }, { status: 500 })
  }
}
