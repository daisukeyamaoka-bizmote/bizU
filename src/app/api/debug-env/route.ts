import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function GET() {
  const apiKey = process.env.ANTHROPIC_API_KEY
  return NextResponse.json({
    hasApiKey: !!apiKey,
    keyLength: apiKey?.length ?? 0,
    keyPrefix: apiKey ? apiKey.slice(0, 10) + '...' : 'NOT SET',
    runtime: 'edge',
    nodeVersion: typeof process !== 'undefined' ? process.version : 'N/A',
    bufferAvailable: typeof Buffer !== 'undefined',
  })
}
