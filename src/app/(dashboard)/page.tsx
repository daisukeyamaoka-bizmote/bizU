'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  FunnelChart, Funnel, LabelList,
} from 'recharts'
import { format, startOfWeek as dateFnsStartOfWeek, startOfMonth, endOfMonth, subMonths, subWeeks, subYears, eachMonthOfInterval, isWithinInterval, parseISO } from 'date-fns'
import { ja } from 'date-fns/locale'
import { DayPicker } from 'react-day-picker'
import 'react-day-picker/style.css'

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

// 3色パレット
const C = { primary: '#3b82f6', accent: '#10b981', muted: '#a3a3a3' } as const
const DONUT_COLORS: Record<string, string> = {
  '商談化': C.accent, '返信あり': C.primary, '再送希望': '#93c5fd', '失注': '#d4d4d4', '無反応': '#e5e5e5',
}

type PeriodMode = 'weekly' | 'monthly' | 'custom'
type CompareMode = 'prev_period' | 'prev_year'

function toDateStr(d: Date): string { return format(d, 'yyyy-MM-dd') }

function getPresetRange(mode: 'weekly' | 'monthly'): { from: Date; to: Date } {
  const now = new Date()
  if (mode === 'monthly') return { from: startOfMonth(now), to: now }
  return { from: dateFnsStartOfWeek(now, { weekStartsOn: 1 }), to: now }
}

function getCompareRange(currentFrom: Date, currentTo: Date, mode: CompareMode): { from: Date; to: Date } {
  const span = currentTo.getTime() - currentFrom.getTime()
  if (mode === 'prev_year') {
    return { from: subYears(currentFrom, 1), to: subYears(currentTo, 1) }
  }
  const prevTo = new Date(currentFrom.getTime() - 86400000)
  const prevFrom = new Date(prevTo.getTime() - span)
  return { from: prevFrom, to: prevTo }
}

function inRange(dateStr: string | null, from: Date, to: Date): boolean {
  if (!dateStr) return false
  try {
    return isWithinInterval(parseISO(dateStr), { start: from, end: to })
  } catch { return false }
}

function computePeriodStats(
  letters: LetterData[], reactions: ReactionData[], reactionMap: Map<string, ReactionData>,
  from: Date, to: Date,
) {
  const sent = letters.filter(l => inRange(l.sent_at, from, to))
  const sentIds = new Set(sent.map(l => l.id))
  const periodReactions = reactions.filter(r => sentIds.has(r.letter_id))
  const reacted = periodReactions.filter(r => ['返信あり', '商談化'].includes(r.reaction_type))
  const deals = periodReactions.filter(r => r.reaction_type === '商談化')

  return {
    sent: sent.length, reactions: reacted.length, deals: deals.length,
    reactionRate: sent.length > 0 ? parseFloat(((reacted.length / sent.length) * 100).toFixed(1)) : 0,
  }
}

function delta(current: number, prev: number): { value: string; positive: boolean | null } {
  if (prev === 0 && current === 0) return { value: '-', positive: null }
  if (prev === 0) return { value: '+∞', positive: true }
  const pct = ((current - prev) / prev) * 100
  return { value: `${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%`, positive: pct > 0 ? true : pct < 0 ? false : null }
}

