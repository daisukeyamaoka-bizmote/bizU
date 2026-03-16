import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function GET() {
  // 1. process.env チェック
  const processEnvKey = process.env.ANTHROPIC_API_KEY

  // 2. Cloudflare context チェック
  let cfEnvKey: string | undefined
  let cfError: string | undefined
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare')
    const { env } = await getCloudflareContext({ async: true })
    cfEnvKey = (env as Record<string, unknown>).ANTHROPIC_API_KEY as string | undefined
  } catch (e) {
    cfError = String(e)
  }

  const apiKey = processEnvKey || cfEnvKey

  return NextResponse.json({
    hasApiKey: !!apiKey,
    keyLength: apiKey?.length ?? 0,
    keyPrefix: apiKey ? apiKey.slice(0, 10) + '...' : 'NOT SET',
    source: processEnvKey ? 'process.env' : cfEnvKey ? 'cloudflare-context' : 'none',
    processEnvAvailable: !!processEnvKey,
    cfEnvAvailable: !!cfEnvKey,
    cfError: cfError ?? null,
  })
}
