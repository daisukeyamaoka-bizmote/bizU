import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const headers = [
      '会社名 *',
      '氏名 *',
      '部署',
      '役職',
      '役職レベル',
      '郵便番号',
      '住所',
      '業種',
      '情報ソース',
    ]

    const sampleRow = [
      '株式会社サンプル',
      '山田 太郎',
      '人事本部',
      '常務執行役員',
      '執行役員',
      '100-0001',
      '東京都千代田区千代田1-1',
      '製造',
      'HP',
    ]

    const notesRow = [
      '※必須',
      '※必須',
      '',
      '自由記述',
      '取締役/執行役員/部長/課長/マネージャー/その他',
      '',
      '',
      '製造/商社/小売/HR Tech/物流/建設/金融/IT/食品/その他',
      'Infobox/HP/登記/LinkedIn/紹介/その他',
    ]

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([headers, sampleRow, notesRow])

    // Set column widths
    ws['!cols'] = [
      { wch: 20 }, // 会社名
      { wch: 15 }, // 氏名
      { wch: 15 }, // 部署
      { wch: 18 }, // 役職
      { wch: 12 }, // 役職レベル
      { wch: 12 }, // 郵便番号
      { wch: 30 }, // 住所
      { wch: 10 }, // 業種
      { wch: 12 }, // 情報ソース
    ]

    XLSX.utils.book_append_sheet(wb, ws, 'テンプレート')
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

    return new Response(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="bizU_import_template.xlsx"',
      },
    })
  } catch (error) {
    console.error('Template generation error:', error)
    return NextResponse.json({ error: 'テンプレート生成に失敗しました' }, { status: 500 })
  }
}
