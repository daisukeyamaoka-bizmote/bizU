'use client'

import { useEffect, useState, useCallback, useMemo, Fragment } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

type Source = {
  index: number
  fact: string
  source_name: string
  source_url: string
  fetched_at: string
  is_verified: boolean
  freshness: string
}

type Personalization = {
  recipient: string
  why_you: string
  hypothesis: string
  case_study: string
  case_study_reason: string
}

type ProjectInfo = {
  letter_layout: string | null
  sender_company: string | null
  sender_name: string | null
  sender_title: string | null
  sender_phone: string | null
  sender_email: string | null
  sender_address: string | null
}

type Letter = {
  id: string
  body_text: string
  hypothesis: string | null
  sources: Source[] | null
  personalization: Personalization | null
  is_approved: boolean
  approved_by: string | null
  approved_at: string | null
  why_you_angle: string
  send_trigger: string | null
  collected_context: string | null
  project_id: string | null
  contacts: {
    full_name: string
    department: string | null
    title: string | null
    target_companies: { name: string } | { name: string }[]
  } | null
  clients: {
    name: string
    product_name: string | null
  } | null
}

const DEFAULT_SENDER: ProjectInfo = {
  letter_layout: 'recipient_first',
  sender_company: 'bizmote株式会社',
  sender_name: '山岡大輔',
  sender_title: '代表取締役',
  sender_phone: '090-8349-3739',
  sender_email: 'd.yamaoka@bizmote.co.jp',
  sender_address: '〒150-0043 東京都渋谷区道玄坂1-2-3',
}

// ソースのfactからキーフレーズを抽出
function extractKeyPhrases(fact: string): string[] {
  const phrases: string[] = []
  const numPatterns = fact.match(/[\d,]+[%％万億兆円年月日人社件倍]/g)
  if (numPatterns) phrases.push(...numPatterns)
  const quoted = fact.match(/[「『]([^」』]+)[」』]/g)
  if (quoted) phrases.push(...quoted.map(q => q.slice(1, -1)))
  const katakana = fact.match(/[ァ-ヶー]{4,}/g)
  if (katakana) phrases.push(...katakana)
  const english = fact.match(/[A-Za-z][A-Za-z0-9]{2,}/g)
  if (english) phrases.push(...english)
  const kanji = fact.match(/[\u4e00-\u9faf]{3,}/g)
  if (kanji) {
    const common = new Set(['それぞれ', 'について', 'における', 'ということ', 'これまで', 'ありません', 'ございます'])
    phrases.push(...kanji.filter(k => !common.has(k)))
  }
  return [...new Set(phrases)].slice(0, 5)
}

function findMatchPositions(bodyText: string, sources: Source[]): Map<number, { start: number; end: number; sourceIdx: number }[]> {
  const matches = new Map<number, { start: number; end: number; sourceIdx: number }[]>()
  for (const source of sources) {
    const phrases = extractKeyPhrases(source.fact)
    const sourceMatches: { start: number; end: number; sourceIdx: number }[] = []
    for (const phrase of phrases) {
      let searchFrom = 0
      while (searchFrom < bodyText.length) {
        const idx = bodyText.indexOf(phrase, searchFrom)
        if (idx === -1) break
        sourceMatches.push({ start: idx, end: idx + phrase.length, sourceIdx: source.index })
        searchFrom = idx + phrase.length
      }
    }
    if (sourceMatches.length > 0) matches.set(source.index, sourceMatches)
  }
  return matches
}

function computeTrustScore(source: Source): { score: number; label: string; color: string } {
  let score = 0
  if (source.source_url) score += 30
  if (source.freshness === 'fresh') score += 40
  else if (source.freshness === 'caution') score += 20
  else if (source.freshness === 'stale') score += 5
  const name = (source.source_name ?? '').toLowerCase()
  if (name.includes('.go.jp') || name.includes('.gov') || name.includes('統計') || name.includes('調査')) score += 20
  else if (name.includes('.co.jp') || name.includes('.com') || name.includes('日経') || name.includes('公式')) score += 15
  else if (source.source_name) score += 10
  if (source.is_verified) score += 10
  const label = score >= 70 ? '高' : score >= 40 ? '中' : '低'
  const color = score >= 70 ? '#10b981' : score >= 40 ? '#f59e0b' : '#ef4444'
  return { score, label, color }
}