export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all')
  const [selectedAngle, setSelectedAngle] = useState<string>('all')
  const [letters, setLetters] = useState<LetterData[]>([])
  const [reactions, setReactions] = useState<ReactionData[]>([])
  const [companies, setCompanies] = useState<CompanyData[]>([])
  const [totalCompanyCount, setTotalCompanyCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const [periodMode, setPeriodMode] = useState<PeriodMode>('monthly')
  const [compareMode, setCompareMode] = useState<CompareMode>('prev_period')
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>(getPresetRange('monthly'))
  const [calendarOpen, setCalendarOpen] = useState(false)
  const calendarRef = useRef<HTMLDivElement>(null)

  // カレンダー外クリックで閉じる
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (calendarRef.current && !calendarRef.current.contains(e.target as Node)) setCalendarOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // プリセット切替時に日付レンジも更新
  useEffect(() => {
    if (periodMode !== 'custom') setDateRange(getPresetRange(periodMode as 'weekly' | 'monthly'))
  }, [periodMode])

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const supabase = createClient()
    const [
      { data: projectsData }, { data: lettersData }, { data: reactionsData },
      { data: companiesData }, { count: companyCount },
    ] = await Promise.all([
      supabase.from('projects').select('id, name, why_you_angle, status, clients(name)').order('created_at', { ascending: false }),
      supabase.from('letters').select('id, project_id, why_you_angle, send_trigger, sent_at, created_at, contacts(company_id)').limit(1000),
      supabase.from('reactions').select('letter_id, reaction_type, reacted_at, days_to_react'),
      supabase.from('target_companies').select('id, industry'),
      supabase.from('target_companies').select('*', { count: 'exact', head: true }),
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

  // 訴求軸の一覧を抽出
  const angleOptions = useMemo(() => {
    const set = new Set<string>()
    for (const l of letters) { if (l.why_you_angle) set.add(l.why_you_angle) }
    return Array.from(set).sort()
  }, [letters])

  // フィルタリング（プロジェクト + 訴求軸）
  const filteredLetters = useMemo(() => {
    let result = letters
    if (selectedProjectId !== 'all') result = result.filter(l => l.project_id === selectedProjectId)
    if (selectedAngle !== 'all') result = result.filter(l => l.why_you_angle === selectedAngle)
    return result
  }, [letters, selectedProjectId, selectedAngle])

  const filteredReactionMap = useMemo(() => {
    const ids = new Set(filteredLetters.map(l => l.id))
    const map = new Map<string, ReactionData>()
    for (const r of reactions) { if (ids.has(r.letter_id)) map.set(r.letter_id, r) }
    return map
  }, [filteredLetters, reactions])

  const filteredReactions = useMemo(() => {
    const ids = new Set(filteredLetters.map(l => l.id))
    return reactions.filter(r => ids.has(r.letter_id))
  }, [filteredLetters, reactions])

  const industryMap = useMemo(() => new Map(companies.map(c => [c.id, c.industry])), [companies])

  // 期間別KPI + 前期比較
  const periodStats = useMemo(() => {
    const { from, to } = dateRange
    const compRange = getCompareRange(from, to, compareMode)
    const current = computePeriodStats(filteredLetters, filteredReactions, filteredReactionMap, from, to)
    const prev = computePeriodStats(filteredLetters, filteredReactions, filteredReactionMap, compRange.from, compRange.to)
    return {
      current, prev,
      delta: {
        sent: delta(current.sent, prev.sent),
        reactions: delta(current.reactions, prev.reactions),
        deals: delta(current.deals, prev.deals),
        reactionRate: delta(current.reactionRate, prev.reactionRate),
      },
    }
  }, [filteredLetters, filteredReactions, filteredReactionMap, dateRange, compareMode])

  // 累計KPI
  const cumulativeStats = useMemo(() => {
    const sentLetters = filteredLetters.filter(l => l.sent_at)
    const totalSent = sentLetters.length
    const totalDeals = filteredReactions.filter(r => r.reaction_type === '商談化').length
    const totalReplies = filteredReactions.filter(r => ['返信あり', '商談化'].includes(r.reaction_type)).length
    const reactionRate = totalSent > 0 ? ((totalReplies / totalSent) * 100).toFixed(1) : '0.0'
    const dealRate = totalSent > 0 ? ((totalDeals / totalSent) * 100).toFixed(1) : '0.0'
    const daysToReactList = filteredReactions.filter(r => r.days_to_react !== null && r.days_to_react >= 0).map(r => r.days_to_react!)
    const avgDaysToReact = daysToReactList.length > 0
      ? (daysToReactList.reduce((a, b) => a + b, 0) / daysToReactList.length).toFixed(1) : '-'
    return { totalGenerated: filteredLetters.length, totalSent, totalReactions: filteredReactions.length, totalDeals, reactionRate, dealRate, avgDaysToReact }
  }, [filteredLetters, filteredReactions])

  // ABMファネル分析
  const funnelData = useMemo(() => {
    const sentLetters = filteredLetters.filter(l => l.sent_at)
    const totalSent = sentLetters.length
    const sentIds = new Set(sentLetters.map(l => l.id))
    const allReacted = filteredReactions.filter(r => sentIds.has(r.letter_id))
    const replied = allReacted.filter(r => ['返信あり', '商談化'].includes(r.reaction_type))
    const deals = allReacted.filter(r => r.reaction_type === '商談化')

    if (totalSent === 0) return []
    return [
      { name: '送付', value: totalSent, fill: C.primary },
      { name: '反応あり', value: allReacted.length, fill: '#93c5fd' },
      { name: '返信', value: replied.length, fill: C.accent },
      { name: '商談化', value: deals.length, fill: '#065f46' },
    ].filter(d => d.value > 0 || d.name === '送付')
  }, [filteredLetters, filteredReactions])

  // ファネル転換率
  const funnelConversions = useMemo(() => {
    if (funnelData.length < 2) return []
    return funnelData.slice(1).map((d, i) => ({
      from: funnelData[i].name,
      to: d.name,
      rate: funnelData[i].value > 0 ? ((d.value / funnelData[i].value) * 100).toFixed(1) : '0.0',
    }))
  }, [funnelData])

  // アカウント浸透率（業種別）
  const penetrationData = useMemo(() => {
    const industryCompanyCount = new Map<string, number>()
    for (const c of companies) { if (c.industry) industryCompanyCount.set(c.industry, (industryCompanyCount.get(c.industry) ?? 0) + 1) }

    const sentCompanies = new Map<string, Set<string>>()
    for (const l of filteredLetters.filter(l => l.sent_at && l.company_id)) {
      const ind = industryMap.get(l.company_id!)
      if (!ind) continue
      if (!sentCompanies.has(ind)) sentCompanies.set(ind, new Set())
      sentCompanies.get(ind)!.add(l.company_id!)
    }

    return Array.from(industryCompanyCount.entries())
      .map(([industry, total]) => {
        const reached = sentCompanies.get(industry)?.size ?? 0
        return { industry, total, reached, rate: total > 0 ? parseFloat(((reached / total) * 100).toFixed(1)) : 0 }
      })
      .filter(d => d.total >= 1)
      .sort((a, b) => b.rate - a.rate)
      .slice(0, 8)
  }, [filteredLetters, companies, industryMap])

  // パイプライン速度（反応タイプ別の平均日数）
  const pipelineVelocity = useMemo(() => {
    const groups = new Map<string, number[]>()
    for (const r of filteredReactions) {
      if (r.days_to_react === null || r.days_to_react < 0) continue
      const list = groups.get(r.reaction_type) ?? []
      list.push(r.days_to_react)
      groups.set(r.reaction_type, list)
    }
    return Array.from(groups.entries())
      .map(([type, days]) => ({
        type,
        avg: parseFloat((days.reduce((a, b) => a + b, 0) / days.length).toFixed(1)),
        count: days.length,
      }))
      .sort((a, b) => a.avg - b.avg)
  }, [filteredReactions])

  // コホート分析（送付月ごとの反応率推移）
  const cohortData = useMemo(() => {
    const sentLetters = filteredLetters.filter(l => l.sent_at)
    if (sentLetters.length === 0) return []

    // 送付月ごとにグルーピング
    const cohorts = new Map<string, { letters: LetterData[]; sentIds: Set<string> }>()
    for (const l of sentLetters) {
      const month = l.sent_at!.slice(0, 7)
      const c = cohorts.get(month) ?? { letters: [], sentIds: new Set() }
      c.letters.push(l)
      c.sentIds.add(l.id)
      cohorts.set(month, c)
    }

    // 各コホートの反応を月ごとに集計
    const sortedMonths = Array.from(cohorts.keys()).sort()
    const allMonths = sortedMonths.length > 0
      ? eachMonthOfInterval({ start: parseISO(sortedMonths[0] + '-01'), end: new Date() }).map(d => format(d, 'yyyy-MM'))
      : []

    return sortedMonths.slice(-6).map(cohortMonth => {
      const { sentIds, letters: cohortLetters } = cohorts.get(cohortMonth)!
      const cohortReactions = filteredReactions.filter(r => sentIds.has(r.letter_id) && r.reacted_at)

      // 累積反応率を月ごとに計算
      const monthlyRates: Record<string, number> = {}
      let cumReacted = 0
      const reactionsByMonth = new Map<string, number>()
      for (const r of cohortReactions) {
        const rm = r.reacted_at!.slice(0, 7)
        reactionsByMonth.set(rm, (reactionsByMonth.get(rm) ?? 0) + 1)
      }

      for (const m of allMonths) {
        if (m < cohortMonth) continue
        cumReacted += (reactionsByMonth.get(m) ?? 0)
        const monthIdx = allMonths.indexOf(m) - allMonths.indexOf(cohortMonth)
        if (monthIdx >= 0 && monthIdx <= 5) {
          monthlyRates[`M${monthIdx}`] = cohortLetters.length > 0
            ? parseFloat(((cumReacted / cohortLetters.length) * 100).toFixed(1)) : 0
        }
      }

      return {
        cohort: cohortMonth.slice(5) + '月コホート',
        sent: cohortLetters.length,
        ...monthlyRates,
      }
    })
  }, [filteredLetters, filteredReactions])

  // ランキング計算
  function computeRanking(groupFn: (l: LetterData) => string | null) {
    const groups = new Map<string, { sent: number; reacted: number }>()
    for (const l of filteredLetters.filter(l => l.sent_at)) {
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
      .map(([label, v]) => ({ label, rate: v.sent > 0 ? parseFloat(((v.reacted / v.sent) * 100).toFixed(1)) : 0, sent: v.sent, reacted: v.reacted }))
      .sort((a, b) => b.rate - a.rate)
      .slice(0, 5)
  }

  const whyYouRanking = useMemo(() => computeRanking(l => l.why_you_angle), [filteredLetters, filteredReactionMap])
  const industryRanking = useMemo(() => computeRanking(l => l.company_id ? (industryMap.get(l.company_id) ?? null) : null), [filteredLetters, filteredReactionMap, industryMap])

  // 反応内訳
  const reactionBreakdown = useMemo(() => {
    const counts = new Map<string, number>()
    for (const r of filteredReactions) counts.set(r.reaction_type, (counts.get(r.reaction_type) ?? 0) + 1)
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }))
  }, [filteredReactions])

  // 推移データ
  const trendData = useMemo(() => {
    const bucketMode = periodMode === 'weekly' ? 'weekly' : 'monthly'
    const buckets = new Map<string, { sent: number; reactions: number; deals: number }>()
    for (const l of filteredLetters) {
      if (!l.sent_at) continue
      const d = parseISO(l.sent_at)
      const key = bucketMode === 'monthly' ? format(d, 'yyyy-MM') : toDateStr(dateFnsStartOfWeek(d, { weekStartsOn: 1 }))
      const b = buckets.get(key) ?? { sent: 0, reactions: 0, deals: 0 }
      b.sent++; buckets.set(key, b)
    }
    for (const r of filteredReactions) {
      if (!r.reacted_at) continue
      const d = parseISO(r.reacted_at)
      const key = bucketMode === 'monthly' ? format(d, 'yyyy-MM') : toDateStr(dateFnsStartOfWeek(d, { weekStartsOn: 1 }))
      const b = buckets.get(key) ?? { sent: 0, reactions: 0, deals: 0 }
      b.reactions++; if (r.reaction_type === '商談化') b.deals++; buckets.set(key, b)
    }
    return Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(bucketMode === 'monthly' ? -12 : -16)
      .map(([key, data]) => ({
        label: bucketMode === 'monthly' ? key.slice(5) + '月' : key.slice(5).replace('-', '/') + '〜',
        ...data,
      }))
  }, [filteredLetters, filteredReactions, periodMode])

  // 業種別レーダー
  const industryRadar = useMemo(() => {
    const groups = new Map<string, { sent: number; reacted: number }>()
    for (const l of filteredLetters.filter(l => l.sent_at)) {
      const ind = l.company_id ? industryMap.get(l.company_id) : null
      if (!ind) continue
      const g = groups.get(ind) ?? { sent: 0, reacted: 0 }
      g.sent++
      const r = filteredReactionMap.get(l.id)
      if (r && ['返信あり', '商談化'].includes(r.reaction_type)) g.reacted++
      groups.set(ind, g)
    }
    return Array.from(groups.entries()).sort((a, b) => b[1].sent - a[1].sent).slice(0, 6)
      .map(([industry, data]) => ({ industry, 反応率: data.sent > 0 ? parseFloat(((data.reacted / data.sent) * 100).toFixed(1)) : 0 }))
  }, [filteredLetters, filteredReactionMap, industryMap])

  // インサイト
  const insights = useMemo(() => {
    const result: string[] = []
    const sentLetters = filteredLetters.filter(l => l.sent_at)
    if (sentLetters.length === 0) return result

    if (whyYouRanking.length > 0 && whyYouRanking[0].rate > 0)
      result.push(`「${whyYouRanking[0].label}」の切り口が最も反応率が高く${whyYouRanking[0].rate}%（${whyYouRanking[0].reacted}/${whyYouRanking[0].sent}件）です。`)
    if (whyYouRanking.length >= 2) {
      const worst = whyYouRanking[whyYouRanking.length - 1]
      if (worst.rate === 0 && worst.sent >= 3)
        result.push(`「${worst.label}」は${worst.sent}件送付で反応ゼロです。切り口の見直しを検討してください。`)
    }
    if (industryRanking.length > 0 && industryRanking[0].rate > 0)
      result.push(`業種別では「${industryRanking[0].label}」が反応率${industryRanking[0].rate}%と最も効果的です。`)

    // パイプライン速度に基づくインサイト
    if (pipelineVelocity.length > 0) {
      const fastest = pipelineVelocity[0]
      result.push(`最速反応は「${fastest.type}」で平均${fastest.avg}日（${fastest.count}件）。`)
    }

    // 浸透率に基づくインサイト
    const lowPenetration = penetrationData.filter(d => d.rate < 30 && d.total >= 5)
    if (lowPenetration.length > 0)
      result.push(`${lowPenetration[0].industry}はアカウント浸透率${lowPenetration[0].rate}%。拡大余地があります。`)

    const daysToReactList = filteredReactions.filter(r => r.days_to_react !== null && r.days_to_react >= 0).map(r => r.days_to_react!)
    if (daysToReactList.length >= 3) {
      const avg = daysToReactList.reduce((a, b) => a + b, 0) / daysToReactList.length
      if (avg <= 7) result.push(`平均${avg.toFixed(1)}日で反応を獲得。反応速度は良好です。`)
      else if (avg <= 14) result.push(`反応までの平均日数は${avg.toFixed(1)}日。`)
      else result.push(`反応まで平均${avg.toFixed(1)}日。送付タイミングの最適化で短縮できる可能性があります。`)
    }

    const deals = filteredReactions.filter(r => r.reaction_type === '商談化')
    const replies = filteredReactions.filter(r => r.reaction_type === '返信あり')
    if (deals.length > 0 && replies.length > 0)
      result.push(`返信のうち${((deals.length / (deals.length + replies.length)) * 100).toFixed(0)}%が商談化に至っています。`)

    if (sentLetters.length > 0 && filteredReactions.length === 0)
      result.push('送付済みの手紙にまだ反応がありません。フォローコールを検討してください。')

    return result
  }, [filteredLetters, filteredReactions, whyYouRanking, industryRanking, pipelineVelocity, penetrationData])

  // ターゲット仮説
  const targetHypotheses = useMemo(() => {
    const hypotheses: { title: string; description: string; confidence: 'high' | 'medium' | 'low' }[] = []
    const sentLetters = filteredLetters.filter(l => l.sent_at)
    if (sentLetters.length < 3) return hypotheses

    const crossMap = new Map<string, { sent: number; reacted: number }>()
    for (const l of sentLetters) {
      const ind = l.company_id ? industryMap.get(l.company_id) : null
      if (!ind) continue
      const key = `${ind}|${l.why_you_angle}`
      const g = crossMap.get(key) ?? { sent: 0, reacted: 0 }
      g.sent++
      const r = filteredReactionMap.get(l.id)
      if (r && ['返信あり', '商談化'].includes(r.reaction_type)) g.reacted++
      crossMap.set(key, g)
    }

    const combos = Array.from(crossMap.entries())
      .filter(([, v]) => v.sent >= 2 && v.reacted > 0)
      .map(([key, v]) => { const [industry, angle] = key.split('|'); return { industry, angle, ...v, rate: (v.reacted / v.sent) * 100 } })
      .sort((a, b) => b.rate - a.rate)

    if (combos.length > 0) {
      const b = combos[0]
      hypotheses.push({ title: `${b.industry} × 「${b.angle}」が有望`, description: `反応率${b.rate.toFixed(0)}%（${b.reacted}/${b.sent}件）。同業種の未送付企業への横展開が効果的です。`, confidence: b.sent >= 5 ? 'high' : b.sent >= 3 ? 'medium' : 'low' })
    }

    // 浸透率ベースの仮説
    for (const d of penetrationData.filter(d => d.rate >= 20 && d.rate < 50 && d.total >= 5).slice(0, 2)) {
      hypotheses.push({ title: `${d.industry}の送付拡大（浸透率${d.rate}%）`, description: `${d.total}社中${d.reached}社にリーチ済み。残り${d.total - d.reached}社へのアプローチで追加反応が見込めます。`, confidence: d.rate >= 30 ? 'high' : 'medium' })
    }

    if (whyYouRanking.length > 0 && whyYouRanking[0].rate > 0) {
      const best = whyYouRanking[0]
      const angledInds = new Set<string>()
      for (const l of sentLetters) { if (l.why_you_angle === best.label && l.company_id) { const i = industryMap.get(l.company_id); if (i) angledInds.add(i) } }
      const industryCompanyCount = new Map<string, number>()
      for (const c of companies) { if (c.industry) industryCompanyCount.set(c.industry, (industryCompanyCount.get(c.industry) ?? 0) + 1) }
      const untried = Array.from(industryCompanyCount.entries()).filter(([i]) => !angledInds.has(i) && (industryCompanyCount.get(i) ?? 0) >= 3).sort((a, b) => b[1] - a[1])
      if (untried.length > 0) hypotheses.push({ title: `「${best.label}」を${untried[0][0]}に展開`, description: `最高反応率の切り口をまだ試していない${untried[0][0]}（${untried[0][1]}社）に横展開すると効果が期待できます。`, confidence: 'medium' })
    }

    return hypotheses.slice(0, 4)
  }, [filteredLetters, filteredReactionMap, industryMap, companies, whyYouRanking, penetrationData])

  const selectedProject = projects.find(p => p.id === selectedProjectId)
  const compareLabel = compareMode === 'prev_period'
    ? (periodMode === 'weekly' ? '先週比' : periodMode === 'monthly' ? '先月比' : '前期比')
    : '昨年比'

  if (loading) return (
    <div>
      <h1 className="text-2xl font-bold text-neutral-900">ダッシュボード</h1>
      <p className="mt-8 text-sm text-neutral-500">読み込み中...</p>
    </div>
  )

  return (
    <div>
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-neutral-900">ダッシュボード</h1>
        <div className="flex items-center gap-2">
          <select value={selectedAngle} onChange={e => setSelectedAngle(e.target.value)}
            className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900">
            <option value="all">全訴求軸</option>
            {angleOptions.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <select value={selectedProjectId} onChange={e => setSelectedProjectId(e.target.value)}
            className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900">
            <option value="all">全プロジェクト</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}{p.client_name ? ` (${p.client_name})` : ''}</option>)}
          </select>
        </div>
      </div>

      {selectedProject && (
        <div className="mt-3 flex items-center gap-3">
          <span className="text-sm text-neutral-500">切り口: {selectedProject.why_you_angle ?? '-'}</span>
          <Link href={`/projects/${selectedProject.id}`} className="text-xs text-neutral-500 hover:text-neutral-900 hover:underline">プロジェクト詳細 →</Link>
        </div>
      )}

      {/* 期間切替 + カレンダー + 比較モード */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-neutral-200 bg-white p-0.5">
          {(['weekly', 'monthly', 'custom'] as const).map(mode => (
            <button key={mode} onClick={() => { setPeriodMode(mode); if (mode === 'custom') setCalendarOpen(true) }}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${periodMode === mode ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:text-neutral-900'}`}>
              {mode === 'weekly' ? '週次' : mode === 'monthly' ? '月次' : 'カスタム'}
            </button>
          ))}
        </div>

        {/* 日付レンジ表示 + カレンダー */}
        <div className="relative" ref={calendarRef}>
          <button onClick={() => setCalendarOpen(!calendarOpen)}
            className="flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs text-neutral-700 hover:border-neutral-400">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            {format(dateRange.from, 'yyyy/MM/dd')} 〜 {format(dateRange.to, 'yyyy/MM/dd')}
          </button>
          {calendarOpen && (
            <div className="absolute left-0 top-full z-50 mt-1 rounded-lg border border-neutral-200 bg-white p-3 shadow-lg">
              <DayPicker
                mode="range"
                selected={{ from: dateRange.from, to: dateRange.to }}
                onSelect={(range) => {
                  if (range?.from && range?.to) {
                    setDateRange({ from: range.from, to: range.to })
                    setPeriodMode('custom')
                    setCalendarOpen(false)
                  } else if (range?.from) {
                    setDateRange(prev => ({ ...prev, from: range.from! }))
                  }
                }}
                locale={ja}
                numberOfMonths={2}
              />
            </div>
          )}
        </div>

        <div className="flex rounded-lg border border-neutral-200 bg-white p-0.5">
          {(['prev_period', 'prev_year'] as const).map(mode => (
            <button key={mode} onClick={() => setCompareMode(mode)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${compareMode === mode ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:text-neutral-900'}`}>
              {mode === 'prev_period' ? (periodMode === 'weekly' ? '先週比' : periodMode === 'monthly' ? '先月比' : '前期比') : '昨年比'}
            </button>
          ))}
        </div>
      </div>

      {/* 当期KPI + 前期比較 */}
      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPICard label="送付数" value={periodStats.current.sent} suffix="通" delta={periodStats.delta.sent} compareLabel={compareLabel} prev={periodStats.prev.sent} prevSuffix="通" />
        <KPICard label="反応数" value={periodStats.current.reactions} suffix="件" delta={periodStats.delta.reactions} compareLabel={compareLabel} prev={periodStats.prev.reactions} prevSuffix="件" />
        <KPICard label="反応率" value={periodStats.current.reactionRate} suffix="%" delta={periodStats.delta.reactionRate} compareLabel={compareLabel} prev={periodStats.prev.reactionRate} prevSuffix="%" isPercent />
        <KPICard label="商談化" value={periodStats.current.deals} suffix="件" delta={periodStats.delta.deals} compareLabel={compareLabel} prev={periodStats.prev.deals} prevSuffix="件" />
      </div>

      {/* 累計パフォーマンス */}
      <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <MiniKPI label="生成数" value={`${cumulativeStats.totalGenerated}`} />
        <MiniKPI label="送付累計" value={`${cumulativeStats.totalSent}通`} />
        <MiniKPI label="反応率" value={`${cumulativeStats.reactionRate}%`} />
        <MiniKPI label="商談化率" value={`${cumulativeStats.dealRate}%`} />
        <MiniKPI label="平均反応日数" value={cumulativeStats.avgDaysToReact === '-' ? '-' : `${cumulativeStats.avgDaysToReact}日`} />
      </div>

      {/* ABMファネル + パイプライン速度 */}
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* ABMファネル */}
        {funnelData.length > 0 && (
          <div className="rounded-lg border border-neutral-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-neutral-900">ABMファネル</h3>
            <p className="mt-0.5 text-[10px] text-neutral-400">各段階の転換率を可視化</p>
            <div className="mt-4 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <FunnelChart>
                  <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e5e5e5', fontSize: 13 }} animationDuration={200} />
                  <Funnel dataKey="value" data={funnelData} isAnimationActive animationDuration={1000} animationEasing="ease-out">
                    <LabelList position="center" fill="#fff" stroke="none" fontSize={12} formatter={(v) => `${v}件`} />
                    <LabelList position="right" fill="#737373" stroke="none" fontSize={11} dataKey="name" />
                  </Funnel>
                </FunnelChart>
              </ResponsiveContainer>
            </div>
            {funnelConversions.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {funnelConversions.map(c => (
                  <span key={c.to} className="rounded-full bg-neutral-50 px-2.5 py-1 text-[10px] text-neutral-600">
                    {c.from}→{c.to}: <span className="font-bold" style={{ color: C.primary }}>{c.rate}%</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* パイプライン速度 */}
        {pipelineVelocity.length > 0 && (
          <div className="rounded-lg border border-neutral-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-neutral-900">パイプライン速度</h3>
            <p className="mt-0.5 text-[10px] text-neutral-400">反応タイプ別の平均リードタイム</p>
            <div className="mt-4 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={pipelineVelocity} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 12 }} stroke={C.muted} unit="日" />
                  <YAxis dataKey="type" type="category" tick={{ fontSize: 11 }} stroke={C.muted} width={80} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e5e5e5', fontSize: 13 }} formatter={(value) => [`${value}日`, '平均']} animationDuration={200} />
                  <Bar dataKey="avg" fill={C.primary} radius={[0, 6, 6, 0]} animationDuration={1000} animationEasing="ease-out" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* アカウント浸透率 */}
      {penetrationData.length > 0 && (
        <div className="mt-6 rounded-lg border border-neutral-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-neutral-900">アカウント浸透率（業種別）</h3>
          <p className="mt-0.5 text-[10px] text-neutral-400">ターゲット企業のうち何%にリーチしているか</p>
          <div className="mt-4 space-y-3">
            {penetrationData.map(d => (
              <div key={d.industry} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-xs text-neutral-700 truncate">{d.industry}</span>
                <div className="flex-1">
                  <div className="relative h-5 w-full overflow-hidden rounded-full bg-neutral-100">
                    <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-1000 ease-out" style={{ width: `${d.rate}%`, backgroundColor: d.rate >= 50 ? C.accent : C.primary }} />
                    <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-neutral-700">{d.rate}%（{d.reached}/{d.total}社）</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* コホート分析 */}
      {cohortData.length > 0 && (
        <div className="mt-6 rounded-lg border border-neutral-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-neutral-900">コホート分析</h3>
          <p className="mt-0.5 text-[10px] text-neutral-400">送付月ごとの累積反応率推移（M0=送付月, M1=翌月...）</p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-neutral-200">
                  <th className="py-2 pr-3 text-left font-medium text-neutral-500">コホート</th>
                  <th className="px-2 py-2 text-right font-medium text-neutral-500">送付数</th>
                  {['M0', 'M1', 'M2', 'M3', 'M4', 'M5'].map(m => (
                    <th key={m} className="px-2 py-2 text-right font-medium text-neutral-500">{m}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cohortData.map(row => (
                  <tr key={row.cohort} className="border-b border-neutral-100">
                    <td className="py-2 pr-3 font-medium text-neutral-700">{row.cohort}</td>
                    <td className="px-2 py-2 text-right text-neutral-600">{row.sent}</td>
                    {['M0', 'M1', 'M2', 'M3', 'M4', 'M5'].map(m => {
                      const val = (row as Record<string, number | string>)[m] as number | undefined
                      return (
                        <td key={m} className="px-2 py-2 text-right">
                          {val !== undefined ? (
                            <span className="inline-block rounded px-1.5 py-0.5 text-[10px] font-bold" style={{
                              backgroundColor: val > 20 ? '#d1fae5' : val > 10 ? '#dbeafe' : val > 0 ? '#f5f5f5' : 'transparent',
                              color: val > 20 ? '#065f46' : val > 10 ? '#1e40af' : val > 0 ? '#525252' : '#d4d4d4',
                            }}>{val}%</span>
                          ) : <span className="text-neutral-300">-</span>}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* チャートエリア */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 推移チャート */}
        {trendData.length > 1 && (
          <div className="rounded-lg border border-neutral-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-neutral-900">{periodMode === 'weekly' ? '週次' : '月次'}推移</h3>
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke={C.muted} />
                  <YAxis tick={{ fontSize: 12 }} stroke={C.muted} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e5e5e5', fontSize: 13 }} animationDuration={200} />
                  <Line type="monotone" dataKey="sent" name="送付" stroke={C.primary} strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} animationDuration={1200} />
                  <Line type="monotone" dataKey="reactions" name="反応" stroke={C.accent} strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} animationDuration={1200} animationBegin={300} />
                  <Line type="monotone" dataKey="deals" name="商談化" stroke={C.muted} strokeWidth={2} strokeDasharray="4 2" dot={{ r: 3 }} activeDot={{ r: 5 }} animationDuration={1200} animationBegin={600} />
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
                    <Pie data={reactionBreakdown} cx="50%" cy="50%" innerRadius={55} outerRadius={85} dataKey="value" animationDuration={1000} animationEasing="ease-out" stroke="none">
                      {reactionBreakdown.map(entry => <Cell key={entry.name} fill={DONUT_COLORS[entry.name] ?? C.muted} />)}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e5e5e5', fontSize: 13 }} animationDuration={200} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2">
                {reactionBreakdown.map(entry => (
                  <div key={entry.name} className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: DONUT_COLORS[entry.name] ?? C.muted }} />
                    <span className="text-sm text-neutral-700">{entry.name}</span>
                    <span className="text-sm font-bold text-neutral-900">{entry.value}件</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 切り口別反応率 */}
        {whyYouRanking.length > 0 && (
          <div className="rounded-lg border border-neutral-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-neutral-900">切り口別 反応率</h3>
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={whyYouRanking} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 12 }} stroke={C.muted} unit="%" />
                  <YAxis dataKey="label" type="category" tick={{ fontSize: 11 }} stroke={C.muted} width={120} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e5e5e5', fontSize: 13 }} formatter={(value) => [`${value}%`, '反応率']} animationDuration={200} />
                  <Bar dataKey="rate" fill={C.primary} radius={[0, 6, 6, 0]} animationDuration={1000} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* 業種別レーダー */}
        {industryRadar.length >= 3 && (
          <div className="rounded-lg border border-neutral-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-neutral-900">業種別 反応率マップ</h3>
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={industryRadar}>
                  <PolarGrid stroke="#e5e5e5" />
                  <PolarAngleAxis dataKey="industry" tick={{ fontSize: 11 }} />
                  <PolarRadiusAxis tick={{ fontSize: 10 }} />
                  <Radar name="反応率" dataKey="反応率" stroke={C.primary} fill={C.primary} fillOpacity={0.2} animationDuration={1200} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e5e5e5', fontSize: 13 }} animationDuration={200} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* 業種別バーチャート（レーダー不足時） */}
        {industryRadar.length > 0 && industryRadar.length < 3 && industryRanking.length > 0 && (
          <div className="rounded-lg border border-neutral-200 bg-white p-5">
            <h3 className="text-sm font-semibold text-neutral-900">業種別 反応率</h3>
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={industryRanking} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 12 }} stroke={C.muted} unit="%" />
                  <YAxis dataKey="label" type="category" tick={{ fontSize: 11 }} stroke={C.muted} width={100} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e5e5e5', fontSize: 13 }} formatter={(value) => [`${value}%`, '反応率']} animationDuration={200} />
                  <Bar dataKey="rate" fill={C.accent} radius={[0, 6, 6, 0]} animationDuration={1000} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* インサイト */}
      {insights.length > 0 && (
        <div className="mt-6 rounded-lg border border-neutral-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-neutral-900">状況サマリー</h3>
          <ul className="mt-3 space-y-2">
            {insights.map((text, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-neutral-700">
                <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: C.muted }} />{text}
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
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${h.confidence === 'high' ? 'bg-emerald-50 text-emerald-700' : h.confidence === 'medium' ? 'bg-blue-50 text-blue-700' : 'bg-neutral-100 text-neutral-500'}`}>
                    {h.confidence === 'high' ? '確度高' : h.confidence === 'medium' ? '確度中' : '確度低'}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-neutral-600">{h.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* データ資産 */}
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

function KPICard({ label, value, suffix, delta: d, compareLabel, prev, prevSuffix, isPercent }: {
  label: string; value: number; suffix: string
  delta: { value: string; positive: boolean | null }
  compareLabel: string; prev: number; prevSuffix: string; isPercent?: boolean
}) {
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    if (value === 0) { setDisplay(0); return }
    let step = 0; const steps = 30
    const timer = setInterval(() => {
      step++; const eased = 1 - Math.pow(1 - step / steps, 3)
      setDisplay(parseFloat((value * eased).toFixed(1)))
      if (step >= steps) { setDisplay(value); clearInterval(timer) }
    }, 800 / steps)
    return () => clearInterval(timer)
  }, [value])

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-5 transition-shadow hover:shadow-md">
      <p className="text-sm font-medium text-neutral-500">{label}</p>
      <p className="mt-2 text-3xl font-bold" style={{ color: C.primary }}>
        {isPercent ? display.toFixed(1) : Math.round(display)}{suffix}
      </p>
      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {d.positive !== null && (
            <span className={`text-xs font-bold ${d.positive ? 'text-emerald-600' : 'text-red-500'}`}>
              {d.positive ? '\u25B2' : '\u25BC'} {d.value}
            </span>
          )}
          {d.positive === null && <span className="text-xs text-neutral-400">{d.value}</span>}
          <span className="text-[10px] text-neutral-400">{compareLabel}</span>
        </div>
        <span className="text-[10px] text-neutral-400">前期: {isPercent ? prev.toFixed(1) : prev}{prevSuffix}</span>
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
    <a href={`/api/export?type=${type}`} target="_blank" rel="noopener noreferrer"
      className="flex flex-col items-start rounded-lg border border-neutral-200 bg-white px-4 py-3 text-left transition-shadow hover:bg-neutral-50 hover:shadow-md">
      <span className="text-sm font-medium text-neutral-900">{label}</span>
      <span className="mt-0.5 text-xs text-neutral-500">{description}</span>
    </a>
  )
}
