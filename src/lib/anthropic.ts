const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'

interface AnthropicMessage {
  role: 'user' | 'assistant'
  content: string | Array<{ type: string; [key: string]: unknown }>
}

interface AnthropicResponse {
  content: Array<{ type: string; text?: string }>
}

/** Cloudflare Workers + ローカル両対応のAPIキー取得 */
export async function getAnthropicApiKey(): Promise<string> {
  // 1. process.env（ローカル開発時）
  if (process.env.ANTHROPIC_API_KEY) {
    return process.env.ANTHROPIC_API_KEY
  }

  // 2. Cloudflare Workers環境変数（getCloudflareContext経由）
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare')
    const { env } = await getCloudflareContext({ async: true })
    const key = (env as Record<string, unknown>).ANTHROPIC_API_KEY as string | undefined
    if (key) return key
  } catch {
    // ローカル開発時はgetCloudflareContextが使えない場合がある
  }

  throw new Error('ANTHROPIC_API_KEY が設定されていません')
}

export async function callClaude(options: {
  messages: AnthropicMessage[]
  system?: string
  model?: string
  max_tokens?: number
}): Promise<AnthropicResponse> {
  const apiKey = await getAnthropicApiKey()

  const body: Record<string, unknown> = {
    model: options.model ?? 'claude-sonnet-4-20250514',
    max_tokens: options.max_tokens ?? 4096,
    messages: options.messages,
  }
  if (options.system) {
    body.system = options.system
  }

  return fetchWithRetry(apiKey, body) as Promise<AnthropicResponse>
}

export function getTextFromResponse(response: AnthropicResponse): string {
  const textBlock = response.content.find(c => c.type === 'text')
  return textBlock?.text ?? ''
}

/** 429レート制限時に指数バックオフでリトライ */
async function fetchWithRetry(
  apiKey: string,
  body: Record<string, unknown>,
  maxRetries = 4,
): Promise<unknown> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    })

    if (res.ok) {
      return res.json()
    }

    if (res.status === 429 && attempt < maxRetries) {
      const retryAfter = res.headers.get('retry-after')
      const waitMs = retryAfter
        ? parseInt(retryAfter, 10) * 1000
        : Math.min(2000 * Math.pow(2, attempt), 60000)
      console.log(`[anthropic] Rate limited, retrying in ${waitMs}ms (attempt ${attempt + 1}/${maxRetries})`)
      await new Promise(resolve => setTimeout(resolve, waitMs))
      continue
    }

    const errorBody = await res.text()
    throw new Error(`Anthropic API error (${res.status}): ${errorBody}`)
  }

  throw new Error('Anthropic API: max retries exceeded')
}
