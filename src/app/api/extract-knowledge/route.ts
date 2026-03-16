import { NextResponse } from 'next/server'
import { callClaude, getTextFromResponse } from '@/lib/anthropic'
import * as XLSX from 'xlsx'
import mammoth from 'mammoth'

export const dynamic = 'force-dynamic'

const EXTRACTION_PROMPT = `以下のテキストから、BtoB営業に活用できるナレッジ情報を抽出してください。

必ず以下のJSON形式で出力してください。JSONのみを出力し、他のテキストは一切含めないでください。

{
  "items": [
    {
      "category": "カテゴリ（以下から選択: product_info / case_study / sales_material / competitor / market / other）",
      "title": "簡潔なタイトル（例: harutaka製品概要、西松屋チェーン導入事例）",
      "content": "営業に使える形に整理した内容（300〜500文字）。数値・固有名詞を含め具体的に。",
      "tags": ["タグ1", "タグ2", "..."],
      "case_study": null
    }
  ]
}

カテゴリの説明:
- product_info: プロダクト/サービスの概要、特徴、強み
- case_study: 導入事例（企業名・課題・成果を含む）
- sales_material: 営業トーク、提案書、FAQ等の営業支援情報
- competitor: 競合情報、差別化ポイント
- market: 市場動向、業界トレンド
- other: その他

【タグ生成ルール】
tagsには以下の3種類を全て含めてください:
1. 一般タグ: 内容を表すキーワード（例: "面接", "AI", "録画選考"）
2. 訴求軸タグ: 営業で使える訴求の切り口（例: "訴求:コスト削減", "訴求:工数削減", "訴求:品質向上", "訴求:標準化", "訴求:データ活用", "訴求:DX推進"）
3. 事例タグ（case_studyカテゴリの場合のみ）:
   - ASIS（導入前の課題）: "ASIS:面接の属人化", "ASIS:選考リードタイム長い", "ASIS:面接官の負荷大"
   - TOBE（導入後の姿）: "TOBE:面接データ可視化", "TOBE:選考期間短縮", "TOBE:AI要約で工数削減"
   - 成果数値: "成果:合格率30%向上", "成果:選考期間2ヶ月短縮"

case_studyカテゴリの場合は、case_studyフィールドに以下の形式で情報を追加:
{
  "company_name": "事例企業名",
  "industry": "業種（製造/商社/小売/HR Tech/物流/建設/金融/IT/食品/その他）",
  "challenge_tags": ["課題1", "課題2"],
  "result_summary": "成果要約（数値を含める）"
}

テキスト全体から、営業活動に使える情報をすべて抽出してください。1つのソースから複数のナレッジを抽出してOKです。`

// エクセルファイルからテキストを抽出
function extractTextFromExcel(buffer: ArrayBuffer): string {
  const workbook = XLSX.read(buffer, { type: 'array' })
  const lines: string[] = []

  for (const sheetName of workbook.SheetNames) {
    lines.push(`【シート: ${sheetName}】`)
    const sheet = workbook.Sheets[sheetName]
    const data = XLSX.utils.sheet_to_csv(sheet, { RS: '\n' })
    lines.push(data)
    lines.push('')
  }

  return lines.join('\n')
}

// Word(.docx)ファイルからテキストを抽出
async function extractTextFromDocx(buffer: ArrayBuffer): Promise<string> {
  const result = await mammoth.extractRawText({ arrayBuffer: buffer })
  return result.value
}

// パワポ(.pptx)ファイルからテキストを抽出
async function extractTextFromPptx(buffer: ArrayBuffer): Promise<string> {
  const JSZip = (await import('jszip')).default
  const zip = await JSZip.loadAsync(buffer)
  const lines: string[] = []
  let slideNum = 1

  const slideFiles = Object.keys(zip.files)
    .filter(name => name.match(/ppt\/slides\/slide\d+\.xml/))
    .sort()

  for (const fileName of slideFiles) {
    const content = await zip.files[fileName].async('string')
    const texts = content.match(/<a:t>([^<]*)<\/a:t>/g)
    if (texts) {
      lines.push(`【スライド ${slideNum}】`)
      const slideTexts = texts.map(t => t.replace(/<\/?a:t>/g, ''))
      lines.push(slideTexts.join(' '))
      lines.push('')
    }
    slideNum++
  }

  return lines.join('\n')
}

// HTMLからテキストを抽出
function htmlToText(html: string): string {
  let text = html
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
  text = text.replace(/<[^>]+>/g, ' ')
  text = text.replace(/\s+/g, ' ').trim()
  return text
}

// HTMLからリンクを抽出
function extractLinks(html: string, baseUrl: string): string[] {
  const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>/gi
  const links: string[] = []
  let match

  while ((match = linkRegex.exec(html)) !== null) {
    try {
      const href = match[1]
      // Skip anchors, mailto, tel, javascript
      if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) continue

      const absoluteUrl = new URL(href, baseUrl).href
      // Only include same-domain links
      const base = new URL(baseUrl)
      const target = new URL(absoluteUrl)
      if (target.hostname === base.hostname) {
        links.push(absoluteUrl)
      }
    } catch {
      // Invalid URL, skip
    }
  }

  return [...new Set(links)]
}

