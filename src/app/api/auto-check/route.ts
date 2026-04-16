import { NextResponse } from 'next/server'
import { callClaude, getTextFromResponse } from '@/lib/anthropic'

export const dynamic = 'force-dynamic'

const SYSTEM_PROMPT = `あなたはBtoB向けパーソナライズド営業手紙の品質レビュアーです。
受け取った手紙本文を以下の4つの観点から厳しくチェックし、各観点ごとに判定とスコアを付けてください。

【チェック観点】
1. fact (事実検証): 本文中の具体的な数値、固有名詞、時制の正確性。情報源と整合しているか
2. tone (トーン): BtoB文書として適切な丁寧さ・プロフェッショナル感・読みやすさ。押し付けがましくないか
3. typo (誤字脱字): 誤字、脱字、不自然な日本語、重複した表現、不適切な敬語
4. why_you (Why You訴求力): なぜ"この企業の、この人"に手紙を書いたのかが明確か。パーソナライズされているか、汎用的すぎないか

【判定区分】
- "pass": 問題なし
- "caution": 軽微な問題あり、確認推奨
- "fail": 重大な問題あり、要修正

【出力フォーマット】
以下のJSONのみを出力してください。説明やコードブロックは不要です。

{
  "checks": [
    {
      "type": "fact",
      "status": "pass" | "caution" | "fail",
      "score": 0-100の整数,
      "summary": "1文での判定要約 (20文字以内)",
      "findings": ["具体的な問題点1", "具体的な問題点2"],
      "suggestion": "改善提案 (問題があれば)"
    },
    { "type": "tone", ... },
    { "type": "typo", ... },
    { "type": "why_you", ... }
  ],
  "overall_score": 0-100の整数 (4観点の加重平均),
  "overall_status": "pass" | "caution" | "fail"
}`

type AutoCheckRequest = {
  letterId: string
  letterBody: string
  hypothesis?: string
  whyYouAngle?: string
  contactCompany: string
  contactName: string
  contactTitle?: string
  sources?: Array<{
    index: number
    fact: string
    source_name: string
    source_url: string
    fetched_at: string
  }>
}

type CheckResult = {
  type: 'fact' | 'tone' | 'typo' | 'why_you'
  status: 'pass' | 'caution' | 'fail'
  score: number
  summary: string
  findings: string[]
  suggestion: string
}

export async function POST(request: Request) {
  try {
    const body: AutoCheckRequest = await request.json()
    const {
      letterBody, hypothesis, whyYouAngle,
      contactCompany, contactName, contactTitle,
      sources,
    } = body

    if (!letterBody) {
      return NextResponse.json({ error: '手紙本文が空です' }, { status: 400 })
    }

    const sourcesText = sources && sources.length > 0
      ? sources.map(s =>
          `[${s.index}] ${s.fact} (出典: ${s.source_name}, ${s.fetched_at})`
        ).join('\n')
      : '(ソース情報なし)'

    const userPrompt = `【宛先】
${contactCompany} ${contactTitle ?? ''} ${contactName} 様

【手紙タイトル/仮説】
${hypothesis ?? '(なし)'}

【Why You訴求切り口】
${whyYouAngle ?? '(なし)'}

【手紙本文】
${letterBody}

【引用ソース】
${sourcesText}

上記の手紙を4観点でチェックし、JSON形式で結果を返してください。`

    const response = await callClaude({
      messages: [{ role: 'user', content: userPrompt }],
      system: SYSTEM_PROMPT,
      max_tokens: 2048,
    })

    const rawText = getTextFromResponse(response)

    let parsed: {
      checks: CheckResult[]
      overall_score: number
      overall_status: 'pass' | 'caution' | 'fail'
    } | null = null

    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0])
      }
    } catch (e) {
      console.error('Auto-check JSON parse error:', e)
    }

    if (!parsed || !Array.isArray(parsed.checks)) {
      return NextResponse.json(
        { error: 'チェック結果の解析に失敗しました', rawText },
        { status: 500 }
      )
    }

    return NextResponse.json(parsed)
  } catch (error) {
    console.error('Auto-check error:', error)
    return NextResponse.json(
      { error: `自動チェックに失敗しました: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    )
  }
}
