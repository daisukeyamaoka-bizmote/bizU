import { NextResponse } from 'next/server'
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  UnderlineType,
} from 'docx'

export const runtime = 'nodejs'

// A4 page dimensions in DXA
const PAGE_WIDTH = 11906
const PAGE_HEIGHT = 16838
const MARGIN = 720

// Font settings
const FONT = '游明朝'
const BODY_SIZE = 21   // 10.5pt
const TITLE_SIZE = 28  // 14pt
const LINE_SPACING = 420
const FIRST_LINE_INDENT = 420

export async function POST(request: Request) {
  try {
    const { contact, clientName, bodyText, title, letterId } = await request.json()

    // If letterId is provided, check approval status
    if (letterId) {
      const { createClient } = await import('@/lib/supabase/server')
      const supabase = await createClient()
      const { data: letter } = await supabase
        .from('letters')
        .select('is_approved')
        .eq('id', letterId)
        .single()

      if (letter && !letter.is_approved) {
        return NextResponse.json(
          { error: '承認が必要です。ファクトチェック画面で承認してからダウンロードしてください。' },
          { status: 403 }
        )
      }
    }

    const now = new Date()
    const dateStr = `${now.getFullYear()}年${now.getMonth() + 1}月吉日`

    // Remove source markers [①][②] etc. from body text
    const cleanBody = bodyText.replace(/\[①\]|\[②\]|\[③\]|\[④\]|\[⑤\]|\[⑥\]|\[⑦\]|\[⑧\]|\[⑨\]|\[⑩\]/g, '')

    // Split body into paragraphs
    const paragraphs = cleanBody.split('\n').filter((p: string) => p.trim())

    // Build body paragraph elements with proper formatting
    const bodyParagraphs: Paragraph[] = []
    for (const p of paragraphs) {
      const trimmed = p.trim()

      // Handle 敬具 (right-aligned)
      if (trimmed === '敬具') {
        bodyParagraphs.push(
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({ text: '敬具', font: FONT, size: BODY_SIZE }),
            ],
            spacing: { line: LINE_SPACING },
          })
        )
        continue
      }

      // Handle 事例タイトル行 (■ prefix = bold)
      if (trimmed.startsWith('■')) {
        bodyParagraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text: trimmed,
                font: FONT,
                size: BODY_SIZE,
                bold: true,
              }),
            ],
            spacing: { line: LINE_SPACING },
          })
        )
        continue
      }

      // Handle 挨拶行 (拝啓 - no indent)
      if (trimmed.startsWith('拝啓')) {
        bodyParagraphs.push(
          new Paragraph({
            children: [
              new TextRun({ text: trimmed, font: FONT, size: BODY_SIZE }),
            ],
            spacing: { line: LINE_SPACING },
          })
        )
        continue
      }

      // Handle CTA行 (つきましては - no indent)
      if (trimmed.startsWith('つきましては')) {
        bodyParagraphs.push(
          new Paragraph({
            children: [
              new TextRun({ text: trimmed, font: FONT, size: BODY_SIZE }),
            ],
            spacing: { line: LINE_SPACING },
          })
        )
        continue
      }

      // Regular body paragraph with first-line indent
      bodyParagraphs.push(
        new Paragraph({
          indent: { firstLine: FIRST_LINE_INDENT },
          children: [
            new TextRun({ text: trimmed, font: FONT, size: BODY_SIZE }),
          ],
          spacing: { line: LINE_SPACING },
        })
      )
    }

    // Build document with ABM format specification
    const children: Paragraph[] = [
      // Date (right-aligned): YYYY年M月吉日
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [
          new TextRun({ text: dateStr, font: FONT, size: BODY_SIZE }),
        ],
      }),
      // Recipient: Company name
      new Paragraph({
        children: [
          new TextRun({ text: contact.company_name ?? '', font: FONT, size: BODY_SIZE }),
        ],
      }),
    ]

    // Recipient: Department + Title
    if (contact.department) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: contact.department, font: FONT, size: BODY_SIZE }),
          ],
        })
      )
    }

    // Recipient: Title + Name 様
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `${contact.title ?? ''} ${contact.full_name ?? ''} 様`.trim(),
            font: FONT,
            size: BODY_SIZE,
          }),
        ],
      })
    )

    // Empty line
    children.push(new Paragraph({ children: [] }))

    // Sender (right-aligned): Company name
    children.push(
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [
          new TextRun({ text: 'bizmote株式会社', font: FONT, size: BODY_SIZE }),
        ],
      })
    )

    // Sender (right-aligned): Representative
    children.push(
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [
          new TextRun({ text: '代表取締役 山岡大輔', font: FONT, size: BODY_SIZE }),
        ],
      })
    )

    // Empty line
    children.push(new Paragraph({ children: [] }))

    // Title (centered, 14pt, thick underline)
    if (title) {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({
              text: title,
              font: FONT,
              size: TITLE_SIZE,
              underline: { type: UnderlineType.THICK },
            }),
          ],
        })
      )
      // Empty line after title
      children.push(new Paragraph({ children: [] }))
    }

    // Body paragraphs
    children.push(...bodyParagraphs)

    // Empty lines before contact info
    children.push(new Paragraph({ children: [] }))
    children.push(new Paragraph({ children: [] }))

    // Contact information (4 lines)
    const contactInfo = [
      '【お問い合わせ先】',
      'bizmote株式会社　代表取締役 山岡大輔',
      'TEL: 090-8349-3739 / Email: d.yamaoka@bizmote.co.jp',
      '〒150-0043 東京都渋谷区道玄坂1-2-3',
    ]
    for (const line of contactInfo) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: line, font: FONT, size: BODY_SIZE }),
          ],
        })
      )
    }

    const doc = new Document({
      sections: [
        {
          properties: {
            page: {
              size: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
              margin: {
                top: MARGIN,
                right: MARGIN,
                bottom: MARGIN,
                left: MARGIN,
              },
            },
          },
          children,
        },
      ],
    })

    const buffer = await Packer.toBuffer(doc)

    const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`
    const fileName = `${clientName}手紙施策_${yyyymm}_${contact.company_name} ${contact.department ?? ''} ${contact.title ?? ''} ${contact.full_name} 様.docx`

    const uint8 = new Uint8Array(buffer)
    return new NextResponse(uint8, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      },
    })
  } catch (error) {
    console.error('DOCX generation error:', error)
    return NextResponse.json(
      { error: 'docx生成に失敗しました' },
      { status: 500 }
    )
  }
}