// Deep crawl: fetch child pages from a parent URL
async function deepCrawlUrl(parentUrl: string): Promise<{ url: string; text: string }[]> {
  const results: { url: string; text: string }[] = []

  // Fetch parent page
  const parentRes = await fetch(parentUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 bizU Knowledge Extractor' },
  })
  if (!parentRes.ok) return results

  const parentHtml = await parentRes.text()
  const parentText = htmlToText(parentHtml)
  results.push({ url: parentUrl, text: parentText.slice(0, 15000) })

  // Extract child links
  const links = extractLinks(parentHtml, parentUrl)

  // Filter to likely child/detail pages (same path prefix or interview/case patterns)
  const parentPath = new URL(parentUrl).pathname
  const childLinks = links.filter(link => {
    try {
      const linkPath = new URL(link).pathname
      // Child page: starts with parent path and is deeper
      if (linkPath.startsWith(parentPath) && linkPath !== parentPath && linkPath.length > parentPath.length) return true
      // Common case study / interview patterns
      if (/\/(case|interview|story|voice|example|jirei|jisseki|dounyuu)/i.test(linkPath)) return true
      return false
    } catch {
      return false
    }
  })

  // Limit to 10 child pages to avoid excessive requests
  const limitedLinks = childLinks.slice(0, 10)

  for (const childUrl of limitedLinks) {
    try {
      const childRes = await fetch(childUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 bizU Knowledge Extractor' },
      })
      if (!childRes.ok) continue

      const childHtml = await childRes.text()
      const childText = htmlToText(childHtml)

      if (childText.length > 100) {
        results.push({ url: childUrl, text: childText.slice(0, 15000) })
      }
    } catch {
      // Skip failed child pages
    }
  }

  return results
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get('content-type') ?? ''

    let textContent = ''
    let sourceName = ''
    let sourceType: 'url' | 'pdf' | 'file' = 'file'

    if (contentType.includes('application/json')) {
      const { url, text, name, deepCrawl: enableDeepCrawl } = await request.json()

      if (text) {
        textContent = text
        sourceName = name ?? 'テキスト入力'
        sourceType = 'file'
      } else if (url) {
        // Deep crawl: fetch parent page + child pages
        if (enableDeepCrawl) {
          const crawledPages = await deepCrawlUrl(url)
          if (crawledPages.length === 0) {
            return NextResponse.json({ error: 'URLの取得に失敗しました' }, { status: 400 })
          }

          // Combine all crawled content
          const allText = crawledPages.map((p, i) =>
            `\n\n=== ページ${i + 1}: ${p.url} ===\n${p.text}`
          ).join('\n')

          // Truncate combined text to 40KB for larger context
          textContent = allText.slice(0, 40000)
          sourceName = url
          sourceType = 'url'

          // Use larger model with more context for deep crawl
          const response = await callClaude({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 8192,
            messages: [
              {
                role: 'user',
                content: `${EXTRACTION_PROMPT}\n\n--- 以下は${crawledPages.length}ページ分のソーステキストです ---\n\n${textContent}`,
              },
            ],
          })

          const responseText = getTextFromResponse(response)
          const jsonMatch = responseText.match(/\{[\s\S]*\}/)
          if (!jsonMatch) {
            return NextResponse.json({ error: '抽出結果の解析に失敗しました' }, { status: 500 })
          }

          const result = JSON.parse(jsonMatch[0])
          return NextResponse.json({
            ...result,
            source_type: sourceType,
            source_name: sourceName,
            crawled_pages: crawledPages.length,
          })
        }

        // Normal single-page fetch
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 bizU Knowledge Extractor' },
        })
        if (!res.ok) {
          return NextResponse.json({ error: 'URLの取得に失敗しました' }, { status: 400 })
        }
        textContent = await res.text()
        textContent = htmlToText(textContent)
        textContent = textContent.slice(0, 15000)
        sourceName = url
        sourceType = 'url'
      }
    } else if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData()
      const file = formData.get('file') as File | null
      if (!file) {
        return NextResponse.json({ error: 'ファイルが見つかりません' }, { status: 400 })
      }
      sourceName = file.name
      const arrayBuffer = await file.arrayBuffer()
      const ext = file.name.split('.').pop()?.toLowerCase()

      // PDF → Claude API で直接読み取り
      if (file.type === 'application/pdf' || ext === 'pdf') {
        const base64 = Buffer.from(arrayBuffer).toString('base64')

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
        const result = JSON.parse(jsonMatch[0])
        return NextResponse.json({ ...result, source_type: 'pdf', source_name: sourceName })
      }

      // エクセル (.xlsx, .xls)
      if (ext === 'xlsx' || ext === 'xls' ||
          file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
          file.type === 'application/vnd.ms-excel') {
        textContent = extractTextFromExcel(arrayBuffer)
        textContent = textContent.slice(0, 15000)
        sourceType = 'file'
      }
      // ワード (.docx)
      else if (ext === 'docx' ||
               file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        textContent = await extractTextFromDocx(arrayBuffer)
        textContent = textContent.slice(0, 15000)
        sourceType = 'file'
      }
      // パワポ (.pptx)
      else if (ext === 'pptx' ||
               file.type === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') {
        textContent = await extractTextFromPptx(arrayBuffer)
        textContent = textContent.slice(0, 15000)
        sourceType = 'file'
      }
      // テキスト系 (.txt, .csv, .md)
      else {
        textContent = await file.text()
        textContent = textContent.slice(0, 15000)
        sourceType = 'file'
      }
    }

    if (!textContent) {
      return NextResponse.json({ error: 'テキストが見つかりません' }, { status: 400 })
    }

    const response = await callClaude({
      messages: [
        {
          role: 'user',
          content: `${EXTRACTION_PROMPT}\n\n--- 以下がソースのテキストです ---\n\n${textContent}`,
        },
      ],
    })

    const responseText = getTextFromResponse(response)
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({ error: '抽出結果の解析に失敗しました' }, { status: 500 })
    }

    const result = JSON.parse(jsonMatch[0])
    return NextResponse.json({
      ...result,
      source_type: sourceType,
      source_name: sourceName,
    })
  } catch (error) {
    console.error('Knowledge extraction error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: `ナレッジの抽出に失敗しました: ${message}` }, { status: 500 })
  }
}
