import { NextResponse } from 'next/server'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

export async function GET() {
  const steps: Record<string, unknown> = {}

  // Step 1: process.env でAPIキー取得
  const keyFromEnv = process.env.ANTHROPIC_API_KEY
  steps.step1_processEnv = keyFromEnv
    ? { ok: true, length: keyFromEnv.length, prefix: keyFromEnv.slice(0, 12) }
    : { ok: false, error: 'process.env.ANTHROPIC_API_KEY is empty' }

  // Step 2: getCloudflareContext でAPIキー取得
  let keyFromCf = ''
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare')
    const ctx = await getCloudflareContext({ async: true })
    const env = ctx.env as Record<string, string>
    keyFromCf = env.ANTHROPIC_API_KEY ?? ''
    steps.step2_cloudflareCtx = keyFromCf
      ? { ok: true, length: keyFromCf.length, prefix: keyFromCf.slice(0, 12) }
      : { ok: false, error: 'ANTHROPIC_API_KEY not in cloudflare env', availableKeys: Object.keys(env).slice(0, 10) }
  } catch (e) {
    steps.step2_cloudflareCtx = { ok: false, error: String(e) }
  }

  const apiKey = keyFromEnv || keyFromCf
  if (!apiKey) {
    steps.step3_apiCall = { skipped: true, reason: 'No API key found' }
    return NextResponse.json(steps)
  }

  // Step 3: Anthropic APIへ最小リクエスト
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
        max_tokens: 16,
        messages: [{ role: 'user', content: 'Say hi' }],
      }),
    })

    const body = await res.text()
    steps.step3_apiCall = res.ok
      ? { ok: true, status: res.status, response: body.slice(0, 200) }
      : { ok: false, status: res.status, error: body.slice(0, 500) }
  } catch (e) {
    steps.step3_apiCall = { ok: false, error: String(e) }
  }

  return NextResponse.json(steps)
}
