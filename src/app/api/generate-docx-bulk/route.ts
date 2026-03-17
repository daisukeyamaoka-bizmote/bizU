import { NextResponse } from 'next/server'
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  UnderlineType,
} from 'docx'
import JSZip from 'jszip'

const PAGE_WIDTH = 11906
const PAGE_HEIGHT = 16838
const MARGIN = 720
const FONT = '游明朝'
const BODY_SIZE = 21
const TITLE_SIZE = 28
const LINE_SPACING = 420
const FIRST_LINE_INDENT = 420

type SenderInfo = {
  sender_company?: string | null
  sender_name?: string | null
  sender_title?: string | null
  sender_phone?: string | null
  sender_email?: string | null
  sender_address?: string | null
}

const DEFAULT_SENDER: SenderInfo = {
  sender_company: 'bizmote株式会社',
  sender_name: '山岡大輔',
  sender_title: '代表取締役',
  sender_phone: '090-8349-3739',
  sender_email: 'd.yamaoka@bizmote.co.jp',
  sender_address: '〒150-0043 東京都渋谷区道玄坂1-2-3',
}

function textRun(text: string, opts?: { bold?: boolean; size?: number; underline?: boolean }) {
  return new TextRun({
    text,
    font: FONT,
    size: opts?.size ?? BODY_SIZE,
    bold: opts?.bold,
    underline: opts?.underline ? { type: UnderlineType.THICK } : undefined,
  })
}

function emptyLine() {
  return new Paragraph({ children: [], spacing: { line: LINE_SPACING } })
}

type LetterPayload = {
  contact: {
    company_name: string
    department?: string
    title?: string
    full_name: string
  }
  clientName: string
  bodyText: string
  title?: string
  layout?: string
  sender?: SenderInfo
}

function buildDocx(letter: LetterPayload): Document {
  const sender: SenderInfo = {
    sender_company: letter.sender?.sender_company ?? DEFAULT_SENDER.sender_company,
    sender_name: letter.sender?.sender_name ?? DEFAULT_SENDER.sender_name,
    sender_title: letter.sender?.sender_title ?? DEFAULT_SENDER.sender_title,
    sender_phone: letter.sender?.sender_phone ?? DEFAULT_SENDER.sender_phone,
    sender_email: letter.sender?.sender_email ?? DEFAULT_SENDER.sender_email,
    sender_address: letter.sender?.sender_address ?? DEFAULT_SENDER.sender_address,
  }
  const letterLayout = letter.layout ?? 'recipient_first'
  const now = new Date()
  const dateStr = `${now.getFullYear()}年${now.getMonth() + 1}月吉日`
  const cleanBody = letter.bodyText.replace(/\[①\]|\[②\]|\[③\]|\[④\]|\[⑤\]|\[⑥\]|\[⑦\]|\[⑧\]|\[⑨\]|\[⑩\]/g, '')
  const lines = cleanBody.split('\n')
  const bodyParagraphs: Paragraph[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed === '') { bodyParagraphs.push(emptyLine()); continue }
    if (trimmed === '敬具') { bodyParagraphs.push(new Paragraph({ alignment: AlignmentType.RIGHT, children: [textRun('敬具')], spacing: { line: LINE_SPACING } })); continue }
    if (trimmed.startsWith('■')) { bodyParagraphs.push(new Paragraph({ children: [textRun(trimmed, { bold: true })], spacing: { line: LINE_SPACING } })); continue }
    if (trimmed.startsWith('拝啓')) { bodyParagraphs.push(new Paragraph({ children: [textRun(trimmed)], spacing: { line: LINE_SPACING } })); continue }
    if (trimmed.startsWith('つきましては')) { bodyParagraphs.push(new Paragraph({ children: [textRun(trimmed)], spacing: { line: LINE_SPACING } })); continue }
    bodyParagraphs.push(new Paragraph({ indent: { firstLine: FIRST_LINE_INDENT }, children: [textRun(trimmed)], spacing: { line: LINE_SPACING } }))
  }

  function buildRecipientBlock(): Paragraph[] {
    const block: Paragraph[] = [new Paragraph({ children: [textRun(letter.contact.company_name ?? '')] })]
    if (letter.contact.department) block.push(new Paragraph({ children: [textRun(letter.contact.department)] }))
    block.push(new Paragraph({ children: [textRun(`${letter.contact.title ?? ''} ${letter.contact.full_name ?? ''} 様`.trim())] }))
    return block
  }

  function buildSenderBlock(): Paragraph[] {
    return [
      new Paragraph({ alignment: AlignmentType.RIGHT, children: [textRun(sender.sender_company ?? '')] }),
      new Paragraph({ alignment: AlignmentType.RIGHT, children: [textRun(`${sender.sender_title ?? ''} ${sender.sender_name ?? ''}`)] }),
    ]
  }

  const children: Paragraph[] = []
  children.push(new Paragraph({ alignment: AlignmentType.RIGHT, children: [textRun(dateStr)] }))
  if (letterLayout === 'sender_first') {
    children.push(...buildSenderBlock(), emptyLine(), ...buildRecipientBlock())
  } else {
    children.push(...buildRecipientBlock(), emptyLine(), ...buildSenderBlock())
  }
  children.push(emptyLine())
  if (letter.title) {
    children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [textRun(letter.title, { size: TITLE_SIZE, underline: true })] }))
    children.push(emptyLine())
  }
  children.push(...bodyParagraphs, emptyLine(), emptyLine())

  const contactLines = [
    '【お問い合わせ先】',
    `${sender.sender_company}　${sender.sender_title} ${sender.sender_name}`,
    `TEL: ${sender.sender_phone} / Email: ${sender.sender_email}`,
    sender.sender_address ?? '',
  ]
  for (const cl of contactLines) {
    children.push(new Paragraph({ children: [textRun(cl)] }))
  }

  return new Document({
    sections: [{
      properties: {
        page: {
          size: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
          margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
        },
      },
      children,
    }],
  })
}

