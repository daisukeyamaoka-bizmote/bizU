import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type RankItem = { label: string; rate: string; sent: number; reacted: number }

export default async function DashboardPage() {
  const supabase = await createClient()
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const today = now.toISOString().split('T')[0]
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 86400000).toISOString().split('T')[0]
  const sixMonthsAgo = new Date(now.getTime() - 180 * 86400000).toISOString().split('T')[0]

  // ===== 今月の実績 KPI =====
  const { count: sentCount } = await supabase
    .from('letters')
    .select('*', { count: 'exact', head: true })
    .gte('sent_at', startOfMonth)

  const { count: reactionCount } = await supabase
    .from('reactions')
    .select('*', { count: 'exact', head: true })
    .gte('reacted_at', startOfMonth)

  const { count: dealCount } = await supabase
    .from('reactions')
    .select('*', { count: 'exact', head: true })
    .eq('reaction_type', '商談化')
    .gte('reacted_at', startOfMonth)

  const sent = sentCount ?? 0
  const reactions = reactionCount ?? 0
  const deals = dealCount ?? 0
  const reactionRate = sent > 0 ? ((reactions / sent) * 100).toFixed(1) : '0.0'

  // データ資産カウント
  const { count: totalSentCount } = await supabase.from('letters').select('*', { count: 'exact', head: true }).not('sent_at', 'is', null)
  const { count: totalCompanyCount } = await supabase.from('target_companies').select('*', { count: 'exact', head: true })
  const totalSent = totalSentCount ?? 0
  const totalCompanies = totalCompanyCount ?? 0

  // ===== インテリジェンスサマリー =====
  const { data: allLetters } = await supabase
    .from('letters')
    .select(`
      id, why_you_angle, send_trigger, sent_at,
      contacts(company_id)
    `)
    .not('sent_at', 'is', null)

  const { data: allReactions } = await supabase
    .from('reactions')
    .select('letter_id, reaction_type')

  // 企業の業種マップ
  const { data: companies } = await supabase
    .from('target_companies')
    .select('id, industry')
  const industryMap = new Map((companies ?? []).map(c => [c.id, c.industry]))

  const reactionMap = new Map<string, string>()
  for (const r of allReactions ?? []) {
    if (r.letter_id) reactionMap.set(r.letter_id, r.reaction_type)
  }

  // 集計ヘルパー
  function computeRanking(
    groupFn: (l: (typeof allLetters extends (infer T)[] | null ? T : never)) => string | null,
    filterReacted: (type: string) => boolean = (t) => ['返信あり', '商談化'].includes(t),
  ): RankItem[] {
    const groups = new Map<string, { sent: number; reacted: number }>()
    for (const l of allLetters ?? []) {
      const key = groupFn(l)
      if (!key) continue
      const g = groups.get(key) ?? { sent: 0, reacted: 0 }
      g.sent++
      const rt = reactionMap.get(l.id)
      if (rt && filterReacted(rt)) g.reacted++
      groups.set(key, g)
    }
    return Array.from(groups.entries())
      .filter(([, v]) => v.sent >= 1)
      .map(([label, v]) => ({
        label,
        rate: v.sent > 0 ? ((v.reacted / v.sent) * 100).toFixed(1) : '0.0',
        sent: v.sent,
        reacted: v.reacted,
      }))
      .sort((a, b) => parseFloat(b.rate) - parseFloat(a.rate))
      .slice(0, 3)
  }

  // Why You別反応率トップ3
  const whyYouRanking = computeRanking((l) => l.why_you_angle)

  // トリガー別反応率トップ3
  const triggerRanking = computeRanking((l) => l.send_trigger)

  // 業種別反応率トップ3
  const industryRanking = computeRanking((l) => {
    const contact = Array.isArray(l.contacts) ? l.contacts[0] : l.contacts
    const companyId = contact?.company_id
    return companyId ? (industryMap.get(companyId) ?? null) : null
  })

  // ===== 要アクション（4-3） =====
  // 送付から14日以上経過・反応記録なし
  const { data: sentLetters } = await supabase
    .from('letters')
    .select('id, sent_at, contacts(full_name, target_companies(name))')
    .not('sent_at', 'is', null)
    .lte('sent_at', fourteenDaysAgo)
    .order('sent_at', { ascending: true })
    .limit(50)

  const sentLetterIds = (sentLetters ?? []).map(l => l.id)
  const { data: existingReactions } = sentLetterIds.length > 0
    ? await supabase.from('reactions').select('letter_id').in('letter_id', sentLetterIds)
    : { data: [] }
  const reactedLetterIds = new Set((existingReactions ?? []).map(r => r.letter_id))

  const noReactionLetters = (sentLetters ?? [])
    .filter(l => !reactedLetterIds.has(l.id))
    .slice(0, 5)

  // 次回アクション期日超過
  const { data: overdueActions } = await supabase
    .from('reactions')
    .select('id, next_action, next_action_date, letter_id, letters(contacts(full_name))')
    .not('next_action', 'is', null)
    .not('next_action_date', 'is', null)
    .lte('next_action_date', today)
    .order('next_action_date', { ascending: true })
    .limit(5)

  // 情報取得から180日超のコンタクト
  const { data: staleContacts } = await supabase
    .from('contacts')
    .select('id, full_name, info_acquired_at, target_companies(name)')
    .eq('is_active', true)
    .not('info_acquired_at', 'is', null)
    .lte('info_acquired_at', sixMonthsAgo)
    .order('info_acquired_at', { ascending: true })
    .limit(5)

  return (
    <div>
      <h1 className="text-2xl font-bold text-neutral-900">ダッシュボード</h1>

      {/* 今月の実績 KPIカード */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard label="送付数" value={`${sent}通`} />
        <KPICard label="反応数" value={`${reactions}件`} />
        <KPICard label="反応率" value={`${reactionRate}%`} />
        <KPICard label="商談化" value={`${deals}件`} />
      </div>

      {/* インテリジェンスサマリー */}
      <div className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">インテリジェンス</h2>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <RankingCard title="Why You別 反応率" items={whyYouRanking} suffix="%" />
          <RankingCard title="トリガー別 反応率" items={triggerRanking} suffix="%" />
          <RankingCard title="業種別 反応率" items={industryRanking} suffix="%" />
        </div>
      </div>

      {/* 要アクション（4-3） */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-neutral-900">要アクション</h2>
        <div className="mt-4 space-y-3">
          {/* 14日以上経過・反応なし */}
          <ActionAlert
            label={`送付から14日以上経過・反応記録なし: ${noReactionLetters.length > 0 ? noReactionLetters.length + '件' : 'なし'}`}
            items={noReactionLetters.map((l) => {
              const contact = Array.isArray(l.contacts) ? l.contacts[0] : l.contacts
              const company = contact && 'target_companies' in contact
                ? (Array.isArray(contact.target_companies) ? contact.target_companies[0] : contact.target_companies)
                : null
              return {
                id: l.id,
                text: `${(company as { name: string } | null)?.name ?? ''} ${contact?.full_name ?? ''} (送付: ${l.sent_at})`,
                href: `/letters/${l.id}`,
              }
            })}
          />

          {/* 次回アクション期日超過 */}
          <ActionAlert
            label={`次回アクション期日超過: ${(overdueActions ?? []).length > 0 ? (overdueActions ?? []).length + '件' : 'なし'}`}
            items={(overdueActions ?? []).map((r) => {
              const letters = Array.isArray(r.letters) ? r.letters[0] : r.letters
              const contact = letters && 'contacts' in letters
                ? (Array.isArray(letters.contacts) ? letters.contacts[0] : letters.contacts)
                : null
              return {
                id: r.id,
                text: `${contact?.full_name ?? ''} - ${r.next_action} (期日: ${r.next_action_date})`,
                href: `/letters/${r.letter_id}`,
              }
            })}
          />

          {/* 情報取得180日超 */}
          <ActionAlert
            label={`情報取得から180日超のコンタクト: ${(staleContacts ?? []).length > 0 ? (staleContacts ?? []).length + '件' : 'なし'}`}
            items={(staleContacts ?? []).map((c) => {
              const company = Array.isArray(c.target_companies) ? c.target_companies[0] : c.target_companies
              return {
                id: c.id,
                text: `${(company as { name: string } | null)?.name ?? ''} ${c.full_name} (取得日: ${c.info_acquired_at})`,
                href: '/contacts',
              }
            })}
          />
        </div>
      </div>

      {/* データ資産 */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-neutral-900">データ資産</h2>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-lg border border-neutral-200 bg-white p-4 text-center">
            <p className="text-2xl font-bold text-neutral-900">{totalSent}通</p>
            <p className="mt-1 text-xs text-neutral-500">送付累計</p>
          </div>
          <div className="rounded-lg border border-neutral-200 bg-white p-4 text-center">
            <p className="text-2xl font-bold text-neutral-900">{totalCompanies}社</p>
            <p className="mt-1 text-xs text-neutral-500">取引先数</p>
          </div>
          <div className="rounded-lg border border-neutral-200 bg-white p-4 text-center">
            <p className="text-2xl font-bold text-neutral-900">{reactions}件</p>
            <p className="mt-1 text-xs text-neutral-500">反応累計</p>
          </div>
          <div className="rounded-lg border border-neutral-200 bg-white p-4 text-center">
            <p className="text-2xl font-bold text-neutral-900">{deals}件</p>
            <p className="mt-1 text-xs text-neutral-500">商談化累計</p>
          </div>
        </div>
      </div>

      {/* CSVエクスポート */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-neutral-900">CSVエクスポート</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <ExportLink type="contacts" label="コンタクトリスト" description="Salesforce/HubSpotインポート用" />
          <ExportLink type="letters" label="手紙履歴" description="CRM活動履歴追記用" />
          <ExportLink type="reactions" label="反応記録" description="SFA商談フェーズ更新用" />
          <ExportLink type="analytics" label="分析用フルエクスポート" description="BIツール・AI分析用" />
        </div>
      </div>

    </div>
  )
}

function ExportLink({ type, label, description }: { type: string; label: string; description: string }) {
  return (
    <a
      href={`/api/export?type=${type}`}
      target="_blank"
      rel="noopener noreferrer"
      className="flex flex-col items-start rounded-lg border border-neutral-200 bg-white px-4 py-3 text-left hover:bg-neutral-50"
    >
      <span className="text-sm font-medium text-neutral-900">{label}</span>
      <span className="mt-0.5 text-xs text-neutral-500">{description}</span>
    </a>
  )
}

function KPICard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-6">
      <p className="text-sm font-medium text-neutral-500">{label}</p>
      <p className="mt-2 text-3xl font-bold text-neutral-900">{value}</p>
    </div>
  )
}

function RankingCard({ title, items, suffix }: { title: string; items: RankItem[]; suffix: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-5">
      <h3 className="text-xs font-semibold uppercase text-neutral-500">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-400">データなし</p>
      ) : (
        <div className="mt-3 space-y-2.5">
          {items.map((item, i) => (
            <div key={item.label} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-neutral-100 text-[10px] font-bold text-neutral-600">
                  {i + 1}
                </span>
                <span className="text-sm text-neutral-900">{item.label}</span>
              </div>
              <div className="text-right">
                <span className="text-sm font-bold text-neutral-900">{item.rate}{suffix}</span>
                <span className="ml-1 text-xs text-neutral-400">({item.sent}通)</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ActionAlert({
  label,
  items,
}: {
  label: string
  items: { id: string; text: string; href: string }[]
}) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3">
      <p className="text-sm font-medium text-neutral-700">{label}</p>
      {items.length > 0 && (
        <div className="mt-2 space-y-1">
          {items.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className="block text-xs text-neutral-500 hover:text-neutral-900 hover:underline"
            >
              {item.text}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

