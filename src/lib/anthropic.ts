import { ProxyAgent, fetch as undiFetch } from 'undici'
import { readFileSync } from 'fs'
import { join } from 'path'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'

interface AnthropicMessage {
  role: 'user' | 'assistant'
  content: string | Array<{ type: string; [key: string]: unknown }>
}

interface AnthropicResponse {
  content: Array<{ type: string; text?: string }>
}

// Read API key from .env.local directly as fallback
function getApiKey(): string {
  // Try process.env first
  if (process.env.ANTHROPIC_API_KEY) {
    return process.env.ANTHROPIC_API_KEY
  }

  // Fallback: read .env.local directly
  try {
    const envPath = join(process.cwd(), '.env.local')
    const content = readFileSync(envPath, 'utf-8')
    const match = content.match(/^ANTHROPIC_API_KEY=(.+)$/m)
    if (match) {
      return match[1].trim()
    }
  } catch {
    // ignore
  }

  throw new Error('ANTHROPIC_API_KEY が設定されていません。.env.local を確認してください。')
}

function getDispatcher() {
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy
  if (proxy) {
    return new ProxyAgent(proxy)
  }
  return undefined
}

export async function callClaude(options: {
  messages: AnthropicMessage[]
  system?: string
  model?: string
  max_tokens?: number
}): Promise<AnthropicResponse> {
  const apiKey = getApiKey()

  const body: Record<string, unknown> = {
    model: options.model ?? 'claude-sonnet-4-20250514',
    max_tokens: options.max_tokens ?? 4096,
    messages: options.messages,
  }
  if (options.system) {
    body.system = options.system
  }

  const dispatcher = getDispatcher()

  const res = await undiFetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
    ...(dispatcher ? { dispatcher } : {}),
  })

  if (!res.ok) {
    const errorBody = await res.text()
    throw new Error(`Anthropic API error (${res.status}): ${errorBody}`)
  }

  return res.json() as Promise<AnthropicResponse>
}

export function getTextFromResponse(response: AnthropicResponse): string {
  const textBlock = response.content.find(c => c.type === 'text')
  return textBlock?.text ?? ''
}
