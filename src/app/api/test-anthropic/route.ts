import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const steps: Record<string, unknown> = {}

  // Step 1: process.env
  const keyFromEnv = process.env.ANTHROPIC_API_KEY
  steps.step1_processEnv = keyFromEnv
    ? { ok: true, length: keyFromEnv.length, prefix: keyFromEnv.slice(0, 12) }
    : { ok: false }

  // Step 2: getCloudflareContext
  let keyFromCf = ''
  try {
    const mod = await import('@opennextjs/cloudflare')
    const ctx = await mod.getCloudflareContext({ async: true })
    const env = ctx.env as Record<string, string>
    keyFromCf = env.ANTHROPIC_API_KEY ?? ''
    steps.step2_cfContext = keyFromCf
      ? { ok: true, length: keyFromCf.length, prefix: keyFromCf.slice(0, 12) }
      : { ok: false, availableKeys: Object.keys(env) }
  } catch (e) {
    steps.step2_cfContext = { ok: false, error: String(e) }
  }

  const apiKey = keyFromEnv || keyFromCf
  if (!apiKey) {
    steps.step3_apiCall = { skipped: true, reason: 'No API key' }
    return NextResponse.json(steps)
  }

  // Step 3: Anthropic API呼び出し
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
    steps.step3_apiCall = { ok: res.ok, status: res.status, body: body.slice(0, 300) }
  } catch (e) {
    steps.step3_apiCall = { ok: false, error: String(e) }
  }

  return NextResponse.json(steps)
}
