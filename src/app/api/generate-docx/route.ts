import { NextResponse } from 'next/server'
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
} from 'docx'

export async function POST(request: Request) {
  try {
    const { contact, clientName, bodyText } = await request.json()

    const now = new Date()
    const dateStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`

    // Split body into paragraphs
    const paragraphs = bodyText.split('\n').filter((p: string) => p.trim())

    const doc = new Document({
      sections: [
        {
          properties: {
            page: {
              margin: {
                top: 720,
                right: 720,
                bottom: 720,
                left: 720,
              },
            },
          },
          children: [
            // Date - right aligned
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [
                new TextRun({
                  text: dateStr,
                  font: '游明朝',
                  size: 21,
                }),
              ],
              spacing: { after: 200 },
            }),
            // Empty line
            new Paragraph({ children: [] }),
            // Company name
            new Paragraph({
              children: [
                new TextRun({
                  text: contact.company_name ?? '',
                  font: '游明朝',
                  size: 21,
                }),
              ],
            }),
            // Department
            ...(contact.department
              ? [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: contact.department,
                        font: '游明朝',
                        size: 21,
                      }),
                    ],
                  }),
                ]
              : []),
            // Title and Name
            new Paragraph({
              children: [
                new TextRun({
                  text: `${contact.title ?? ''} ${contact.full_name} 様`,
                  font: '游明朝',
                  size: 21,
                }),
              ],
              spacing: { after: 400 },
            }),
            // Body paragraphs
            ...paragraphs.map(
              (p: string) =>
                new Paragraph({
                  indent: { firstLine: 420 },
                  children: [
                    new TextRun({
                      text: p.trim(),
                      font: '游明朝',
                      size: 21,
                    }),
                  ],
                  spacing: { line: 400 },
                })
            ),
            // Empty line
            new Paragraph({ children: [], spacing: { before: 400 } }),
            // Sender
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [
                new TextRun({
                  text: 'bizmote株式会社',
                  font: '游明朝',
                  size: 21,
                }),
              ],
            }),
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [
                new TextRun({
                  text: '代表取締役 山岡大輔',
                  font: '游明朝',
                  size: 21,
                }),
              ],
            }),
          ],
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
