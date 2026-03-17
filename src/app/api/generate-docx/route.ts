import { NextResponse } from 'next/server'
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  UnderlineType,
} from 'docx'

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

export async function POST(request: Request) {
  try {
    const { contact, clientName, bodyText, title, letterId, layout, sender: senderParam } = await request.json()

    if (letterId) {
      const { createClient } = await import('@/lib/supabase/server')
      const supabase = await createClient()
      const { data: letter } = await supabase.from('letters').select('is_approved').eq('id', letterId).single()
      if (letter && !letter.is_approved) {
        return NextResponse.json({ error: '承認が必要です。ファクトチェック画面で承認してからダウンロードしてください。' }, { status: 403 })
      }
    }

    const sender: SenderInfo = {
      sender_company: senderParam?.sender_company ?? DEFAULT_SENDER.sender_company,
      sender_name: senderParam?.sender_name ?? DEFAULT_SENDER.sender_name,
      sender_title: senderParam?.sender_title ?? DEFAULT_SENDER.sender_title,
      sender_phone: senderParam?.sender_phone ?? DEFAULT_SENDER.sender_phone,
      sender_email: senderParam?.sender_email ?? DEFAULT_SENDER.sender_email,
      sender_address: senderParam?.sender_address ?? DEFAULT_SENDER.sender_address,
    }
    const letterLayout = layout ?? 'recipient_first'

    const now = new Date()
    const dateStr = `${now.getFullYear()}年${now.getMonth() + 1}月吉日`

    // ソースマーカーを除去
    const cleanBody = bodyText.replace(/\[①\]|\[②\]|\[③\]|\[④\]|\[⑤\]|\[⑥\]|\[⑦\]|\[⑧\]|\[⑨\]|\[⑩\]/g, '')

    // 本文を行ごとに処理（空行もそのまま保持してレビュー画面と一致させる）
    const lines = cleanBody.split('\n')
    const bodyParagraphs: Paragraph[] = []

    for (const line of lines) {
      const trimmed = line.trim()

      // 空行はそのまま空パラグラフとして保持
      if (trimmed === '') {
        bodyParagraphs.push(emptyLine())
        continue
      }

      // 敬具（右寄せ）
      if (trimmed === '敬具') {
        bodyParagraphs.push(new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [textRun('敬具')],
          spacing: { line: LINE_SPACING },
        }))
        continue
      }

      // 事例タイトル行（■ = 太字、インデントなし）
      if (trimmed.startsWith('■')) {
        bodyParagraphs.push(new Paragraph({
          children: [textRun(trimmed, { bold: true })],
          spacing: { line: LINE_SPACING },
        }))
        continue
      }

      // 拝啓（インデントなし）
      if (trimmed.startsWith('拝啓')) {
        bodyParagraphs.push(new Paragraph({
          children: [textRun(trimmed)],
          spacing: { line: LINE_SPACING },
        }))
        continue
      }

      // つきましては（インデントなし）
      if (trimmed.startsWith('つきましては')) {
        bodyParagraphs.push(new Paragraph({
          children: [textRun(trimmed)],
          spacing: { line: LINE_SPACING },
        }))
        continue
      }

      // 通常の本文（一字下げ）
      bodyParagraphs.push(new Paragraph({
        indent: { firstLine: FIRST_LINE_INDENT },
        children: [textRun(trimmed)],
        spacing: { line: LINE_SPACING },
      }))
    }

    // 宛先ブロック生成
    function buildRecipientBlock(): Paragraph[] {
      const block: Paragraph[] = [
        new Paragraph({ children: [textRun(contact.company_name ?? '')] }),
      ]
      if (contact.department) {
        block.push(new Paragraph({ children: [textRun(contact.department)] }))
      }
      block.push(new Paragraph({
        children: [textRun(`${contact.title ?? ''} ${contact.full_name ?? ''} 様`.trim())],
      }))
      return block
    }

    // 差出人ブロック生成
    function buildSenderBlock(): Paragraph[] {
      return [
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [textRun(sender.sender_company ?? '')],
        }),
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [textRun(`${sender.sender_title ?? ''} ${sender.sender_name ?? ''}`)],
        }),
      ]
    }

    // ドキュメント組み立て
    const children: Paragraph[] = []

    // 日付
    children.push(new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [textRun(dateStr)],
    }))

    // レイアウトに応じて宛先・差出人の順序を切替
    if (letterLayout === 'sender_first') {
      children.push(...buildSenderBlock())
      children.push(emptyLine())
      children.push(...buildRecipientBlock())
    } else {
      children.push(...buildRecipientBlock())
      children.push(emptyLine())
      children.push(...buildSenderBlock())
    }

    children.push(emptyLine())

    // タイトル
    if (title) {
      children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [textRun(title, { size: TITLE_SIZE, underline: true })],
      }))
      children.push(emptyLine())
    }

    // 本文
    children.push(...bodyParagraphs)

    // 空行
    children.push(emptyLine())
    children.push(emptyLine())

    // お問い合わせ先
    const contactLines = [
      '【お問い合わせ先】',
      `${sender.sender_company}　${sender.sender_title} ${sender.sender_name}`,
      `TEL: ${sender.sender_phone} / Email: ${sender.sender_email}`,
      sender.sender_address ?? '',
    ]
    for (const line of contactLines) {
      children.push(new Paragraph({
        children: [textRun(line)],
      }))
    }

    const doc = new Document({
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

    const buffer = await Packer.toBuffer(doc)
    const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`
    const fileName = `${clientName}手紙施策_${yyyymm}_${contact.company_name} ${contact.department ?? ''} ${contact.title ?? ''} ${contact.full_name} 様.docx`

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      },
    })
  } catch (error) {
    console.error('DOCX generation error:', error)
    return NextResponse.json({ error: 'docx生成に失敗しました' }, { status: 500 })
  }
}
