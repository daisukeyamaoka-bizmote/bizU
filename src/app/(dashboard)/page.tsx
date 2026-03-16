'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
} from 'recharts'

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

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1']
const REACTION_COLORS: Record<string, string> = {
  '返信あり': '#3b82f6',
  '商談化': '#10b981',
  '失注': '#ef4444',
  '無反応': '#a3a3a3',
  '再送希望': '#f59e0b',
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
        rate: v.sent > 0 ? parseFloat(((v.reacted / v.sent) * 100).toFixed(1)) : 0,
        sent: v.sent,
        reacted: v.reacted,
      }))
      .sort((a, b) => b.rate - a.rate)
      .slice(0, 5)
  }

  const whyYouRanking = useMemo(() => computeRanking(l => l.why_you_angle), [filteredLetters, filteredReactionMap])
  const industryRanking = useMemo(() => computeRanking(l => {
    return l.company_id ? (industryMap.get(l.company_id) ?? null) : null
  }), [filteredLetters, filteredReactionMap, industryMap])

  // 反応種別の内訳（ドーナツチャート用）
  const reactionBreakdown = useMemo(() => {
    const counts = new Map<string, number>()
    for (const r of filteredReactions) {
      counts.set(r.reaction_type, (counts.get(r.reaction_type) ?? 0) + 1)
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value }))
  }, [filteredReactions])

  // 月次推移データ（ラインチャート用）
  const monthlyTrend = useMemo(() => {
    const months = new Map<string, { sent: number; reactions: number; deals: number }>()
    const sentLetterIds = new Set<string>()

    for (const l of filteredLetters) {
      if (!l.sent_at) continue
      const month = l.sent_at.slice(0, 7) // YYYY-MM
      const m = months.get(month) ?? { sent: 0, reactions: 0, deals: 0 }
      m.sent++
      months.set(month, m)
      sentLetterIds.add(l.id)
    }

    for (const r of filteredReactions) {
      if (!r.reacted_at) continue
      const month = r.reacted_at.slice(0, 7)
      const m = months.get(month) ?? { sent: 0, reactions: 0, deals: 0 }
      m.reactions++
      if (r.reaction_type === '商談化') m.deals++
      months.set(month, m)
    }

    return Array.from(months.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([month, data]) => ({
        month: month.slice(5) + '月',
        ...data,
      }))
  }, [filteredLetters, filteredReactions])

  // 業種別データ（レーダーチャート用）
  const industryRadar = useMemo(() => {
    const groups = new Map<string, { sent: number; reacted: number; deals: number }>()
    const sentLetters = filteredLetters.filter(l => l.sent_at)
    for (const l of sentLetters) {
      const industry = l.company_id ? industryMap.get(l.company_id) : null
      if (!industry) continue
      const g = groups.get(industry) ?? { sent: 0, reacted: 0, deals: 0 }
      g.sent++
      const r = filteredReactionMap.get(l.id)
      if (r && ['返信あり', '商談化'].includes(r.reaction_type)) g.reacted++
      if (r && r.reaction_type === '商談化') g.deals++
      groups.set(industry, g)
    }
    return Array.from(groups.entries())
      .sort((a, b) => b[1].sent - a[1].sent)
      .slice(0, 6)
      .map(([industry, data]) => ({
        industry,
        反応率: data.sent > 0 ? parseFloat(((data.reacted / data.sent) * 100).toFixed(1)) : 0,
        送付数: data.sent,
      }))
  }, [filteredLetters, filteredReactionMap, industryMap])

  // 定性インサイト生成
  const insights = useMemo(() => {
    const result: string[] = []
    const sentLetters = filteredLetters.filter(l => l.sent_at)
    if (sentLetters.length === 0) return result

    if (whyYouRanking.length > 0) {
      const best = whyYouRanking[0]
      if (best.rate > 0) {
        result.push(`「${best.label}」の切り口が最も反応率が高く${best.rate}%（${best.reacted}/${best.sent}件）です。`)
      }
      if (whyYouRanking.length >= 2) {
        const worst = whyYouRanking[whyYouRanking.length - 1]
        if (worst.rate === 0 && worst.sent >= 3) {
          result.push(`「${worst.label}」は${worst.sent}件送付で反応ゼロです。切り口の見直しを検討してください。`)
        }
      }
    }

    if (industryRanking.length > 0) {
      const best = industryRanking[0]
      if (best.rate > 0) {
        result.push(`業種別では「${best.label}」が反応率${best.rate}%と最も効果的です。`)
      }
    }

    const daysToReactList = filteredReactions
      .filter(r => r.days_to_react !== null && r.days_to_react >= 0)
      .map(r => r.days_to_react!)
    if (daysToReactList.length >= 3) {
      const avg = daysToReactList.reduce((a, b) => a + b, 0) / daysToReactList.length
      const fast = daysToReactList.filter(d => d <= 7).length
      const fastPct = ((fast / daysToReactList.length) * 100).toFixed(0)
      if (avg <= 7) {
        result.push(`平均${avg.toFixed(1)}日で反応を獲得。反応速度は良好です。`)
      } else if (avg <= 14) {
        result.push(`反応までの平均日数は${avg.toFixed(1)}日。${fastPct}%が1週間以内に反応しています。`)
      } else {
        result.push(`反応まで平均${avg.toFixed(1)}日かかっています。送付タイミングの最適化で短縮できる可能性があります。`)
      }
    }

    const deals = filteredReactions.filter(r => r.reaction_type === '商談化')
    const replies = filteredReactions.filter(r => r.reaction_type === '返信あり')
    if (deals.length > 0 && replies.length > 0) {
      const convRate = ((deals.length / (deals.length + replies.length)) * 100).toFixed(0)
      result.push(`返信のうち${convRate}%が商談化に至っています。`)
    }

    const totalReactions = filteredReactions.length
    const reactionRate = totalReactions / sentLetters.length
    if (sentLetters.length >= 5) {
      if (reactionRate >= 0.1) {
        result.push(`全体反応率${(reactionRate * 100).toFixed(1)}%はDM施策として高い水準です。`)
      } else if (reactionRate > 0) {
        result.push(`反応率${(reactionRate * 100).toFixed(1)}%。送付先の精査と切り口の見直しで改善の余地があります。`)
      }
    }

    if (sentLetters.length > 0 && totalReactions === 0) {
      result.push('送付済みの手紙にまだ反応がありません。フォローコールを検討してください。')
    }

    return result
  }, [filteredLetters, filteredReactions, whyYouRanking, industryRanking])

  // ターゲット仮説生成
  const targetHypotheses = useMemo(() => {
    const hypotheses: { title: string; description: string; confidence: 'high' | 'medium' | 'low' }[] = []
    const sentLetters = filteredLetters.filter(l => l.sent_at)
    if (sentLetters.length < 3) return hypotheses

    // 業種 × 切り口のクロス分析
    const crossMap = new Map<string, { sent: number; reacted: number; deals: number }>()
    for (const l of sentLetters) {
      const industry = l.company_id ? industryMap.get(l.company_id) : null
      if (!industry) continue
      const key = `${industry}|${l.why_you_angle}`
      const g = crossMap.get(key) ?? { sent: 0, reacted: 0, deals: 0 }
      g.sent++
      const r = filteredReactionMap.get(l.id)
      if (r && ['返信あり', '商談化'].includes(r.reaction_type)) g.reacted++
      if (r && r.reaction_type === '商談化') g.deals++
      crossMap.set(key, g)
    }

    // 高反応の業種×切り口コンボを抽出
    const combos = Array.from(crossMap.entries())
      .filter(([, v]) => v.sent >= 2 && v.reacted > 0)
      .map(([key, v]) => {
        const [industry, angle] = key.split('|')
        return { industry, angle, ...v, rate: (v.reacted / v.sent) * 100 }
      })
      .sort((a, b) => b.rate - a.rate)

    if (combos.length > 0) {
      const best = combos[0]
      hypotheses.push({
        title: `${best.industry} × 「${best.angle}」が有望`,
        description: `反応率${best.rate.toFixed(0)}%（${best.reacted}/${best.sent}件）。同業種の未送付企業への横展開が効果的です。`,
        confidence: best.sent >= 5 ? 'high' : best.sent >= 3 ? 'medium' : 'low',
      })
    }

    // 未開拓の高ポテンシャル業種
    const industryStats = new Map<string, { sent: number; reacted: number; total: number }>()
    const industryCompanyCount = new Map<string, number>()
    for (const c of companies) {
      if (!c.industry) continue
      industryCompanyCount.set(c.industry, (industryCompanyCount.get(c.industry) ?? 0) + 1)
    }
    for (const l of sentLetters) {
      const industry = l.company_id ? industryMap.get(l.company_id) : null
      if (!industry) continue
      const g = industryStats.get(industry) ?? { sent: 0, reacted: 0, total: industryCompanyCount.get(industry) ?? 0 }
      g.sent++
      const r = filteredReactionMap.get(l.id)
      if (r && ['返信あり', '商談化'].includes(r.reaction_type)) g.reacted++
      industryStats.set(industry, g)
    }

    // 反応率が高いが送付カバー率が低い業種
    for (const [industry, data] of industryStats) {
      const total = industryCompanyCount.get(industry) ?? 0
      if (total <= 0 || data.sent < 2) continue
      const rate = (data.reacted / data.sent) * 100
      const coverage = (data.sent / total) * 100
      if (rate >= 20 && coverage < 50) {
        hypotheses.push({
          title: `${industry}の送付拡大（カバー率${coverage.toFixed(0)}%）`,
          description: `反応率${rate.toFixed(0)}%と好調ですが、${total}社中${data.sent}社のみに送付。残り${total - data.sent}社へのアプローチで追加反応が見込めます。`,
          confidence: rate >= 30 ? 'high' : 'medium',
        })
      }
    }

    // 切り口の横展開提案
    if (whyYouRanking.length > 0) {
      const bestAngle = whyYouRanking[0]
      if (bestAngle.rate > 0) {
        // この切り口がまだ使われていない業種を探す
        const angledIndustries = new Set<string>()
        for (const l of sentLetters) {
          if (l.why_you_angle !== bestAngle.label) continue
          const ind = l.company_id ? industryMap.get(l.company_id) : null
          if (ind) angledIndustries.add(ind)
        }
        const untried = Array.from(industryCompanyCount.entries())
          .filter(([ind]) => !angledIndustries.has(ind) && (industryCompanyCount.get(ind) ?? 0) >= 3)
          .sort((a, b) => b[1] - a[1])

        if (untried.length > 0) {
          hypotheses.push({
            title: `「${bestAngle.label}」を${untried[0][0]}に展開`,
            description: `最高反応率の切り口をまだ試していない${untried[0][0]}（${untried[0][1]}社）に横展開すると効果が期待できます。`,
            confidence: 'medium',
          })
        }
      }
    }

    return hypotheses.slice(0, 4)
  }, [filteredLetters, filteredReactionMap, industryMap, companies, whyYouRanking])

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
        <KPICard label="送付数" value={stats.sentThisMonth} suffix="通" sub="今月" color="#3b82f6" />
        <KPICard label="反応数" value={stats.reactionsThisMonth} suffix="件" sub="今月" color="#10b981" />
        <KPICard label="反応率" value={parseFloat(stats.reactionRateThisMonth)} suffix="%" sub="今月" color="#f59e0b" />
        <KPICard label="商談化" value={stats.dealsThisMonth} suffix="件" sub="今月" color="#8b5cf6" />
      </div>

      {/* 累計パフォーマンス */}
      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <MiniKPI label="生成数" value={`${stats.totalGenerated}`} />
        <MiniKPI label="送付累計" value={`${stats.totalSent}通`} />
        <MiniKPI label="反応率" value={`${stats.reactionRate}%`} />
        <MiniKPI label="商談化率" value={`${stats.dealRate}%`} />
        <MiniKPI label="平均反応日数" value={stats.avgDaysToReact === '-' ? '-' : `${stats.avgDaysToReact}日`} />
      </div>

      {/* チャートエリア */}
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 月次推移 */}
        {monthlyTrend.length > 1 && (
          <div className="rounded-lg border border-neutral-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-neutral-900">月次推移</h3>
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthlyTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#a3a3a3" />
                  <YAxis tick={{ fontSize: 12 }} stroke="#a3a3a3" />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: '1px solid #e5e5e5', fontSize: 13 }}
                    animationDuration={200}
                  />
                  <Line
                    type="monotone" dataKey="sent" name="送付" stroke="#3b82f6" strokeWidth={2}
                    dot={{ r: 4 }} activeDot={{ r: 6 }}
                    animationDuration={1200} animationEasing="ease-in-out"
                  />
                  <Line
                    type="monotone" dataKey="reactions" name="反応" stroke="#10b981" strokeWidth={2}
                    dot={{ r: 4 }} activeDot={{ r: 6 }}
                    animationDuration={1200} animationEasing="ease-in-out" animationBegin={300}
                  />
                  <Line
                    type="monotone" dataKey="deals" name="商談化" stroke="#8b5cf6" strokeWidth={2}
                    dot={{ r: 4 }} activeDot={{ r: 6 }}
                    animationDuration={1200} animationEasing="ease-in-out" animationBegin={600}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* 反応内訳ドーナツ */}
        {reactionBreakdown.length > 0 && (
          <div className="rounded-lg border border-neutral-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-neutral-900">反応内訳</h3>
            <div className="mt-4 flex items-center gap-4">
              <div className="h-56 w-56 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={reactionBreakdown}
                      cx="50%" cy="50%"
                      innerRadius={55} outerRadius={85}
                      dataKey="value"
                      animationDuration={1000} animationEasing="ease-out"
                      stroke="none"
                    >
                      {reactionBreakdown.map((entry, i) => (
                        <Cell key={entry.name} fill={REACTION_COLORS[entry.name] ?? COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ borderRadius: 8, border: '1px solid #e5e5e5', fontSize: 13 }}
                      animationDuration={200}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2">
                {reactionBreakdown.map((entry, i) => (
                  <div key={entry.name} className="flex items-center gap-2">
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: REACTION_COLORS[entry.name] ?? COLORS[i % COLORS.length] }}
                    />
                    <span className="text-sm text-neutral-700">{entry.name}</span>
                    <span className="text-sm font-bold text-neutral-900">{entry.value}件</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Why You別 反応率バーチャート */}
        {whyYouRanking.length > 0 && (
          <div className="rounded-lg border border-neutral-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-neutral-900">切り口別 反応率</h3>
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={whyYouRanking} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 12 }} stroke="#a3a3a3" unit="%" />
                  <YAxis
                    dataKey="label" type="category" tick={{ fontSize: 11 }} stroke="#a3a3a3" width={120}
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: '1px solid #e5e5e5', fontSize: 13 }}
                    formatter={(value) => [`${value}%`, '反応率']}
                    animationDuration={200}
                  />
                  <Bar
                    dataKey="rate" fill="#3b82f6" radius={[0, 6, 6, 0]}
                    animationDuration={1000} animationEasing="ease-out"
                  >
                    {whyYouRanking.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* 業種別レーダーチャート */}
        {industryRadar.length >= 3 && (
          <div className="rounded-lg border border-neutral-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-neutral-900">業種別 反応率マップ</h3>
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={industryRadar}>
                  <PolarGrid stroke="#e5e5e5" />
                  <PolarAngleAxis dataKey="industry" tick={{ fontSize: 11 }} />
                  <PolarRadiusAxis tick={{ fontSize: 10 }} />
                  <Radar
                    name="反応率" dataKey="反応率" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3}
                    animationDuration={1200} animationEasing="ease-out"
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: '1px solid #e5e5e5', fontSize: 13 }}
                    animationDuration={200}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* 業種別レーダーが3未満の場合は通常のバーチャート */}
        {industryRadar.length > 0 && industryRadar.length < 3 && industryRanking.length > 0 && (
          <div className="rounded-lg border border-neutral-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-neutral-900">業種別 反応率</h3>
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={industryRanking} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 12 }} stroke="#a3a3a3" unit="%" />
                  <YAxis dataKey="label" type="category" tick={{ fontSize: 11 }} stroke="#a3a3a3" width={100} />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: '1px solid #e5e5e5', fontSize: 13 }}
                    formatter={(value) => [`${value}%`, '反応率']}
                    animationDuration={200}
                  />
                  <Bar
                    dataKey="rate" fill="#10b981" radius={[0, 6, 6, 0]}
                    animationDuration={1000} animationEasing="ease-out"
                  >
                    {industryRanking.map((_, i) => (
                      <Cell key={i} fill={COLORS[(i + 1) % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* 定性インサイト */}
      {insights.length > 0 && (
        <div className="mt-6 rounded-lg border border-neutral-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-neutral-900">状況サマリー</h3>
          <ul className="mt-3 space-y-2">
            {insights.map((text, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-neutral-700">
                <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-neutral-400" />
                {text}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ターゲット仮説 */}
      {targetHypotheses.length > 0 && (
        <div className="mt-6">
          <h2 className="text-lg font-semibold text-neutral-900">ターゲット仮説</h2>
          <p className="mt-1 text-xs text-neutral-500">蓄積データから次のアプローチ先を提案します</p>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {targetHypotheses.map((h, i) => (
              <div key={i} className="rounded-lg border border-neutral-200 bg-white p-5">
                <div className="flex items-start justify-between gap-2">
                  <h4 className="text-sm font-semibold text-neutral-900">{h.title}</h4>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    h.confidence === 'high' ? 'bg-emerald-50 text-emerald-700' :
                    h.confidence === 'medium' ? 'bg-amber-50 text-amber-700' :
                    'bg-neutral-100 text-neutral-500'
                  }`}>
                    {h.confidence === 'high' ? '確度高' : h.confidence === 'medium' ? '確度中' : '確度低'}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-neutral-600">{h.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

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

function KPICard({ label, value, suffix, sub, color }: {
  label: string; value: number; suffix: string; sub?: string; color: string
}) {
  const [displayValue, setDisplayValue] = useState(0)

  useEffect(() => {
    if (value === 0) { setDisplayValue(0); return }
    const duration = 800
    const steps = 30
    const increment = value / steps
    let current = 0
    let step = 0
    const timer = setInterval(() => {
      step++
      current = Math.min(current + increment, value)
      // ease-out
      const progress = step / steps
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplayValue(parseFloat((value * eased).toFixed(1)))
      if (step >= steps) {
        setDisplayValue(value)
        clearInterval(timer)
      }
    }, duration / steps)
    return () => clearInterval(timer)
  }, [value])

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-5 transition-shadow hover:shadow-md">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-neutral-500">{label}</p>
        {sub && <span className="text-xs text-neutral-400">{sub}</span>}
      </div>
      <p className="mt-2 text-3xl font-bold" style={{ color }}>
        {suffix === '%' ? displayValue.toFixed(1) : Math.round(displayValue)}{suffix}
      </p>
      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-neutral-100">
        <div
          className="h-full rounded-full transition-all duration-1000 ease-out"
          style={{ width: `${Math.min((value / Math.max(value, 1)) * 100, 100)}%`, backgroundColor: color }}
        />
      </div>
    </div>
  )
}

function MiniKPI({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white px-4 py-3 transition-shadow hover:shadow-md">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="mt-1 text-lg font-bold text-neutral-900">{value}</p>
    </div>
  )
}

function DataAsset({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 text-center transition-shadow hover:shadow-md">
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
      className="flex flex-col items-start rounded-lg border border-neutral-200 bg-white px-4 py-3 text-left transition-shadow hover:bg-neutral-50 hover:shadow-md"
    >
      <span className="text-sm font-medium text-neutral-900">{label}</span>
      <span className="mt-0.5 text-xs text-neutral-500">{description}</span>
    </a>
  )
}
