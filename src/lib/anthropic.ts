const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'

interface AnthropicMessage {
  role: 'user' | 'assistant'
  content: string | Array<{ type: string; [key: string]: unknown }>
}

interface AnthropicResponse {
  content: Array<{ type: string; text?: string }>
}

async function fetchWithProxy(url: string, init: RequestInit): Promise<Response> {
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy
  if (proxy) {
    // Use undici with proxy only in Node.js environments (local dev)
    try {
      const { ProxyAgent, fetch: undiFetch } = await import('undici')
      const dispatcher = new ProxyAgent(proxy)
      return undiFetch(url, { ...init, dispatcher }) as unknown as Response
    } catch {
      // undici not available, fall through to native fetch
    }
  }
  return fetch(url, init)
}

export async function callClaude(options: {
  messages: AnthropicMessage[]
  system?: string
  model?: string
  max_tokens?: number
}): Promise<AnthropicResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY が設定されていません。デプロイ環境の環境変数を確認してください。')
  }

  const body: Record<string, unknown> = {
    model: options.model ?? 'claude-sonnet-4-20250514',
    max_tokens: options.max_tokens ?? 4096,
    messages: options.messages,
  }
  if (options.system) {
    body.system = options.system
  }

  const res = await fetchWithProxy(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
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
