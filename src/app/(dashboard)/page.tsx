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

// 3色パレット: ブルー / エメラルド / ニュートラル
const C = {
  primary: '#3b82f6',
  accent: '#10b981',
  muted: '#a3a3a3',
} as const

// ドーナツ用: 3色の濃淡で表現
const DONUT_COLORS: Record<string, string> = {
  '商談化': C.accent,
  '返信あり': C.primary,
  '再送希望': '#93c5fd',   // primary の淡い色
  '失注': '#d4d4d4',       // muted の淡い色
  '無反応': '#e5e5e5',
}

type PeriodMode = 'weekly' | 'monthly'
type CompareMode = 'prev_period' | 'prev_year'

// 日付ユーティリティ
function startOfWeek(d: Date): Date {
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) // 月曜始まり
  return new Date(d.getFullYear(), d.getMonth(), diff)
}

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0]
}

function getPeriodRange(mode: PeriodMode): { start: string; end: string } {
  const now = new Date()
  if (mode === 'monthly') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    return { start: toDateStr(start), end: toDateStr(now) }
  }
  const start = startOfWeek(now)
  return { start: toDateStr(start), end: toDateStr(now) }
}

function getPrevPeriodRange(mode: PeriodMode): { start: string; end: string } {
  const now = new Date()
  if (mode === 'monthly') {
    const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const prevEnd = new Date(now.getFullYear(), now.getMonth(), 0)
    return { start: toDateStr(prevStart), end: toDateStr(prevEnd) }
  }
  const thisWeekStart = startOfWeek(now)
  const prevWeekStart = new Date(thisWeekStart)
  prevWeekStart.setDate(prevWeekStart.getDate() - 7)
  const prevWeekEnd = new Date(thisWeekStart)
  prevWeekEnd.setDate(prevWeekEnd.getDate() - 1)
  return { start: toDateStr(prevWeekStart), end: toDateStr(prevWeekEnd) }
}

function getPrevYearRange(mode: PeriodMode): { start: string; end: string } {
  const now = new Date()
  if (mode === 'monthly') {
    const start = new Date(now.getFullYear() - 1, now.getMonth(), 1)
    const end = new Date(now.getFullYear() - 1, now.getMonth() + 1, 0)
    return { start: toDateStr(start), end: toDateStr(end) }
  }
  const thisWeekStart = startOfWeek(now)
  const lastYearStart = new Date(thisWeekStart)
  lastYearStart.setFullYear(lastYearStart.getFullYear() - 1)
  const lastYearEnd = new Date(lastYearStart)
  lastYearEnd.setDate(lastYearEnd.getDate() + 6)
  return { start: toDateStr(lastYearStart), end: toDateStr(lastYearEnd) }
}

function computePeriodStats(
  letters: LetterData[],
  reactions: ReactionData[],
  range: { start: string; end: string },
) {
  const sent = letters.filter(l => l.sent_at && l.sent_at >= range.start && l.sent_at <= range.end)
  const sentIds = new Set(sent.map(l => l.id))
  const periodReactions = reactions.filter(r =>
    sentIds.has(r.letter_id) || (r.reacted_at && r.reacted_at >= range.start && r.reacted_at <= range.end)
  )
  const reacted = periodReactions.filter(r => ['返信あり', '商談化'].includes(r.reaction_type))
  const deals = periodReactions.filter(r => r.reaction_type === '商談化')

  return {
    sent: sent.length,
    reactions: reacted.length,
    deals: deals.length,
    reactionRate: sent.length > 0 ? parseFloat(((reacted.length / sent.length) * 100).toFixed(1)) : 0,
  }
}

function deltaPercent(current: number, prev: number): { value: string; positive: boolean | null } {
  if (prev === 0 && current === 0) return { value: '-', positive: null }
  if (prev === 0) return { value: '+∞', positive: true }
  const pct = ((current - prev) / prev) * 100
  const sign = pct >= 0 ? '+' : ''
  return { value: `${sign}${pct.toFixed(0)}%`, positive: pct > 0 ? true : pct < 0 ? false : null }
}

