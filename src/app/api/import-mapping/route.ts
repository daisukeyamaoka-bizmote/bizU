import { NextResponse } from 'next/server'
import { callClaude, getTextFromResponse } from '@/lib/anthropic'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const { headers } = await request.json()

    const response = await callClaude({
      max_tokens: 512,
      system: `あなたはデータマッピングの専門家です。
Excelの列名リストをbizUのフィールド名にマッピングしてください。
必ずJSON形式のみで返答してください。説明文は一切不要です。

bizUのフィールド一覧:
- company_name（会社名）
- full_name（氏名）
- title（役職）
- department（部署）
- role_level（役職レベル: 取締役/執行役員/部長/課長/マネージャー/その他）
- postal_code（郵便番号）
- address（住所）
- industry（業種）
- info_source（情報ソース）
- employee_scale（従業員数・社員数）
- revenue_scale（売上・売上高・年商）
- website（会社HP・ホームページ・URL）
- phone（代表電話番号・TEL）
- founded_date（設立年月日・創業日・創立日）
- fiscal_month（決算月・決算期）
- representative_email（代表メール・メールアドレス）

マッピングできない列はnullにしてください。
表記ゆれを吸収してください（例:「氏名（漢字）」→「full_name」、「職位」→「title」）

出力形式: {"元の列名": "field_name or null", ...}`,
      messages: [
        {
          role: 'user',
          content: `以下のExcel列名をマッピングしてください:\n${JSON.stringify(headers)}`,
        },
      ],
    })

    const text = getTextFromResponse(response)

    // JSONを抽出（コードブロックに入っている可能性）
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({ mapping: {} })
    }

    const mapping = JSON.parse(jsonMatch[0])
    return NextResponse.json({ mapping })
  } catch (error) {
    console.error('Mapping error:', error)
    return NextResponse.json({ mapping: {} })
  }
}
