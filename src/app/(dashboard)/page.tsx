'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

type Project = {
  id: string
  name: string
  client_name: string
  why_you_angle: string | null
  status: string
}

type LetterData = {
  id: string
  project_id: string | null
  why_you_angle: string
  send_trigger: string | null
  sent_at: string | null
  created_at: string
  company_id: string | null
}

type ReactionData = {
  letter_id: string
  reaction_type: string
  reacted_at: string | null
  days_to_react: number | null
}

type CompanyData = {
  id: string
  industry: string
}

export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all')
  const [letters, setLetters] = useState<LetterData[]>([])
  const [reactions, setReactions] = useState<ReactionData[]>([])
  const [companies, setCompanies] = useState<CompanyData[]>([])
  const [totalCompanyCount, setTotalCompanyCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const supabase = createClient()

    const [
      { data: projectsData },
      { data: lettersData },
      { data: reactionsData },
      { data: companiesData },
      { count: companyCount },
    ] = await Promise.all([
      supabase
        .from('projects')
        .select('id, name, why_you_angle, status, clients(name)')
        .order('created_at', { ascending: false }),
      supabase
        .from('letters')
        .select('id, project_id, why_you_angle, send_trigger, sent_at, created_at, contacts(company_id)')
        .limit(1000),
      supabase
        .from('reactions')
        .select('letter_id, reaction_type, reacted_at, days_to_react'),
      supabase
        .from('target_companies')
        .select('id, industry'),
      supabase
        .from('target_companies')
        .select('*', { count: 'exact', head: true }),
    ])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setProjects((projectsData ?? []).map((p: any) => {
      const client = Array.isArray(p.clients) ? p.clients[0] : p.clients
      return { ...p, client_name: client?.name ?? '' }
    }))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setLetters((lettersData ?? []).map((l: any) => {
      const contact = Array.isArray(l.contacts) ? l.contacts[0] : l.contacts
      return { ...l, company_id: contact?.company_id ?? null }
    }))

    setReactions(reactionsData ?? [])
    setCompanies(companiesData ?? [])
    setTotalCompanyCount(companyCount ?? 0)
    setLoading(false)
  }

  // フィルタリング
  const filteredLetters = useMemo(() => {
    if (selectedProjectId === 'all') return letters
    return letters.filter(l => l.project_id === selectedProjectId)
  }, [letters, selectedProjectId])

  const filteredReactionMap = useMemo(() => {
    const letterIds = new Set(filteredLetters.map(l => l.id))
    const map = new Map<string, ReactionData>()
    for (const r of reactions) {
      if (letterIds.has(r.letter_id)) map.set(r.letter_id, r)
    }
    return map
  }, [filteredLetters, reactions])

  const filteredReactions = useMemo(() => {
    const letterIds = new Set(filteredLetters.map(l => l.id))
    return reactions.filter(r => letterIds.has(r.letter_id))
  }, [filteredLetters, reactions])

  const industryMap = useMemo(() => {
    return new Map(companies.map(c => [c.id, c.industry]))
  }, [companies])

  // KPI計算
  const stats = useMemo(() => {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]

    const sentLetters = filteredLetters.filter(l => l.sent_at)
    const sentThisMonth = sentLetters.filter(l => l.sent_at! >= startOfMonth)
    const reactionsThisMonth = filteredReactions.filter(r => r.reacted_at && r.reacted_at >= startOfMonth)
    const dealsThisMonth = reactionsThisMonth.filter(r => r.reaction_type === '商談化')

    const totalSent = sentLetters.length
    const totalGenerated = filteredLetters.length
    const totalReactions = filteredReactions.length
    const totalDeals = filteredReactions.filter(r => r.reaction_type === '商談化').length
    const totalReplies = filteredReactions.filter(r => ['返信あり', '商談化'].includes(r.reaction_type)).length

    const reactionRate = totalSent > 0 ? ((totalReplies / totalSent) * 100).toFixed(1) : '0.0'
    const dealRate = totalSent > 0 ? ((totalDeals / totalSent) * 100).toFixed(1) : '0.0'

    // 平均反応日数
    const daysToReactList = filteredReactions
      .filter(r => r.days_to_react !== null && r.days_to_react >= 0)
      .map(r => r.days_to_react!)
    const avgDaysToReact = daysToReactList.length > 0
      ? (daysToReactList.reduce((a, b) => a + b, 0) / daysToReactList.length).toFixed(1)
      : '-'

    return {
      sentThisMonth: sentThisMonth.length,
      reactionsThisMonth: reactionsThisMonth.length,
      dealsThisMonth: dealsThisMonth.length,
      reactionRateThisMonth: sentThisMonth.length > 0
        ? ((reactionsThisMonth.length / sentThisMonth.length) * 100).toFixed(1) : '0.0',
      totalGenerated,
      totalSent,
      totalReactions,
      totalDeals,
      reactionRate,
      dealRate,
      avgDaysToReact,
    }
  }, [filteredLetters, filteredReactions])

  // ランキング計算
  function computeRanking(
    groupFn: (l: LetterData) => string | null,
  ) {
    const groups = new Map<string, { sent: number; reacted: number }>()
    const sentLetters = filteredLetters.filter(l => l.sent_at)
    for (const l of sentLetters) {
      const key = groupFn(l)
      if (!key) continue
      const g = groups.get(key) ?? { sent: 0, reacted: 0 }
      g.sent++
      const r = filteredReactionMap.get(l.id)
      if (r && ['返信あり', '商談化'].includes(r.reaction_type)) g.reacted++
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
      .slice(0, 5)
  }

  const whyYouRanking = useMemo(() => computeRanking(l => l.why_you_angle), [filteredLetters, filteredReactionMap])
  const triggerRanking = useMemo(() => computeRanking(l => l.send_trigger), [filteredLetters, filteredReactionMap])
  const industryRanking = useMemo(() => computeRanking(l => {
    return l.company_id ? (industryMap.get(l.company_id) ?? null) : null
  }), [filteredLetters, filteredReactionMap, industryMap])

  // 反応種別の内訳
  const reactionBreakdown = useMemo(() => {
    const counts = new Map<string, number>()
    for (const r of filteredReactions) {
      counts.set(r.reaction_type, (counts.get(r.reaction_type) ?? 0) + 1)
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
  }, [filteredReactions])

  const selectedProject = projects.find(p => p.id === selectedProjectId)

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-neutral-900">ダッシュボード</h1>
        <p className="mt-8 text-sm text-neutral-500">読み込み中...</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-neutral-900">ダッシュボード</h1>
        <select
          value={selectedProjectId}
          onChange={(e) => setSelectedProjectId(e.target.value)}
          className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm text-neutral-900"
        >
          <option value="all">全プロジェクト</option>
          {projects.map(p => (
            <option key={p.id} value={p.id}>
              {p.name}{p.client_name ? ` (${p.client_name})` : ''}
            </option>
          ))}
        </select>
      </div>

      {selectedProject && (
        <div className="mt-3 flex items-center gap-3">
          <span className="text-sm text-neutral-500">
            切り口: {selectedProject.why_you_angle ?? '-'}
          </span>
          <Link
            href={`/projects/${selectedProject.id}`}
            className="text-xs text-neutral-500 hover:text-neutral-900 hover:underline"
          >
            プロジェクト詳細 →
          </Link>
        </div>
      )}

      {/* 今月の実績 KPIカード */}
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPICard label="送付数" value={`${stats.sentThisMonth}通`} sub="今月" />
        <KPICard label="反応数" value={`${stats.reactionsThisMonth}件`} sub="今月" />
        <KPICard label="反応率" value={`${stats.reactionRateThisMonth}%`} sub="今月" />
        <KPICard label="商談化" value={`${stats.dealsThisMonth}件`} sub="今月" />
      </div>

      {/* 累計パフォーマンス */}
      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <MiniKPI label="生成数" value={`${stats.totalGenerated}`} />
        <MiniKPI label="送付累計" value={`${stats.totalSent}通`} />
        <MiniKPI label="反応率" value={`${stats.reactionRate}%`} />
        <MiniKPI label="商談化率" value={`${stats.dealRate}%`} />
        <MiniKPI label="平均反応日数" value={stats.avgDaysToReact === '-' ? '-' : `${stats.avgDaysToReact}日`} />
      </div>

      {/* 反応内訳 */}
      {reactionBreakdown.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-neutral-900">反応内訳</h2>
          <div className="mt-3 flex flex-wrap gap-3">
            {reactionBreakdown.map(([type, count]) => {
              const colors: Record<string, string> = {
                '返信あり': 'bg-blue-50 text-blue-700 border-blue-200',
                '商談化': 'bg-emerald-50 text-emerald-700 border-emerald-200',
                '失注': 'bg-red-50 text-red-600 border-red-200',
                '無反応': 'bg-neutral-100 text-neutral-500 border-neutral-200',
                '再送希望': 'bg-amber-50 text-amber-700 border-amber-200',
              }
              return (
                <div key={type} className={`rounded-lg border px-4 py-2 ${colors[type] ?? 'bg-neutral-50 text-neutral-700 border-neutral-200'}`}>
                  <span className="text-lg font-bold">{count}</span>
                  <span className="ml-1.5 text-xs font-medium">{type}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* インテリジェンス */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-neutral-900">インテリジェンス</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <RankingCard title="Why You別 反応率" items={whyYouRanking} />
          <RankingCard title="トリガー別 反応率" items={triggerRanking} />
          <RankingCard title="業種別 反応率" items={industryRanking} />
        </div>
      </div>

      {/* データ資産（全体のみ） */}
      {selectedProjectId === 'all' && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-neutral-900">データ資産</h2>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <DataAsset value={`${stats.totalSent}通`} label="送付累計" />
            <DataAsset value={`${totalCompanyCount}社`} label="取引先数" />
            <DataAsset value={`${stats.totalReactions}件`} label="反応累計" />
            <DataAsset value={`${stats.totalDeals}件`} label="商談化累計" />
          </div>
        </div>
      )}

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

function KPICard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-neutral-500">{label}</p>
        {sub && <span className="text-xs text-neutral-400">{sub}</span>}
      </div>
      <p className="mt-2 text-3xl font-bold text-neutral-900">{value}</p>
    </div>
  )
}

function MiniKPI({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white px-4 py-3">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="mt-1 text-lg font-bold text-neutral-900">{value}</p>
    </div>
  )
}

function RankingCard({ title, items }: { title: string; items: { label: string; rate: string; sent: number; reacted: number }[] }) {
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
                <span className="text-sm font-bold text-neutral-900">{item.rate}%</span>
                <span className="ml-1 text-xs text-neutral-400">({item.reacted}/{item.sent})</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function DataAsset({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 text-center">
      <p className="text-2xl font-bold text-neutral-900">{value}</p>
      <p className="mt-1 text-xs text-neutral-500">{label}</p>
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