export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all')
  const [letters, setLetters] = useState<LetterData[]>([])
  const [reactions, setReactions] = useState<ReactionData[]>([])
  const [companies, setCompanies] = useState<CompanyData[]>([])
  const [totalCompanyCount, setTotalCompanyCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [periodMode, setPeriodMode] = useState<PeriodMode>('monthly')
  const [compareMode, setCompareMode] = useState<CompareMode>('prev_period')

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

  // 期間別KPI（当期 / 前期 / 昨対）
  const periodStats = useMemo(() => {
    const currentRange = getPeriodRange(periodMode)
    const prevRange = compareMode === 'prev_period'
      ? getPrevPeriodRange(periodMode)
      : getPrevYearRange(periodMode)

    const current = computePeriodStats(filteredLetters, filteredReactions, currentRange)
    const prev = computePeriodStats(filteredLetters, filteredReactions, prevRange)

    return {
      current,
      prev,
      delta: {
        sent: deltaPercent(current.sent, prev.sent),
        reactions: deltaPercent(current.reactions, prev.reactions),
        deals: deltaPercent(current.deals, prev.deals),
        reactionRate: deltaPercent(current.reactionRate, prev.reactionRate),
      },
    }
  }, [filteredLetters, filteredReactions, periodMode, compareMode])

  // 累計KPI
  const cumulativeStats = useMemo(() => {
    const sentLetters = filteredLetters.filter(l => l.sent_at)
    const totalSent = sentLetters.length
    const totalGenerated = filteredLetters.length
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

    return { totalGenerated, totalSent, totalReactions: filteredReactions.length, totalDeals, reactionRate, dealRate, avgDaysToReact }
  }, [filteredLetters, filteredReactions])

  // ランキング計算
  function computeRanking(groupFn: (l: LetterData) => string | null) {
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

  // 推移データ（週次 or 月次）
  const trendData = useMemo(() => {
    const buckets = new Map<string, { sent: number; reactions: number; deals: number }>()

    for (const l of filteredLetters) {
      if (!l.sent_at) continue
      const key = periodMode === 'monthly'
        ? l.sent_at.slice(0, 7)
        : toDateStr(startOfWeek(new Date(l.sent_at)))
      const b = buckets.get(key) ?? { sent: 0, reactions: 0, deals: 0 }
      b.sent++
      buckets.set(key, b)
    }

    for (const r of filteredReactions) {
      if (!r.reacted_at) continue
      const key = periodMode === 'monthly'
        ? r.reacted_at.slice(0, 7)
        : toDateStr(startOfWeek(new Date(r.reacted_at)))
      const b = buckets.get(key) ?? { sent: 0, reactions: 0, deals: 0 }
      b.reactions++
      if (r.reaction_type === '商談化') b.deals++
      buckets.set(key, b)
    }

    return Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(periodMode === 'monthly' ? -12 : -16)
      .map(([key, data]) => ({
        label: periodMode === 'monthly'
          ? key.slice(5) + '月'
          : key.slice(5).replace('-', '/') + '〜',
        ...data,
      }))
  }, [filteredLetters, filteredReactions, periodMode])

  // 業種別データ（レーダーチャート用）
  const industryRadar = useMemo(() => {
    const groups = new Map<string, { sent: number; reacted: number }>()
    const sentLetters = filteredLetters.filter(l => l.sent_at)
    for (const l of sentLetters) {
      const industry = l.company_id ? industryMap.get(l.company_id) : null
      if (!industry) continue
      const g = groups.get(industry) ?? { sent: 0, reacted: 0 }
      g.sent++
      const r = filteredReactionMap.get(l.id)
      if (r && ['返信あり', '商談化'].includes(r.reaction_type)) g.reacted++
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

    const industryCompanyCount = new Map<string, number>()
    for (const c of companies) {
      if (!c.industry) continue
      industryCompanyCount.set(c.industry, (industryCompanyCount.get(c.industry) ?? 0) + 1)
    }
    const industryStats = new Map<string, { sent: number; reacted: number }>()
    for (const l of sentLetters) {
      const industry = l.company_id ? industryMap.get(l.company_id) : null
      if (!industry) continue
      const g = industryStats.get(industry) ?? { sent: 0, reacted: 0 }
      g.sent++
      const r = filteredReactionMap.get(l.id)
      if (r && ['返信あり', '商談化'].includes(r.reaction_type)) g.reacted++
      industryStats.set(industry, g)
    }

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

    if (whyYouRanking.length > 0) {
      const bestAngle = whyYouRanking[0]
      if (bestAngle.rate > 0) {
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

  const periodLabel = periodMode === 'monthly' ? '今月' : '今週'
  const compareLabel = compareMode === 'prev_period'
    ? (periodMode === 'monthly' ? '先月比' : '先週比')
    : '昨対比'

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
      {/* ヘッダー */}
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

      {/* 期間切替 + 比較モード */}
      <div className="mt-6 flex items-center gap-3">
        <div className="flex rounded-lg border border-neutral-200 bg-white p-0.5">
          {(['weekly', 'monthly'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setPeriodMode(mode)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                periodMode === mode
                  ? 'bg-neutral-900 text-white'
                  : 'text-neutral-500 hover:text-neutral-900'
              }`}
            >
              {mode === 'weekly' ? '週次' : '月次'}
            </button>
          ))}
        </div>
        <div className="flex rounded-lg border border-neutral-200 bg-white p-0.5">
          {(['prev_period', 'prev_year'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setCompareMode(mode)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                compareMode === mode
                  ? 'bg-neutral-900 text-white'
                  : 'text-neutral-500 hover:text-neutral-900'
              }`}
            >
              {mode === 'prev_period'
                ? (periodMode === 'monthly' ? '先月比' : '先週比')
                : '昨年比'
              }
            </button>
          ))}
        </div>
      </div>

      {/* 当期 KPIカード + 前期比較 */}
      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPICard
          label="送付数" value={periodStats.current.sent} suffix="通" sub={periodLabel}
          delta={periodStats.delta.sent} compareLabel={compareLabel}
          prev={periodStats.prev.sent} prevSuffix="通"
        />
        <KPICard
          label="反応数" value={periodStats.current.reactions} suffix="件" sub={periodLabel}
          delta={periodStats.delta.reactions} compareLabel={compareLabel}
          prev={periodStats.prev.reactions} prevSuffix="件"
        />
        <KPICard
          label="反応率" value={periodStats.current.reactionRate} suffix="%" sub={periodLabel}
          delta={periodStats.delta.reactionRate} compareLabel={compareLabel}
          prev={periodStats.prev.reactionRate} prevSuffix="%"
          isPercent
        />
        <KPICard
          label="商談化" value={periodStats.current.deals} suffix="件" sub={periodLabel}
          delta={periodStats.delta.deals} compareLabel={compareLabel}
          prev={periodStats.prev.deals} prevSuffix="件"
        />
      </div>

      {/* 累計パフォーマンス */}
      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <MiniKPI label="生成数" value={`${cumulativeStats.totalGenerated}`} />
        <MiniKPI label="送付累計" value={`${cumulativeStats.totalSent}通`} />
        <MiniKPI label="反応率" value={`${cumulativeStats.reactionRate}%`} />
        <MiniKPI label="商談化率" value={`${cumulativeStats.dealRate}%`} />
        <MiniKPI label="平均反応日数" value={cumulativeStats.avgDaysToReact === '-' ? '-' : `${cumulativeStats.avgDaysToReact}日`} />
      </div>

      {/* チャートエリア */}
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 推移チャート（週次 or 月次） */}
        {trendData.length > 1 && (
          <div className="rounded-lg border border-neutral-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-neutral-900">
              {periodMode === 'monthly' ? '月次' : '週次'}推移
            </h3>
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke={C.muted} />
                  <YAxis tick={{ fontSize: 12 }} stroke={C.muted} />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: '1px solid #e5e5e5', fontSize: 13 }}
                    animationDuration={200}
                  />
                  <Line
                    type="monotone" dataKey="sent" name="送付" stroke={C.primary} strokeWidth={2}
                    dot={{ r: 4 }} activeDot={{ r: 6 }}
                    animationDuration={1200} animationEasing="ease-in-out"
                  />
                  <Line
                    type="monotone" dataKey="reactions" name="反応" stroke={C.accent} strokeWidth={2}
                    dot={{ r: 4 }} activeDot={{ r: 6 }}
                    animationDuration={1200} animationEasing="ease-in-out" animationBegin={300}
                  />
                  <Line
                    type="monotone" dataKey="deals" name="商談化" stroke={C.muted} strokeWidth={2}
                    strokeDasharray="4 2"
                    dot={{ r: 3 }} activeDot={{ r: 5 }}
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
                      {reactionBreakdown.map((entry) => (
                        <Cell key={entry.name} fill={DONUT_COLORS[entry.name] ?? C.muted} />
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
                {reactionBreakdown.map((entry) => (
                  <div key={entry.name} className="flex items-center gap-2">
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: DONUT_COLORS[entry.name] ?? C.muted }}
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
                  <XAxis type="number" tick={{ fontSize: 12 }} stroke={C.muted} unit="%" />
                  <YAxis
                    dataKey="label" type="category" tick={{ fontSize: 11 }} stroke={C.muted} width={120}
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: '1px solid #e5e5e5', fontSize: 13 }}
                    formatter={(value) => [`${value}%`, '反応率']}
                    animationDuration={200}
                  />
                  <Bar
                    dataKey="rate" fill={C.primary} radius={[0, 6, 6, 0]}
                    animationDuration={1000} animationEasing="ease-out"
                  />
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
                    name="反応率" dataKey="反応率" stroke={C.primary} fill={C.primary} fillOpacity={0.2}
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

        {/* 業種別レーダーが3未満の場合はバーチャート */}
        {industryRadar.length > 0 && industryRadar.length < 3 && industryRanking.length > 0 && (
          <div className="rounded-lg border border-neutral-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-neutral-900">業種別 反応率</h3>
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={industryRanking} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 12 }} stroke={C.muted} unit="%" />
                  <YAxis dataKey="label" type="category" tick={{ fontSize: 11 }} stroke={C.muted} width={100} />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: '1px solid #e5e5e5', fontSize: 13 }}
                    formatter={(value) => [`${value}%`, '反応率']}
                    animationDuration={200}
                  />
                  <Bar
                    dataKey="rate" fill={C.accent} radius={[0, 6, 6, 0]}
                    animationDuration={1000} animationEasing="ease-out"
                  />
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
                <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: C.muted }} />
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
                    h.confidence === 'medium' ? 'bg-blue-50 text-blue-700' :
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
            <DataAsset value={`${cumulativeStats.totalSent}通`} label="送付累計" />
            <DataAsset value={`${totalCompanyCount}社`} label="取引先数" />
            <DataAsset value={`${cumulativeStats.totalReactions}件`} label="反応累計" />
            <DataAsset value={`${cumulativeStats.totalDeals}件`} label="商談化累計" />
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

function KPICard({ label, value, suffix, sub, delta, compareLabel, prev, prevSuffix, isPercent }: {
  label: string; value: number; suffix: string; sub: string
  delta: { value: string; positive: boolean | null }
  compareLabel: string; prev: number; prevSuffix: string
  isPercent?: boolean
}) {
  const [displayValue, setDisplayValue] = useState(0)

  useEffect(() => {
    if (value === 0) { setDisplayValue(0); return }
    const duration = 800
    const steps = 30
    let step = 0
    const timer = setInterval(() => {
      step++
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
        <span className="text-xs text-neutral-400">{sub}</span>
      </div>
      <p className="mt-2 text-3xl font-bold" style={{ color: C.primary }}>
        {isPercent ? displayValue.toFixed(1) : Math.round(displayValue)}{suffix}
      </p>
      {/* 前期比較 */}
      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {delta.positive !== null && (
            <span className={`text-xs font-bold ${delta.positive ? 'text-emerald-600' : 'text-red-500'}`}>
              {delta.positive ? '\u25B2' : '\u25BC'} {delta.value}
            </span>
          )}
          {delta.positive === null && (
            <span className="text-xs text-neutral-400">{delta.value}</span>
          )}
          <span className="text-[10px] text-neutral-400">{compareLabel}</span>
        </div>
        <span className="text-[10px] text-neutral-400">
          前期: {isPercent ? prev.toFixed(1) : prev}{prevSuffix}
        </span>
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
