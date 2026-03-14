import { NextResponse } from 'next/server'
import { callClaude, getTextFromResponse } from '@/lib/anthropic'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SYSTEM_PROMPT = `あなたはBtoB営業手紙のファクトチェッカーです。
手紙本文と、本文中で使用されている事実情報（ソース）のリストを受け取り、各事実を検証します。

【出力フォーマット】
以下のJSON配列のみを出力してください。説明やコードブロックは不要です。

[
  {
    "index": 1,
    "verdict": "ok" | "caution" | "ng",
    "reason": "判定理由（日本語で1-2文）",
    "suggestion": "修正提案（verdictがcautionまたはngの場合のみ）"
  }
]

【判定基準】
- "ok": 事実として妥当。具体的な数値や固有名詞が情報源と整合している
- "caution": 要確認。数値が古い可能性がある、出典が不明確、文脈的に誤解を招く可能性がある
- "ng": 明らかに不正確。数値の誤り、存在しない事実、誇張表現、事実と異なる記述

【チェック観点】
1. 数値の妥当性（売上・従業員数・成長率などが極端でないか）
2. 固有名詞の正確性（企業名・人名・製品名の表記ゆれ）
3. 時制の整合性（過去の事実を現在形で述べていないか）
4. 因果関係の飛躍（事実から導かれない結論を述べていないか）
5. ケーススタディの数値の妥当性（非現実的な成果を謳っていないか）
6. 情報の鮮度（fetched_atが古い場合、状況が変わっている可能性）`

type FactCheckRequest = {
  letterBody: string
  sources: Array<{
    index: number
    fact: string
    source_name: string
    source_url: string
    fetched_at: string
  }>
  contactCompany: string
  contactName: string
}

export async function POST(request: Request) {
  try {
    const body: FactCheckRequest = await request.json()
    const { letterBody, sources, contactCompany, contactName } = body

    if (!letterBody || !sources || sources.length === 0) {
      return NextResponse.json({ results: [] })
    }

    const sourcesText = sources.map(s =>
      `[${s.index}] 事実: ${s.fact}\n    ソース: ${s.source_name}\n    URL: ${s.source_url || 'なし'}\n    取得日: ${s.fetched_at}`
    ).join('\n\n')

    const userPrompt = `【手紙の宛先】
${contactCompany} ${contactName} 様

【手紙本文】
${letterBody}

【検証対象のソース一覧】
${sourcesText}

上記の各ソースについてファクトチェックを行い、JSON配列で結果を返してください。`

    const response = await callClaude({
      // ファクトチェックはSonnetで十分（高速・低コスト）
      messages: [
        { role: 'user', content: userPrompt },
      ],
      system: SYSTEM_PROMPT,
      max_tokens: 2048,
    })

    const rawText = getTextFromResponse(response)

    let results: Array<{
      index: number
      verdict: 'ok' | 'caution' | 'ng'
      reason: string
      suggestion: string
    }> = []

    try {
      const jsonMatch = rawText.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        results = JSON.parse(jsonMatch[0])
      }
    } catch {
      // パース失敗時は空配列
    }

    return NextResponse.json({ results })
  } catch (error) {
    console.error('Fact check error:', error)
    return NextResponse.json(
      { error: 'ファクトチェックに失敗しました' },
      { status: 500 }
    )
  }
}
