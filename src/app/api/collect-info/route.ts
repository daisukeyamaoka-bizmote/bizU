import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const { companyName } = await request.json()
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY が設定されていません')
    }

    // Anthropic Web Search Tool を使ってリアルタイム情報を取得
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
        tools: [
          {
            type: 'web_search_20250305',
            name: 'web_search',
            max_uses: 3,
          },
        ],
        messages: [
          {
            role: 'user',
            content: `以下の日本企業について、BtoB営業に役立つ **最新** の情報をWebで検索して簡潔にまとめてください。
企業名: ${companyName}

以下の観点で情報を箇条書きで提供してください:
- 直近のIR・決算情報（売上・利益・成長率など）
- 採用動向（大量採用、新卒強化、DX人材募集など）
- 新規事業・組織変更・M&A
- 業界内でのポジション・競合状況
- その他、手紙作成に有用な最新ニュース

各項目は1-2行で簡潔に。情報がない項目はスキップしてください。
必ずWebで検索してから回答してください。`,
          },
        ],
      }),
    })

    if (!res.ok) {
      const errorBody = await res.text()
      throw new Error(`Anthropic API error (${res.status}): ${errorBody}`)
    }

    const data = await res.json()

    // テキストブロックを抽出（web_search_tool_resultブロックはスキップ）
    const textBlocks = (data.content ?? [])
      .filter((c: { type: string }) => c.type === 'text')
      .map((c: { text: string }) => c.text)
    const context = textBlocks.join('\n') || '情報を取得できませんでした。'

    return NextResponse.json({ context })
  } catch (error) {
    console.error('Info collection error:', error)
    return NextResponse.json(
      { error: '情報収集に失敗しました' },
      { status: 500 }
    )
  }
}
