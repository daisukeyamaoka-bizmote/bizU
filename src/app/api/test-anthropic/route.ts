import { NextResponse } from 'next/server'
import { getAnthropicApiKey } from '@/lib/anthropic'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

export async function GET() {
  const steps: Record<string, unknown> = {}

  // Step 1: APIキー取得
  let apiKey = ''
  try {
    apiKey = await getAnthropicApiKey()
    steps.step1_apiKey = {
      ok: true,
      length: apiKey.length,
      prefix: apiKey.slice(0, 12) + '...',
    }
  } catch (e) {
    steps.step1_apiKey = {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    }
    return NextResponse.json(steps)
  }

  // Step 2: Anthropic APIへの最小リクエスト
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 32,
        messages: [{ role: 'user', content: 'Say "hello" in one word.' }],
      }),
    })

    const status = res.status
    const body = await res.text()

    if (!res.ok) {
      steps.step2_apiCall = {
        ok: false,
        status,
        body: body.slice(0, 500),
      }
      return NextResponse.json(steps)
    }

    steps.step2_apiCall = { ok: true, status }

    // Step 3: レスポンスのパース
    try {
      const data = JSON.parse(body)
      const text = data.content?.[0]?.text ?? '(no text)'
      steps.step3_parse = { ok: true, response: text }
    } catch (e) {
      steps.step3_parse = {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        rawBody: body.slice(0, 300),
      }
    }
  } catch (e) {
    steps.step2_apiCall = {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      type: e instanceof Error ? e.constructor.name : typeof e,
    }
  }

  return NextResponse.json(steps)
}