function computeOverallTrust(sources: Source[]): { score: number; label: string; color: string; breakdown: string } {
  if (sources.length === 0) return { score: 0, label: '-', color: '#a3a3a3', breakdown: 'ソースなし' }
  const scores = sources.map(s => computeTrustScore(s).score)
  const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
  const freshCount = sources.filter(s => s.freshness === 'fresh').length
  const urlCount = sources.filter(s => s.source_url).length
  const verifiedCount = sources.filter(s => s.is_verified).length
  const label = avg >= 70 ? '高' : avg >= 40 ? '中' : '低'
  const color = avg >= 70 ? '#10b981' : avg >= 40 ? '#f59e0b' : '#ef4444'
  const breakdown = `URL有: ${urlCount}/${sources.length} | 鮮度良好: ${freshCount}/${sources.length} | 確認済: ${verifiedCount}/${sources.length}`
  return { score: avg, label, color, breakdown }
}

export default function ReviewPage() {
  const params = useParams()
  const router = useRouter()
  const letterId = params.id as string

  const [letter, setLetter] = useState<Letter | null>(null)
  const [sources, setSources] = useState<Source[]>([])
  const [projectInfo, setProjectInfo] = useState<ProjectInfo>(DEFAULT_SENDER)
  const [layoutOverride, setLayoutOverride] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [approving, setApproving] = useState(false)
  const [editingBody, setEditingBody] = useState(false)
  const [editedBody, setEditedBody] = useState('')
  const [hoveredSourceIdx, setHoveredSourceIdx] = useState<number | null>(null)
  const [selectedSourceIdx, setSelectedSourceIdx] = useState<number | null>(null)
  const [expandedSourceIdx, setExpandedSourceIdx] = useState<number | null>(null)

  const activeSourceIdx = selectedSourceIdx ?? hoveredSourceIdx
  const currentLayout = layoutOverride ?? projectInfo.letter_layout ?? 'recipient_first'

  const loadLetter = useCallback(async () => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('letters')
      .select(`
        id, body_text, hypothesis, sources, personalization,
        is_approved, approved_by, approved_at,
        why_you_angle, send_trigger, collected_context, project_id,
        contacts(full_name, department, title, target_companies(name)),
        clients(name, product_name)
      `)
      .eq('id', letterId)
      .single()

    if (error) {
      console.error('Failed to load letter:', error)
      setLoading(false)
      return
    }

    if (data) {
      const contact = Array.isArray(data.contacts) ? data.contacts[0] : data.contacts
      const client = Array.isArray(data.clients) ? data.clients[0] : data.clients
      setLetter({ ...data, contacts: contact, clients: client } as Letter)
      setSources(Array.isArray(data.sources) ? (data.sources as Source[]) : [])
      setEditedBody(data.body_text)

      // プロジェクト情報を取得（レイアウト設定 + 差出人情報）
      if (data.project_id) {
        const { data: proj } = await supabase
          .from('projects')
          .select('letter_layout, sender_company, sender_name, sender_title, sender_phone, sender_email, sender_address')
          .eq('id', data.project_id)
          .single()
        if (proj) {
          setProjectInfo({
            letter_layout: proj.letter_layout ?? DEFAULT_SENDER.letter_layout,
            sender_company: proj.sender_company ?? DEFAULT_SENDER.sender_company,
            sender_name: proj.sender_name ?? DEFAULT_SENDER.sender_name,
            sender_title: proj.sender_title ?? DEFAULT_SENDER.sender_title,
            sender_phone: proj.sender_phone ?? DEFAULT_SENDER.sender_phone,
            sender_email: proj.sender_email ?? DEFAULT_SENDER.sender_email,
            sender_address: proj.sender_address ?? DEFAULT_SENDER.sender_address,
          })
        }
      }
    }
    setLoading(false)
  }, [letterId])

  useEffect(() => { loadLetter() }, [loadLetter])

  const matchPositions = useMemo(() => {
    if (!letter) return new Map()
    return findMatchPositions(letter.body_text, sources)
  }, [letter, sources])

  const trustScores = useMemo(() => sources.map(s => ({ index: s.index, ...computeTrustScore(s) })), [sources])
  const overallTrust = useMemo(() => computeOverallTrust(sources), [sources])

  function toggleVerified(index: number) {
    setSources(prev => prev.map(s => s.index === index ? { ...s, is_verified: !s.is_verified } : s))
  }

  function markAllVerified() {
    setSources(prev => prev.map(s => ({ ...s, is_verified: true })))
  }

  async function saveEditedBody() {
    if (!letter) return
    const supabase = createClient()
    await supabase.from('letters').update({ body_text: editedBody }).eq('id', letter.id)
    setLetter({ ...letter, body_text: editedBody })
    setEditingBody(false)
  }

  async function handleApprove() {
    if (!letter) return
    setApproving(true)
    const supabase = createClient()

    await supabase.from('letters').update({
      sources, is_approved: true, approved_by: 'オペレーター', approved_at: new Date().toISOString(),
    }).eq('id', letter.id)

    const contact = letter.contacts
    const company = contact && 'target_companies' in contact
      ? (Array.isArray(contact.target_companies) ? contact.target_companies[0] : contact.target_companies)
      : null

    const res = await fetch('/api/generate-docx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contact: {
          company_name: (company as { name: string } | null)?.name ?? '',
          department: contact?.department ?? '',
          title: contact?.title ?? '',
          full_name: contact?.full_name ?? '',
        },
        clientName: letter.clients?.name ?? '',
        bodyText: letter.body_text,
        title: letter.hypothesis ?? '',
        layout: currentLayout,
        sender: projectInfo,
      }),
    })

    if (res.ok) {
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const disposition = res.headers.get('Content-Disposition')
      const filenameMatch = disposition?.match(/filename\*=UTF-8''(.+)/)
      a.download = filenameMatch ? decodeURIComponent(filenameMatch[1]) : 'letter.docx'
      a.href = url
      a.click()
      URL.revokeObjectURL(url)
    }

    setApproving(false)
    router.push(`/letters/${letterId}`)
  }

  function renderHighlightedBody(bodyText: string) {
    if (activeSourceIdx === null || !matchPositions.has(activeSourceIdx)) return <span>{bodyText}</span>

    const matches = matchPositions.get(activeSourceIdx)!
    const sorted = [...matches].sort((a, b) => a.start - b.start)
    const merged: { start: number; end: number }[] = []
    for (const m of sorted) {
      const last = merged[merged.length - 1]
      if (last && m.start <= last.end) last.end = Math.max(last.end, m.end)
      else merged.push({ start: m.start, end: m.end })
    }

    const parts: { text: string; highlighted: boolean }[] = []
    let cursor = 0
    for (const m of merged) {
      if (cursor < m.start) parts.push({ text: bodyText.slice(cursor, m.start), highlighted: false })
      parts.push({ text: bodyText.slice(m.start, m.end), highlighted: true })
      cursor = m.end
    }
    if (cursor < bodyText.length) parts.push({ text: bodyText.slice(cursor), highlighted: false })

    return (
      <>
        {parts.map((part, i) =>
          part.highlighted ? (
            <mark key={i} className="rounded-sm bg-blue-100 px-0.5 text-blue-900 transition-colors duration-200">{part.text}</mark>
          ) : (
            <Fragment key={i}>{part.text}</Fragment>
          )
        )}
      </>
    )
  }

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-neutral-900" />
      <span className="ml-3 text-sm text-neutral-600">読み込み中...</span>
    </div>
  )

  if (!letter) return <p className="py-20 text-center text-sm text-neutral-500">手紙が見つかりません</p>

  const contact = letter.contacts
  const company = contact && 'target_companies' in contact
    ? (Array.isArray(contact.target_companies) ? contact.target_companies[0] : contact.target_companies)
    : null
  const companyName = (company as { name: string } | null)?.name ?? ''
  const allVerified = sources.length > 0 ? sources.every(s => s.is_verified) : true
  const verifiedCount = sources.filter(s => s.is_verified).length
  const personalization = letter.personalization
  const matchedSourceCount = sources.filter(s => matchPositions.has(s.index)).length

  // 宛先ブロック
  const recipientBlock = (
    <div className="space-y-0.5 text-sm text-neutral-900 font-serif">
      <p>{companyName}</p>
      {contact?.department && <p>{contact.department}</p>}
      <p>{[contact?.title, contact?.full_name].filter(Boolean).join(' ')} 様</p>
    </div>
  )

  // 差出人ブロック
  const senderBlock = (
    <div className="space-y-0.5 text-right text-sm text-neutral-900 font-serif">
      <p>{projectInfo.sender_company}</p>
      <p>{projectInfo.sender_title} {projectInfo.sender_name}</p>
    </div>
  )

  const now = new Date()
  const dateStr = `${now.getFullYear()}年${now.getMonth() + 1}月吉日`

  return (
    <div>
      <div className="flex items-center gap-4">
        <Link href={`/letters/${letterId}`} className="text-sm text-neutral-500 hover:text-neutral-900 hover:underline">← 手紙詳細</Link>
        <h1 className="text-xl font-bold text-neutral-900">確認・承認</h1>
      </div>

      {letter.is_approved && (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-5 py-3">
          <p className="text-sm font-medium text-emerald-700">
            承認済み — {letter.approved_by} ({letter.approved_at ? new Date(letter.approved_at).toLocaleString('ja-JP') : ''})
          </p>
        </div>
      )}

      {/* 信頼度サマリーバー */}
      {sources.length > 0 && (
        <div className="mt-4 rounded-lg border border-neutral-200 bg-white px-5 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-neutral-500">根拠信頼度</span>
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold" style={{ backgroundColor: `${overallTrust.color}15`, color: overallTrust.color }}>
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                  {overallTrust.score}点 ({overallTrust.label})
                </span>
              </div>
              <span className="text-[10px] text-neutral-400">{overallTrust.breakdown}</span>
            </div>
            <div className="flex items-center gap-3 text-[10px] text-neutral-400">
              <span>本文マッチ: {matchedSourceCount}/{sources.length}件</span>
              <span>確認済み: {verifiedCount}/{sources.length}件</span>
            </div>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
            <div className="h-full rounded-full transition-all duration-700 ease-out" style={{ width: `${overallTrust.score}%`, backgroundColor: overallTrust.color }} />
          </div>
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Left: personalization + sources */}
        <div className="lg:col-span-2 space-y-6">

          {/* 個別化ポイント（トリガー削除済み） */}
          <div className="rounded-lg border border-neutral-200 bg-white">
            <div className="border-b border-neutral-100 px-5 py-3">
              <h2 className="text-sm font-semibold text-neutral-900">個別化ポイント</h2>
              <p className="mt-0.5 text-xs text-neutral-400">{companyName} 向け</p>
            </div>
            <div className="divide-y divide-neutral-100">
              {personalization ? (
                <>
                  <PointRow label="宛先" value={personalization.recipient} />
                  <PointRow label="タイトル" value={letter.hypothesis ?? ''} />
                  <PointRow label="Why You" value={personalization.why_you} />
                  <PointRow label="課題仮説" value={personalization.hypothesis} />
                  <PointRow label="事例" value={personalization.case_study} />
                  <PointRow label="事例選定理由" value={personalization.case_study_reason} />
                </>
              ) : (
                <>
                  <PointRow label="切り口" value={letter.why_you_angle} />
                  <PointRow label="タイトル" value={letter.hypothesis ?? '未設定'} />
                </>
              )}
            </div>
          </div>

          {/* ソース根拠一覧 */}
          <div className="rounded-lg border border-neutral-200 bg-white">
            <div className="border-b border-neutral-100 px-5 py-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-neutral-900">ソース根拠一覧</h2>
                {sources.length > 0 && (
                  <span className="text-xs text-neutral-400">{verifiedCount}/{sources.length} 確認済み</span>
                )}
              </div>
              <p className="mt-0.5 text-[10px] text-neutral-400">
                ソースをクリックすると引用元と本文ハイライトが表示されます
              </p>
            </div>

            {sources.length === 0 ? (
              <div className="px-5 py-4">
                <p className="text-sm text-neutral-500">ソース情報がありません</p>
              </div>
            ) : (
              <>
                <div className="divide-y divide-neutral-100">
                  {sources.map((source) => {
                    const trust = trustScores.find(t => t.index === source.index)
                    const hasMatch = matchPositions.has(source.index)
                    const isActive = activeSourceIdx === source.index
                    const isExpanded = expandedSourceIdx === source.index

                    return (
                      <div key={source.index}
                        className={`transition-colors duration-150 ${isActive ? 'bg-blue-50' : 'hover:bg-neutral-50'}`}
                        onMouseEnter={() => setHoveredSourceIdx(source.index)}
                        onMouseLeave={() => setHoveredSourceIdx(null)}
                      >
                        <div className="px-5 py-3 cursor-pointer"
                          onClick={() => {
                            setSelectedSourceIdx(prev => prev === source.index ? null : source.index)
                            setExpandedSourceIdx(prev => prev === source.index ? null : source.index)
                          }}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="mb-1 flex items-center gap-2">
                                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-neutral-100 text-[10px] font-bold text-neutral-600">
                                  {source.index + 1}
                                </span>
                                {hasMatch ? (
                                  <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[9px] font-medium text-blue-600">本文にマッチ</span>
                                ) : (
                                  <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-medium text-amber-600">マッチなし</span>
                                )}
                                <FreshnessBadge freshness={source.freshness} fetchedAt={source.fetched_at} />
                                <svg className={`h-3 w-3 text-neutral-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                              </div>

                              <p className="text-sm font-medium text-neutral-900">{source.fact}</p>

                              {/* ソースリンク */}
                              <div className="mt-1.5">
                                {source.source_url ? (
                                  <a href={source.source_url} target="_blank" rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-700 hover:bg-blue-100 hover:underline"
                                    onClick={e => e.stopPropagation()}>
                                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                    </svg>
                                    {source.source_name || source.source_url}
                                  </a>
                                ) : (
                                  <span className="inline-flex items-center gap-1 rounded bg-neutral-50 px-2 py-0.5 text-xs text-neutral-500">
                                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M10.172 13.828a4 4 0 015.656 0l4-4a4 4 0 00-5.656-5.656l-1.102 1.101" />
                                    </svg>
                                    {source.source_name || 'リンクなし'}
                                  </span>
                                )}
                              </div>

                              {/* 信頼度スコア */}
                              {trust && (
                                <div className="mt-2 flex items-center gap-2">
                                  <div className="flex-1"><div className="h-1 w-full overflow-hidden rounded-full bg-neutral-100"><div className="h-full rounded-full transition-all duration-500" style={{ width: `${trust.score}%`, backgroundColor: trust.color }} /></div></div>
                                  <span className="text-[10px] font-medium" style={{ color: trust.color }}>{trust.score}点</span>
                                </div>
                              )}
                            </div>

                            {!letter.is_approved && (
                              <button onClick={(e) => { e.stopPropagation(); toggleVerified(source.index) }}
                                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-all ${
                                  source.is_verified ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-neutral-300 bg-white hover:border-emerald-400'
                                }`}>
                                {source.is_verified && <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                              </button>
                            )}
                          </div>
                        </div>

                        {/* 展開: 引用元テキスト詳細 */}
                        {isExpanded && (
                          <div className="border-t border-neutral-100 bg-neutral-50 px-5 py-3">
                            <p className="text-[10px] font-medium text-neutral-500 mb-1">引用元テキスト（ソースから抽出）</p>
                            <div className="rounded border border-neutral-200 bg-white p-3">
                              <p className="text-xs leading-relaxed text-neutral-700 italic">「{source.fact}」</p>
                              <div className="mt-2 flex items-center justify-between text-[10px] text-neutral-400">
                                <span>出典: {source.source_name || '不明'}</span>
                                <span>取得日: {source.fetched_at || '不明'}</span>
                              </div>
                            </div>
                            {hasMatch && (
                              <div className="mt-2">
                                <p className="text-[10px] font-medium text-blue-600 mb-1">本文中の該当キーワード</p>
                                <div className="flex flex-wrap gap-1">
                                  {extractKeyPhrases(source.fact).filter(p => letter.body_text.includes(p)).map((phrase, i) => (
                                    <span key={i} className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-800">{phrase}</span>
                                  ))}
                                </div>
                              </div>
                            )}
                            {source.source_url && (
                              <a href={source.source_url} target="_blank" rel="noopener noreferrer"
                                className="mt-2 inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
                                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                                ソースを開いて確認する →
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* 一括確認ボタン */}
                {!allVerified && !letter.is_approved && (
                  <div className="border-t border-neutral-100 px-5 py-3">
                    <button onClick={markAllVerified}
                      className="w-full rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100 transition-colors">
                      全ソースを一括確認済みにする
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Right: letter body with recipient/sender blocks */}
        <div className="lg:col-span-3">
          <div className="rounded-lg border border-neutral-200 bg-white">
            <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3">
              <div>
                <h2 className="text-sm font-semibold text-neutral-900">手紙本文</h2>
                {activeSourceIdx !== null && matchPositions.has(activeSourceIdx) && (
                  <p className="mt-0.5 text-[10px] text-blue-500">ソース{activeSourceIdx + 1}の根拠箇所をハイライト中</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {/* レイアウト切替 */}
                <div className="flex items-center gap-1 rounded-lg border border-neutral-200 p-0.5">
                  <button onClick={() => setLayoutOverride('recipient_first')}
                    className={`rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${currentLayout === 'recipient_first' ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:text-neutral-900'}`}>
                    宛先↑差出↓
                  </button>
                  <button onClick={() => setLayoutOverride('sender_first')}
                    className={`rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${currentLayout === 'sender_first' ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:text-neutral-900'}`}>
                    差出↑宛先↓
                  </button>
                </div>
                {!letter.is_approved && !editingBody && (
                  <button onClick={() => setEditingBody(true)} className="text-xs text-neutral-500 hover:text-neutral-700 hover:underline">編集</button>
                )}
              </div>
            </div>

            {editingBody ? (
              <div className="p-5">
                <textarea value={editedBody} onChange={(e) => setEditedBody(e.target.value)} rows={24}
                  className="w-full rounded-lg border border-neutral-300 p-4 font-serif text-sm leading-relaxed text-neutral-900" />
                <div className="mt-3 flex gap-2">
                  <button onClick={saveEditedBody} className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800">保存</button>
                  <button onClick={() => { setEditingBody(false); setEditedBody(letter.body_text) }} className="text-sm text-neutral-500 hover:underline">キャンセル</button>
                </div>
              </div>
            ) : (
              <div className="p-5 font-serif text-sm leading-relaxed text-neutral-900">
                {/* 日付 */}
                <p className="text-right">{dateStr}</p>

                {/* 上部ブロック */}
                <div className="mt-3">
                  {currentLayout === 'recipient_first' ? recipientBlock : senderBlock}
                </div>

                {/* 空行 */}
                <div className="mt-3">
                  {currentLayout === 'recipient_first' ? senderBlock : recipientBlock}
                </div>

                {/* タイトル */}
                {letter.hypothesis && (
                  <p className="mt-6 text-center font-bold underline underline-offset-4">{letter.hypothesis}</p>
                )}

                {/* 本文 */}
                <div className="mt-4 whitespace-pre-wrap">
                  {renderHighlightedBody(letter.body_text)}
                </div>

                {/* お問い合わせ先 */}
                <div className="mt-6 border-t border-neutral-100 pt-3 text-xs text-neutral-600">
                  <p className="font-bold">【お問い合わせ先】</p>
                  <p>{projectInfo.sender_company}　{projectInfo.sender_title} {projectInfo.sender_name}</p>
                  <p>TEL: {projectInfo.sender_phone} / Email: {projectInfo.sender_email}</p>
                  <p>{projectInfo.sender_address}</p>
                </div>

                {/* ソースマッチサマリー */}
                {sources.length > 0 && (
                  <div className="mt-4 border-t border-neutral-100 pt-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-neutral-400">{letter.body_text.length}文字</p>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1">
                          {sources.map(s => {
                            const hasMatch = matchPositions.has(s.index)
                            return (
                              <button key={s.index}
                                onMouseEnter={() => setHoveredSourceIdx(s.index)}
                                onMouseLeave={() => setHoveredSourceIdx(null)}
                                onClick={() => setSelectedSourceIdx(prev => prev === s.index ? null : s.index)}
                                className={`flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold transition-all ${
                                  activeSourceIdx === s.index ? 'bg-blue-500 text-white ring-2 ring-blue-200'
                                    : hasMatch ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                                    : 'bg-neutral-100 text-neutral-400 hover:bg-neutral-200'
                                }`}>
                                {s.index + 1}
                              </button>
                            )
                          })}
                        </div>
                        {selectedSourceIdx !== null && (
                          <button onClick={() => setSelectedSourceIdx(null)} className="text-[10px] text-neutral-400 hover:text-neutral-600 hover:underline">選択解除</button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Approval bar */}
      {!letter.is_approved && (
        <div className="mt-8 rounded-lg border border-neutral-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <div className="text-sm text-neutral-600">
              {sources.length > 0 ? (
                allVerified ? '全ソースのアクセス確認済み。承認して送付準備に進めます。'
                  : `未確認ソースが${sources.length - verifiedCount}件あります。全てのソースリンクにアクセスして内容を確認してください。`
              ) : 'ソース情報がないため、内容を確認して承認してください。'}
            </div>
            <button onClick={handleApprove} disabled={approving || (sources.length > 0 && !allVerified)}
              className="rounded-lg bg-neutral-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40">
              {approving ? '処理中...' : '承認してdocxをダウンロード'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function PointRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 px-5 py-3">
      <span className="w-20 shrink-0 text-xs font-medium text-neutral-500">{label}</span>
      <span className="text-sm text-neutral-900">{value}</span>
    </div>
  )
}

function FreshnessBadge({ freshness, fetchedAt }: { freshness: string; fetchedAt: string }) {
  const config = {
    fresh: { label: '最新', bg: 'bg-emerald-50', text: 'text-emerald-700' },
    caution: { label: '注意', bg: 'bg-amber-50', text: 'text-amber-700' },
    stale: { label: '古い', bg: 'bg-red-50', text: 'text-red-600' },
  }[freshness] ?? { label: freshness, bg: 'bg-neutral-50', text: 'text-neutral-500' }
  return (
    <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${config.bg} ${config.text}`} title={`取得日: ${fetchedAt}`}>
      {config.label}
    </span>
  )
}
