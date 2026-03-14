import { NextResponse } from 'next/server'
import { callClaude, getTextFromResponse } from '@/lib/anthropic'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

const EXTRACTION_PROMPT = `以下のテキストから、BtoB営業で使えるケーススタディ情報を抽出してください。

必ず以下のJSON形式で出力してください。JSONのみを出力し、他のテキストは一切含めないでください。
複数のケーススタディが含まれる場合は配列で返してください。

{
  "case_studies": [
    {
      "company_name": "事例企業名（例: 西松屋チェーン）",
      "industry": "業種（以下から選択: 製造/商社/小売/HR Tech/物流/建設/金融/IT/食品/その他）",
      "challenge_tags": ["課題タグ1", "課題タグ2"],
      "result_summary": "効果・成果の要約（数値を含める。例: 面接工数60%削減）",
      "recommended_roles": ["推奨役職1", "推奨役職2"],
      "recommended_industries": ["推奨業種1", "推奨業種2"]
    }
  ]
}

課題タグは以下から選ぶか、適切なものを新規作成してください:
採用工数削減/面接品質向上/内定辞退防止/面接標準化/候補者体験向上/録画面接導入/遠隔地採用強化/AI分析活用/採用精度向上/現場負担軽減/技術者採用強化/採用ブランディング/離職率改善/オンボーディング改善/コスト削減/DX推進/業務効率化

推奨役職は以下から選んでください:
取締役/執行役員/部長/課長/マネージャー/CHRO/人事部長

推奨業種は以下から選んでください:
製造/商社/小売/HR Tech/物流/建設/金融/IT/食品/その他`

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get('content-type') ?? ''

    let textContent = ''
    let sourceType = ''

    if (contentType.includes('application/json')) {
      const { url, text } = await request.json()

      if (text) {
        textContent = text
        sourceType = 'file'
      } else if (url) {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 bizU CaseStudy Extractor' },
        })
        if (!res.ok) {
          return NextResponse.json({ error: 'URLの取得に失敗しました' }, { status: 400 })
        }
        textContent = await res.text()
        textContent = textContent.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        textContent = textContent.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        textContent = textContent.replace(/<[^>]+>/g, ' ')
        textContent = textContent.replace(/\s+/g, ' ').trim()
        textContent = textContent.slice(0, 15000)
        sourceType = 'url'
      }
    } else if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData()
      const file = formData.get('file') as File | null
      if (!file) {
        return NextResponse.json({ error: 'ファイルが見つかりません' }, { status: 400 })
      }

      if (file.type === 'application/pdf') {
        const arrayBuffer = await file.arrayBuffer()
        const bytes = new Uint8Array(arrayBuffer)
        let binary = ''
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i])
        }
        const base64 = btoa(binary)

        const response = await callClaude({
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'document',
                  source: { type: 'base64', media_type: 'application/pdf', data: base64 },
                },
                { type: 'text', text: EXTRACTION_PROMPT },
              ],
            },
          ],
        })

        const responseText = getTextFromResponse(response)
        const jsonMatch = responseText.match(/\{[\s\S]*\}/)
        if (!jsonMatch) {
          return NextResponse.json({ error: '抽出結果の解析に失敗しました' }, { status: 500 })
        }
        return NextResponse.json(JSON.parse(jsonMatch[0]))
      }

      textContent = await file.text()
      textContent = textContent.slice(0, 15000)
      sourceType = 'file'
    }

    if (!textContent) {
      return NextResponse.json({ error: 'テキストが見つかりません' }, { status: 400 })
    }

    const response = await callClaude({
      messages: [
        {
          role: 'user',
          content: `${EXTRACTION_PROMPT}\n\n--- 以下が${sourceType === 'url' ? 'Webページ' : '資料'}のテキストです ---\n\n${textContent}`,
        },
      ],
    })

    const responseText = getTextFromResponse(response)
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({ error: '抽出結果の解析に失敗しました' }, { status: 500 })
    }

    return NextResponse.json(JSON.parse(jsonMatch[0]))
  } catch (error) {
    console.error('Case study extraction error:', error)
    return NextResponse.json(
      { error: 'ケーススタディの抽出に失敗しました' },
      { status: 500 }
    )
  }
}
