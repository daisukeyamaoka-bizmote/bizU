import { NextResponse } from 'next/server'
import { callClaude, getTextFromResponse } from '@/lib/anthropic'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const { companyName } = await request.json()

    const response = await callClaude({
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `以下の日本企業について、BtoB営業に役立つ直近の情報を簡潔にまとめてください。
企業名: ${companyName}

以下の観点で情報を箇条書きで提供してください:
- 直近のIR・決算情報
- 採用動向
- 新規事業・組織変更
- 業界内でのポジション
- その他、手紙作成に有用な情報

各項目は1-2行で簡潔に。情報がない項目はスキップしてください。`,
        },
      ],
    })

    const context = getTextFromResponse(response)

    return NextResponse.json({ context })
  } catch (error) {
    console.error('Info collection error:', error)
    return NextResponse.json(
      { error: '情報収集に失敗しました' },
      { status: 500 }
    )
  }
}
