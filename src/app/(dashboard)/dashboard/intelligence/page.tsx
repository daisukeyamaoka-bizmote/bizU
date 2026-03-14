'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { INDUSTRIES, WHY_YOU_ANGLES } from '@/lib/constants'

type LetterWithContext = {
  id: string
  why_you_angle: string
  send_trigger: string | null
  trigger_date: string | null
  sent_at: string | null
  crew_id: string | null
  case_study_company: string | null
  industry: string | null
  company_id: string | null
}

type ReactionData = {
  letter_id: string
  reaction_type: string
}

type Period = 'all' | '6m' | '3m' | '1m'

export default function IntelligencePage() {
  const [letters, setLetters] = useState<LetterWithContext[]>([])
  const [reactions, setReactions] = useState<ReactionData[]>([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<Period>('6m')

  // Asset counts
  const [totalSent, setTotalSent] = useState(0)
  const [totalReactions, setTotalReactions] = useState(0)
  const [totalDeals, setTotalDeals] = useState(0)
  const [totalCompanies, setTotalCompanies] = useState(0)
  const [totalCrews, setTotalCrews] = useState(0)

  useEffect(() => {
    loadData()
  }, [period])

  async function loadData() {
    setLoading(true)
    const supabase = createClient()

    // Period filter
    let startDate: string | null = null
    if (period !== 'all') {
      const now = new Date()
      const months = period === '6m' ? 6 : period === '3m' ? 3 : 1
      now.setMonth(now.getMonth() - months)
      startDate = now.toISOString().split('T')[0]
    }

    // Fetch letters with joins
    let lettersQuery = supabase
      .from('letters')
      .select(`
        id, why_you_angle, send_trigger, trigger_date, sent_at, crew_id,
        contacts(company_id),
        case_studies(company_name)
      `)
      .not('sent_at', 'is', null)

    if (startDate) {
      lettersQuery = lettersQuery.gte('sent_at', startDate)
    }

    const { data: lettersData } = await lettersQuery

    // Fetch companies for industry mapping
    const { data: companies } = await supabase
      .from('target_companies')
      .select('id, industry')
    const industryMap = new Map((companies ?? []).map(c => [c.id, c.industry]))

    const mapped: LetterWithContext[] = (lettersData ?? []).map((l) => {
      const contact = Array.isArray(l.contacts) ? l.contacts[0] : l.contacts
      const cs = Array.isArray(l.case_studies) ? l.case_studies[0] : l.case_studies
      const companyId = contact?.company_id ?? null
      return {
        id: l.id,
        why_you_angle: l.why_you_angle,
        send_trigger: l.send_trigger,
        trigger_date: l.trigger_date,
        sent_at: l.sent_at,
        crew_id: l.crew_id,
        case_study_company: cs?.company_name ?? null,
        industry: companyId ? (industryMap.get(companyId) ?? null) : null,
        company_id: companyId,
      }
    })

    // Fetch reactions
    const letterIds = mapped.map(l => l.id)
    const { data: reactionsData } = letterIds.length > 0
      ? await supabase.from('reactions').select('letter_id, reaction_type').in('letter_id', letterIds)
      : { data: [] }

    setLetters(mapped)
    setReactions(reactionsData ?? [])

    // Asset counts (all-time)
    const { count: sentAll } = await supabase.from('letters').select('*', { count: 'exact', head: true }).not('sent_at', 'is', null)
    const { count: reactAll } = await supabase.from('reactions').select('*', { count: 'exact', head: true })
    const { count: dealsAll } = await supabase.from('reactions').select('*', { count: 'exact', head: true }).eq('reaction_type', '商談化')
    const { count: compAll } = await supabase.from('target_companies').select('*', { count: 'exact', head: true })

    setTotalSent(sentAll ?? 0)
    setTotalReactions(reactAll ?? 0)
    setTotalDeals(dealsAll ?? 0)
    setTotalCompanies(compAll ?? 0)

    // Crew count (distinct crew_ids)
    const crewIds = new Set((lettersData ?? []).map(l => l.crew_id).filter(Boolean))
    setTotalCrews(crewIds.size)

    setLoading(false)
  }

  // Reaction lookup
  const reactionMap = new Map<string, string>()
  for (const r of reactions) {
    if (r.letter_id) reactionMap.set(r.letter_id, r.reaction_type)
  }

  // ===== Heatmap: Why You x Industry =====
  const heatmapData: Record<string, Record<string, { sent: number; reacted: number }>> = {}
  for (const angle of WHY_YOU_ANGLES) {
    heatmapData[angle] = {}
    for (const ind of INDUSTRIES) {
      heatmapData[angle][ind] = { sent: 0, reacted: 0 }
    }
  }
  for (const l of letters) {
    if (!l.industry || !heatmapData[l.why_you_angle]) continue
    if (!heatmapData[l.why_you_angle][l.industry]) {
      heatmapData[l.why_you_angle][l.industry] = { sent: 0, reacted: 0 }
    }
    heatmapData[l.why_you_angle][l.industry].sent++
    const rt = reactionMap.get(l.id)
    if (rt && ['返信あり', '商談化'].includes(rt)) {
      heatmapData[l.why_you_angle][l.industry].reacted++
    }
  }

  // Active industries (ones with data)
  const activeIndustries = INDUSTRIES.filter((ind) =>
    WHY_YOU_ANGLES.some((a) => (heatmapData[a]?.[ind]?.sent ?? 0) > 0)
  )

  // ===== Trigger timing x Reaction rate =====
  const triggerBuckets = [
    { label: '~3日', min: 0, max: 3 },
    { label: '4~7日', min: 4, max: 7 },
    { label: '8~14日', min: 8, max: 14 },
    { label: '15日~', min: 15, max: 9999 },
  ]

  const triggerTimingData = triggerBuckets.map((bucket) => {
    let sent = 0
    let reacted = 0
    for (const l of letters) {
      if (!l.trigger_date || !l.sent_at) continue
      const days = Math.floor(
        (new Date(l.sent_at).getTime() - new Date(l.trigger_date).getTime()) / 86400000
      )
      if (days >= bucket.min && days <= bucket.max) {
        sent++
        const rt = reactionMap.get(l.id)
        if (rt && ['返信あり', '商談化'].includes(rt)) reacted++
      }
    }
    return {
      ...bucket,
      sent,
      reacted,
      rate: sent > 0 ? ((reacted / sent) * 100).toFixed(1) : '0.0',
    }
  })

  // ===== Case Study x Industry Ranking =====
  const csIndustryMap = new Map<string, { sent: number; converted: number }>()
  for (const l of letters) {
    if (!l.case_study_company || !l.industry) continue
    const key = `${l.case_study_company} x ${l.industry}`
    const g = csIndustryMap.get(key) ?? { sent: 0, converted: 0 }
    g.sent++
    const rt = reactionMap.get(l.id)
    if (rt === '商談化') g.converted++
    csIndustryMap.set(key, g)
  }
  const csRanking = Array.from(csIndustryMap.entries())
    .filter(([, v]) => v.sent >= 1)
    .map(([label, v]) => ({
      label,
      sent: v.sent,
      converted: v.converted,
      rate: v.sent > 0 ? ((v.converted / v.sent) * 100).toFixed(1) : '0.0',
    }))
    .sort((a, b) => parseFloat(b.rate) - parseFloat(a.rate))
    .slice(0, 10)

  // ===== Crew Performance =====
  const crewMap = new Map<string, { companies: Set<string>; sent: number; reacted: number; converted: number }>()
  for (const l of letters) {
    const crew = l.crew_id ?? '未設定'
    const g = crewMap.get(crew) ?? { companies: new Set(), sent: 0, reacted: 0, converted: 0 }
    if (l.company_id) g.companies.add(l.company_id)
    g.sent++
    const rt = reactionMap.get(l.id)
    if (rt && ['返信あり', '商談化'].includes(rt)) g.reacted++
    if (rt === '商談化') g.converted++
    crewMap.set(crew, g)
  }
  const crewPerformance = Array.from(crewMap.entries())
    .map(([crew, v]) => ({
      crew,
      companies: v.companies.size,
      sent: v.sent,
      reactionRate: v.sent > 0 ? ((v.reacted / v.sent) * 100).toFixed(1) : '0.0',
      conversionRate: v.sent > 0 ? ((v.converted / v.sent) * 100).toFixed(1) : '0.0',
    }))
    .sort((a, b) => parseFloat(b.reactionRate) - parseFloat(a.reactionRate))

  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-sm text-neutral-900 hover:underline">&larr; ダッシュボード</Link>
          <h1 className="text-2xl font-bold text-neutral-900">インテリジェンス</h1>
        </div>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value as Period)}
          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-900"
        >
          <option value="1m">過去1ヶ月</option>
          <option value="3m">過去3ヶ月</option>
          <option value="6m">過去6ヶ月</option>
          <option value="all">全期間</option>
        </select>
      </div>

      {loading ? (
        <p className="mt-8 text-sm text-neutral-500">読み込み中...</p>
      ) : (
        <>
          {/* データ資産サマリー */}
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-5">
            <AssetCard label="送付累計" value={`${totalSent}通`} />
            <AssetCard label="反応累計" value={`${totalReactions}件`} />
            <AssetCard label="商談化" value={`${totalDeals}件`} />
            <AssetCard label="企業数" value={`${totalCompanies}社`} />
            <AssetCard label="Crew数" value={`${totalCrews}名`} />
          </div>

          {/* Why You x 業種 ヒートマップ */}
          <div className="mt-8">
            <h2 className="text-base font-semibold text-neutral-900">Why You x 業種 反応率ヒートマップ</h2>
            <div className="mt-3 overflow-x-auto rounded-lg border border-neutral-200 bg-white">
              <table className="min-w-full">
                <thead>
                  <tr className="bg-neutral-50">
                    <th className="px-3 py-2 text-left text-xs font-medium text-neutral-500"></th>
                    {activeIndustries.map((ind) => (
                      <th key={ind} className="px-3 py-2 text-center text-xs font-medium text-neutral-500">{ind}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {WHY_YOU_ANGLES.map((angle) => (
                    <tr key={angle}>
                      <td className="px-3 py-2 text-xs font-medium text-neutral-700">{angle}</td>
                      {activeIndustries.map((ind) => {
                        const cell = heatmapData[angle]?.[ind] ?? { sent: 0, reacted: 0 }
                        const rate = cell.sent > 0 ? (cell.reacted / cell.sent) * 100 : 0
                        return (
                          <td key={ind} className="px-3 py-2 text-center">
                            {cell.sent > 0 ? (
                              <span
                                className="inline-block rounded px-2 py-0.5 text-xs font-medium"
                                style={{
                                  backgroundColor: rate > 10 ? '#d1fae5' : rate > 5 ? '#fef3c7' : '#f3f4f6',
                                  color: rate > 10 ? '#065f46' : rate > 5 ? '#92400e' : '#6b7280',
                                }}
                              >
                                {rate.toFixed(1)}%
                              </span>
                            ) : (
                              <span className="text-xs text-neutral-300">-</span>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* シグナル発生→送付日数 x 反応率 */}
          <div className="mt-8">
            <h2 className="text-base font-semibold text-neutral-900">シグナル発生から送付日数 x 反応率</h2>
            <div className="mt-3 space-y-2">
              {triggerTimingData.map((b) => {
                const barWidth = Math.max(parseFloat(b.rate) * 5, 2)
                return (
                  <div key={b.label} className="flex items-center gap-3">
                    <span className="w-16 text-right text-sm text-neutral-600">{b.label}</span>
                    <div className="flex-1">
                      <div
                        className="h-6 rounded bg-neutral-900"
                        style={{ width: `${Math.min(barWidth, 100)}%` }}
                      />
                    </div>
                    <span className="w-20 text-right text-sm font-medium text-neutral-900">
                      {b.rate}% <span className="text-xs text-neutral-400">({b.sent}通)</span>
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* 事例 x 業種 商談化率ランキング */}
          <div className="mt-8">
            <h2 className="text-base font-semibold text-neutral-900">事例 x 業種 商談化率ランキング</h2>
            <div className="mt-3 overflow-x-auto rounded-lg border border-neutral-200 bg-white">
              <table className="min-w-full divide-y divide-neutral-200">
                <thead className="bg-neutral-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-neutral-500">#</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-neutral-500">事例 x 業種</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-neutral-500">商談化率</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-neutral-500">使用回数</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {csRanking.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-4 text-center text-sm text-neutral-400">データなし</td>
                    </tr>
                  ) : (
                    csRanking.map((item, i) => (
                      <tr key={item.label}>
                        <td className="px-4 py-2 text-sm text-neutral-500">{i + 1}</td>
                        <td className="px-4 py-2 text-sm text-neutral-900">{item.label}</td>
                        <td className="px-4 py-2 text-right text-sm font-medium text-neutral-900">{item.rate}%</td>
                        <td className="px-4 py-2 text-right text-sm text-neutral-600">{item.sent}通</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* CSVエクスポート */}
          <div className="mt-8">
            <h2 className="text-base font-semibold text-neutral-900">CSVエクスポート</h2>
            <div className="mt-3 flex flex-wrap gap-3">
              <ExportButton type="contacts" label="コンタクトリスト" description="Salesforce/HubSpotインポート用" />
              <ExportButton type="letters" label="手紙履歴" description="CRM活動履歴追記用" />
              <ExportButton type="reactions" label="反応記録" description="SFA商談フェーズ更新用" />
              <ExportButton type="analytics" label="分析用フルエクスポート" description="BIツール・AI分析用" />
            </div>
          </div>

          {/* Crew別パフォーマンス */}
          <div className="mt-8">
            <h2 className="text-base font-semibold text-neutral-900">Crew別パフォーマンス</h2>
            <div className="mt-3 overflow-x-auto rounded-lg border border-neutral-200 bg-white">
              <table className="min-w-full divide-y divide-neutral-200">
                <thead className="bg-neutral-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-neutral-500">Crew</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-neutral-500">担当社数</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-neutral-500">送付数</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-neutral-500">反応率</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-neutral-500">商談化率</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {crewPerformance.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-4 text-center text-sm text-neutral-400">データなし</td>
                    </tr>
                  ) : (
                    crewPerformance.map((c) => (
                      <tr key={c.crew}>
                        <td className="px-4 py-2 text-sm font-medium text-neutral-900">{c.crew}</td>
                        <td className="px-4 py-2 text-right text-sm text-neutral-600">{c.companies}社</td>
                        <td className="px-4 py-2 text-right text-sm text-neutral-600">{c.sent}通</td>
                        <td className="px-4 py-2 text-right text-sm font-medium text-neutral-900">{c.reactionRate}%</td>
                        <td className="px-4 py-2 text-right text-sm font-medium text-neutral-900">{c.conversionRate}%</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function AssetCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 text-center">
      <p className="text-2xl font-bold text-neutral-900">{value}</p>
      <p className="mt-1 text-xs text-neutral-500">{label}</p>
    </div>
  )
}

function ExportButton({ type, label, description }: { type: string; label: string; description: string }) {
  const handleExport = () => {
    window.open(`/api/export?type=${type}`, '_blank')
  }

  return (
    <button
      onClick={handleExport}
      className="flex flex-col items-start rounded-lg border border-neutral-200 bg-white px-4 py-3 text-left hover:bg-neutral-50"
    >
      <span className="text-sm font-medium text-neutral-900">{label}</span>
      <span className="mt-0.5 text-xs text-neutral-500">{description}</span>
    </button>
  )
}