export async function POST(request: Request) {
  try {
    const { letterIds } = await request.json()
    if (!Array.isArray(letterIds) || letterIds.length === 0) {
      return NextResponse.json({ error: 'letterIds is required' }, { status: 400 })
    }

    const { createClient } = await import('@/lib/supabase/server')
    const supabase = await createClient()

    const { data: letters } = await supabase
      .from('letters')
      .select(`
        id, body_text, hypothesis, is_approved, project_id,
        contacts(full_name, department, title, target_companies(name)),
        clients(name)
      `)
      .in('id', letterIds)

    if (!letters || letters.length === 0) {
      return NextResponse.json({ error: '手紙が見つかりません' }, { status: 404 })
    }

    // プロジェクト情報を一括取得
    const projectIds = [...new Set(letters.map((l: { project_id: string | null }) => l.project_id).filter(Boolean))]
    let projectMap = new Map<string, SenderInfo & { letter_layout?: string | null }>()
    if (projectIds.length > 0) {
      const { data: projects } = await supabase
        .from('projects')
        .select('id, letter_layout, sender_company, sender_name, sender_title, sender_phone, sender_email, sender_address')
        .in('id', projectIds)
      if (projects) {
        projectMap = new Map(projects.map((p: { id: string; letter_layout?: string | null } & SenderInfo) => [p.id, p]))
      }
    }

    const zip = new JSZip()
    const now = new Date()
    const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`

    for (const l of letters) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const letter = l as any
      const contact = Array.isArray(letter.contacts) ? letter.contacts[0] : letter.contacts
      const company = contact?.target_companies
        ? (Array.isArray(contact.target_companies) ? contact.target_companies[0] : contact.target_companies)
        : null
      const clientObj = Array.isArray(letter.clients) ? letter.clients[0] : letter.clients
      const proj = letter.project_id ? projectMap.get(letter.project_id) : undefined

      const payload: LetterPayload = {
        contact: {
          company_name: company?.name ?? '',
          department: contact?.department ?? '',
          title: contact?.title ?? '',
          full_name: contact?.full_name ?? '',
        },
        clientName: clientObj?.name ?? '',
        bodyText: letter.body_text ?? '',
        title: letter.hypothesis ?? '',
        layout: proj?.letter_layout ?? 'recipient_first',
        sender: proj ?? undefined,
      }

      const doc = buildDocx(payload)
      const buffer = await Packer.toBuffer(doc)
      const fileName = `${payload.clientName}手紙施策_${yyyymm}_${payload.contact.company_name} ${payload.contact.department ?? ''} ${payload.contact.title ?? ''} ${payload.contact.full_name} 様.docx`
      zip.file(fileName, buffer)
    }

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' })

    return new NextResponse(new Uint8Array(zipBuffer), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`手紙一括_${yyyymm}.zip`)}`,
      },
    })
  } catch (error) {
    console.error('Bulk DOCX generation error:', error)
    return NextResponse.json({ error: '一括ダウンロードに失敗しました' }, { status: 500 })
  }
}
