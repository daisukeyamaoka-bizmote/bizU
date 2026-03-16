import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')

    const supabase = await createClient()
    let csv = ''
    let filename = ''

    switch (type) {
      case 'contacts': {
        // Salesforce/HubSpotインポート用
        const { data } = await supabase
          .from('contacts')
          .select('full_name, department, title, role_level, function_tag, postal_code, address, info_source, info_acquired_at, is_verified, is_active, target_companies(name, industry, employee_scale, listing_type)')
          .eq('is_active', true)
          .order('created_at', { ascending: false })

        csv = 'company_name,industry,employee_scale,listing_type,full_name,department,title,role_level,function_tag,postal_code,address,info_source,info_acquired_at,is_verified\n'
        for (const c of data ?? []) {
          const company = Array.isArray(c.target_companies) ? c.target_companies[0] : c.target_companies
          csv += [
            esc(company?.name),
            esc(company?.industry),
            esc(company?.employee_scale),
            esc(company?.listing_type),
            esc(c.full_name),
            esc(c.department),
            esc(c.title),
            esc(c.role_level),
            esc(c.function_tag),
            esc(c.postal_code),
            esc(c.address),
            esc(c.info_source),
            esc(c.info_acquired_at),
            c.is_verified ? 'TRUE' : 'FALSE',
          ].join(',') + '\n'
        }
        filename = `bizU_contacts_${dateStr()}.csv`
        break
      }

      case 'letters': {
        // CRM活動履歴追記用
        const { data } = await supabase
          .from('letters')
          .select(`
            id, why_you_angle, send_trigger, trigger_source, trigger_date, company_phase, selection_reason,
            crew_id, sent_at, file_name, contact_sequence, created_at,
            contacts(full_name, department, title, target_companies(name)),
            clients(name, product_name),
            case_studies(company_name)
          `)
          .order('created_at', { ascending: false })

        csv = 'letter_id,company_name,full_name,department,title,client_name,product_name,case_study,why_you_angle,send_trigger,trigger_source,trigger_date,company_phase,selection_reason,crew_id,sent_at,contact_sequence,created_at\n'
        for (const l of data ?? []) {
          const contact = Array.isArray(l.contacts) ? l.contacts[0] : l.contacts
          const company = contact && 'target_companies' in contact
            ? (Array.isArray(contact.target_companies) ? contact.target_companies[0] : contact.target_companies)
            : null
          const client = Array.isArray(l.clients) ? l.clients[0] : l.clients
          const cs = Array.isArray(l.case_studies) ? l.case_studies[0] : l.case_studies
          csv += [
            esc(l.id),
            esc((company as { name?: string } | null)?.name),
            esc(contact?.full_name),
            esc(contact?.department),
            esc(contact?.title),
            esc(client?.name),
            esc(client?.product_name),
            esc(cs?.company_name),
            esc(l.why_you_angle),
            esc(l.send_trigger),
            esc(l.trigger_source),
            esc(l.trigger_date),
            esc(l.company_phase),
            esc(l.selection_reason),
            esc(l.crew_id),
            esc(l.sent_at),
            l.contact_sequence ?? '',
            esc(l.created_at),
          ].join(',') + '\n'
        }
        filename = `bizU_letters_${dateStr()}.csv`
        break
      }

      case 'reactions': {
        // SFA商談フェーズ更新用
        const { data } = await supabase
          .from('reactions')
          .select(`
            id, reaction_type, reaction_channel, reacted_at, days_to_react, memo,
            next_action, next_action_date, next_action_log, created_at,
            letters(sent_at, why_you_angle, contacts(full_name, target_companies(name)))
          `)
          .order('reacted_at', { ascending: false })

        csv = 'reaction_id,company_name,full_name,reaction_type,reaction_channel,reacted_at,days_to_react,why_you_angle,sent_at,memo,next_action,next_action_date,next_action_log\n'
        for (const r of data ?? []) {
          const letters = Array.isArray(r.letters) ? r.letters[0] : r.letters
          const contact = letters && 'contacts' in letters
            ? (Array.isArray(letters.contacts) ? letters.contacts[0] : letters.contacts)
            : null
          const company = contact && 'target_companies' in contact
            ? (Array.isArray(contact.target_companies) ? contact.target_companies[0] : contact.target_companies)
            : null
          csv += [
            esc(r.id),
            esc((company as { name?: string } | null)?.name),
            esc(contact?.full_name),
            esc(r.reaction_type),
            esc(r.reaction_channel),
            esc(r.reacted_at),
            r.days_to_react ?? '',
            esc(letters?.why_you_angle),
            esc(letters?.sent_at),
            esc(r.memo),
            esc(r.next_action),
            esc(r.next_action_date),
            esc(r.next_action_log),
          ].join(',') + '\n'
        }
        filename = `bizU_reactions_${dateStr()}.csv`
        break
      }

      case 'analytics': {
        // BIツール・AI分析用フルエクスポート
        const { data } = await supabase
          .from('letters')
          .select(`
            id, why_you_angle, send_trigger, trigger_source, trigger_date, company_phase,
            selection_reason, crew_id, sent_at, contact_sequence, created_at,
            contacts(full_name, department, title, role_level, function_tag, target_companies(name, industry, employee_scale, revenue_scale, listing_type)),
            clients(name, product_name),
            case_studies(company_name, challenge_tags, result_summary)
          `)
          .order('created_at', { ascending: false })

        const letterIds = (data ?? []).map(l => l.id)
        const { data: allReactions } = letterIds.length > 0
          ? await supabase.from('reactions').select('letter_id, reaction_type, reaction_channel, reacted_at, days_to_react, next_action').in('letter_id', letterIds)
          : { data: [] }
        const reactionMap = new Map((allReactions ?? []).map(r => [r.letter_id, r]))

        csv = 'letter_id,company_name,industry,employee_scale,revenue_scale,listing_type,full_name,department,title,role_level,function_tag,client_name,product_name,case_study,challenge_tags,result_summary,why_you_angle,send_trigger,trigger_source,trigger_date,company_phase,selection_reason,crew_id,sent_at,contact_sequence,reaction_type,reaction_channel,reacted_at,days_to_react,next_action,is_reacted,is_converted\n'
        for (const l of data ?? []) {
          const contact = Array.isArray(l.contacts) ? l.contacts[0] : l.contacts
          const company = contact && 'target_companies' in contact
            ? (Array.isArray(contact.target_companies) ? contact.target_companies[0] : contact.target_companies)
            : null
          const client = Array.isArray(l.clients) ? l.clients[0] : l.clients
          const cs = Array.isArray(l.case_studies) ? l.case_studies[0] : l.case_studies
          const reaction = reactionMap.get(l.id)
          const isReacted = reaction && ['返信あり', '商談化'].includes(reaction.reaction_type) ? 1 : 0
          const isConverted = reaction?.reaction_type === '商談化' ? 1 : 0
          const co = company as { name?: string; industry?: string; employee_scale?: string; revenue_scale?: string; listing_type?: string } | null
          csv += [
            esc(l.id),
            esc(co?.name),
            esc(co?.industry),
            esc(co?.employee_scale),
            esc(co?.revenue_scale),
            esc(co?.listing_type),
            esc(contact?.full_name),
            esc(contact?.department),
            esc(contact?.title),
            esc(contact?.role_level),
            esc(contact?.function_tag),
            esc(client?.name),
            esc(client?.product_name),
            esc(cs?.company_name),
            esc(cs?.challenge_tags?.join('; ')),
            esc(cs?.result_summary),
            esc(l.why_you_angle),
            esc(l.send_trigger),
            esc(l.trigger_source),
            esc(l.trigger_date),
            esc(l.company_phase),
            esc(l.selection_reason),
            esc(l.crew_id),
            esc(l.sent_at),
            l.contact_sequence ?? '',
            esc(reaction?.reaction_type),
            esc(reaction?.reaction_channel),
            esc(reaction?.reacted_at),
            reaction?.days_to_react ?? '',
            esc(reaction?.next_action),
            isReacted,
            isConverted,
          ].join(',') + '\n'
        }
        filename = `bizU_analytics_full_${dateStr()}.csv`
        break
      }

      default:
        return NextResponse.json({ error: '不明なエクスポート種別です' }, { status: 400 })
    }

    // BOM付きUTF-8でExcelでの文字化け防止
    const bom = '\uFEFF'
    return new Response(bom + csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    console.error('Export error:', error)
    return NextResponse.json({ error: 'エクスポートに失敗しました' }, { status: 500 })
  }
}

function esc(val: unknown): string {
  if (val === null || val === undefined) return ''
  const s = String(val)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function dateStr(): string {
  const now = new Date()
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
}
