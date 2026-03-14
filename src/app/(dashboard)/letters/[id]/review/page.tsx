'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
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

type FactCheckResult = {
  index: number
  verdict: 'ok' | 'caution' | 'ng'
  reason: string
  suggestion?: string
}

const VERDICT_CONFIG = {
  ok: { label: 'OK', color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', icon: '\u2705' },
  caution: { label: '要確認', color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200', icon: '\u26A0\uFE0F' },
  ng: { label: '要修正', color: 'text-red-700', bg: 'bg-red-50 border-red-200', icon: '\u274C' },
} as const

type Letter = {
  id: string
  body_text: string
  sources: Source[] | null
  is_approved: boolean
  approved_by: string | null
  approved_at: string | null
  why_you_angle: string
  send_trigger: string | null
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

const FRESHNESS_CONFIG = {
  fresh: { label: '1ヶ月以内', color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200', icon: '\u2705' },
  caution: { label: '1〜6ヶ月', color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200', icon: '\u26A0\uFE0F' },
  stale: { label: '6ヶ月超', color: 'text-red-600', bg: 'bg-red-50 border-red-200', icon: '\uD83D\uDD34' },
} as const

const CIRCLE_NUMBERS = ['\u2460', '\u2461', '\u2462', '\u2463', '\u2464', '\u2465', '\u2466', '\u2467', '\u2468', '\u2469']

export default function ReviewPage() {
  const params = useParams()
  const router = useRouter()
  const letterId = params.id as string

  const [letter, setLetter] = useState<Letter | null>(null)
  const [sources, setSources] = useState<Source[]>([])
  const [loading, setLoading] = useState(true)
  const [approving, setApproving] = useState(false)
  const [editingBody, setEditingBody] = useState(false)
  const [editedBody, setEditedBody] = useState('')
  const [editingSourceIndex, setEditingSourceIndex] = useState<number | null>(null)
  const [editedFact, setEditedFact] = useState('')
  const [factCheckResults, setFactCheckResults] = useState<FactCheckResult[]>([])
  const [factChecking, setFactChecking] = useState(false)
  const [factCheckDone, setFactCheckDone] = useState(false)

  const sourceRefs = useRef<Record<number, HTMLDivElement | null>>({})
  const bodyRef = useRef<HTMLDivElement | null>(null)

  const loadLetter = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('letters')
      .select(`
        id, body_text, sources, is_approved, approved_by, approved_at,
        why_you_angle, send_trigger,
        contacts(full_name, department, title, target_companies(name)),
        clients(name, product_name)
      `)
      .eq('id', letterId)
      .single()

    if (data) {
      const contact = Array.isArray(data.contacts) ? data.contacts[0] : data.contacts
      const client = Array.isArray(data.clients) ? data.clients[0] : data.clients
      setLetter({ ...data, contacts: contact, clients: client } as Letter)
      const loadedSources = Array.isArray(data.sources) ? (data.sources as Source[]) : []
      setSources(loadedSources)
      setEditedBody(data.body_text)
    }
    setLoading(false)
  }, [letterId])

  const runFactCheck = useCallback(async (letterData: Letter, sourcesData: Source[]) => {
    if (sourcesData.length === 0 || letterData.is_approved) return
    setFactChecking(true)
    try {
      const contact = letterData.contacts
      const company = contact && 'target_companies' in contact
        ? (Array.isArray(contact.target_companies) ? contact.target_companies[0] : contact.target_companies)
        : null
      const res = await fetch('/api/fact-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          letterBody: letterData.body_text,
          sources: sourcesData.map(s => ({
            index: s.index,
            fact: s.fact,
            source_name: s.source_name,
            source_url: s.source_url,
            fetched_at: s.fetched_at,
          })),
          contactCompany: (company as { name: string } | null)?.name ?? '',
          contactName: contact?.full_name ?? '',
        }),
      })
      const data = await res.json()
      if (data.results) {
        setFactCheckResults(data.results)
      }
    } catch {
      // ファクトチェック失敗は非致命的
    }
    setFactChecking(false)
    setFactCheckDone(true)
  }, [])

  useEffect(() => {
    loadLetter()
  }, [loadLetter])

  // レター読み込み後に自動ファクトチェック
  useEffect(() => {
    if (letter && sources.length > 0 && !factCheckDone && !factChecking && !letter.is_approved) {
      runFactCheck(letter, sources)
    }
  }, [letter, sources, factCheckDone, factChecking, runFactCheck])

  function toggleVerified(index: number) {
    setSources(prev => prev.map(s =>
      s.index === index ? { ...s, is_verified: !s.is_verified } : s
    ))
  }

  function markAllVerified() {
    const hasStale = sources.some(s => s.freshness === 'stale' && !s.is_verified)
    if (hasStale && !confirm('6ヶ月超の情報ソースが含まれています。本当に全て確認済みにしますか？')) {
      return
    }
    setSources(prev => prev.map(s => ({ ...s, is_verified: true })))
  }

  function scrollToSource(index: number) {
    sourceRefs.current[index]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  function scrollToMarkerInBody(index: number) {
    bodyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    // Highlight the marker briefly
    const marker = CIRCLE_NUMBERS[index - 1] || `[${index}]`
    const bodyEl = bodyRef.current
    if (bodyEl) {
      const text = bodyEl.textContent || ''
      const pos = text.indexOf(marker)
      if (pos >= 0) {
        bodyEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }
  }

  function startEditFact(source: Source) {
    setEditingSourceIndex(source.index)
    setEditedFact(source.fact)
  }

  function saveEditedFact() {
    if (editingSourceIndex === null) return
    setSources(prev => prev.map(s =>
      s.index === editingSourceIndex ? { ...s, fact: editedFact } : s
    ))
    setEditingSourceIndex(null)
    setEditedFact('')
  }

  function openEditBody(sourceIndex?: number) {
    setEditingBody(true)
    setEditedBody(letter?.body_text ?? '')
    if (sourceIndex) {
      // Will scroll to the editing area
      setTimeout(() => {
        bodyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 100)
    }
  }

  async function saveEditedBody() {
    if (!letter) return
    const supabase = createClient()
    await supabase.from('letters').update({
      body_text: editedBody,
      sources: sources,
    }).eq('id', letter.id)
    setLetter({ ...letter, body_text: editedBody })
    setEditingBody(false)
  }

  async function handleApprove() {
    if (!letter) return
    setApproving(true)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    // Get user profile for display name
    let approverName = user?.email ?? '不明'
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('name')
        .eq('id', user.id)
        .single()
      if (profile?.name) approverName = profile.name
    }

    // Save sources and approval
    await supabase.from('letters').update({
      sources,
      is_approved: true,
      approved_by: approverName,
      approved_by_user_id: user?.id ?? null,
      approved_at: new Date().toISOString(),
    }).eq('id', letter.id)

    // Log to audit_logs
    await supabase.from('audit_logs').insert({
      user_id: user?.id ?? null,
      user_name: approverName,
      action: 'APPROVE_LETTER',
      target_type: 'letters',
      target_id: letter.id,
      detail: { sources_count: sources.length },
    })

    // Download docx
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
    router.refresh()
    loadLetter()
  }

  async function saveSources() {
    if (!letter) return
    const supabase = createClient()
    await supabase.from('letters').update({ sources }).eq('id', letter.id)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-neutral-900" />
        <span className="ml-3 text-sm text-neutral-600">読み込み中...</span>
      </div>
    )
  }

  if (!letter) {
    return <p className="py-20 text-center text-sm text-neutral-500">手紙が見つかりません</p>
  }

  const contact = letter.contacts
  const company = contact && 'target_companies' in contact
    ? (Array.isArray(contact.target_companies) ? contact.target_companies[0] : contact.target_companies)
    : null
  const allVerified = sources.length > 0 && sources.every(s => s.is_verified)
  const verifiedCount = sources.filter(s => s.is_verified).length

  const freshCount = sources.filter(s => s.freshness === 'fresh').length
  const cautionCount = sources.filter(s => s.freshness === 'caution').length
  const staleCount = sources.filter(s => s.freshness === 'stale').length

  // Render body text with clickable markers
  function renderBodyWithMarkers(text: string) {
    // Split by marker patterns like [①] [②] etc.
    const parts: Array<{ type: 'text' | 'marker'; content: string; index?: number }> = []
    let remaining = text

    const markerRegex = /\[([①②③④⑤⑥⑦⑧⑨⑩])\]/g
    let match
    let lastIndex = 0

    while ((match = markerRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ type: 'text', content: text.slice(lastIndex, match.index) })
      }
      const idx = CIRCLE_NUMBERS.indexOf(match[1]) + 1
      parts.push({ type: 'marker', content: match[0], index: idx })
      lastIndex = match.index + match[0].length
    }

    if (lastIndex < text.length) {
      parts.push({ type: 'text', content: text.slice(lastIndex) })
    }

    if (parts.length === 0) {
      return <>{remaining}</>
    }

    return (
      <>
        {parts.map((part, i) => {
          if (part.type === 'marker' && part.index) {
            const source = sources.find(s => s.index === part.index)
            const freshness = source ? FRESHNESS_CONFIG[source.freshness as keyof typeof FRESHNESS_CONFIG] : null
            return (
              <button
                key={i}
                onClick={() => scrollToSource(part.index!)}
                className={`inline-flex items-center rounded px-0.5 text-xs font-bold transition-colors hover:opacity-80 ${
                  freshness ? freshness.color : 'text-neutral-500'
                }`}
                title={source ? source.fact : ''}
              >
                {part.content}
              </button>
            )
          }
          return <span key={i}>{part.content}</span>
        })}
      </>
    )
  }

  return (
    <div>
      <div className="flex items-center gap-4">
        <Link href={`/letters/${letterId}`} className="text-sm text-neutral-900 hover:underline">
          ← 手紙詳細
        </Link>
        <h1 className="text-2xl font-bold text-neutral-900">手紙の確認・承認</h1>
      </div>

      {/* Recipient info */}
      <div className="mt-4 rounded-lg border border-neutral-200 bg-white px-5 py-3">
        <p className="text-sm font-medium text-neutral-900">
          {contact?.full_name} 様 / {(company as { name: string } | null)?.name ?? ''} / {contact?.department ?? ''} {contact?.title ?? ''}
        </p>
      </div>

      {letter.is_approved && (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-5 py-3">
          <p className="text-sm font-medium text-emerald-700">
            承認済み — {letter.approved_by} ({letter.approved_at ? new Date(letter.approved_at).toLocaleString('ja-JP') : ''})
          </p>
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Sources */}
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-neutral-900">
            使用した情報とソース
          </h2>

          {/* AIファクトチェック状態 */}
          {factChecking && (
            <div className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
              <div className="flex items-center gap-3">
                <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-neutral-900" />
                <p className="text-sm font-medium text-neutral-700">AIがファクトチェック中...</p>
              </div>
              <p className="mt-1 text-xs text-neutral-400">各ソースの事実を自動検証しています（10秒程度）</p>
            </div>
          )}

          {/* AIファクトチェックサマリー */}
          {factCheckDone && factCheckResults.length > 0 && (
            <div className="mt-4 rounded-lg border border-neutral-200 bg-white p-3">
              <p className="text-xs font-medium text-neutral-500">AIファクトチェック結果</p>
              <div className="mt-1.5 flex gap-4 text-xs">
                <span className="text-emerald-600">OK: {factCheckResults.filter(r => r.verdict === 'ok').length}件</span>
                <span className="text-amber-600">要確認: {factCheckResults.filter(r => r.verdict === 'caution').length}件</span>
                <span className="text-red-600">要修正: {factCheckResults.filter(r => r.verdict === 'ng').length}件</span>
              </div>
              {!factChecking && (
                <button
                  onClick={() => { setFactCheckDone(false); setFactCheckResults([]); if (letter) runFactCheck(letter, sources) }}
                  className="mt-2 text-xs text-neutral-400 hover:text-neutral-600 hover:underline"
                >
                  再チェック
                </button>
              )}
            </div>
          )}

          {sources.length === 0 ? (
            <p className="mt-4 text-sm text-neutral-500">ソース情報がありません（生成時にソースが未付与）</p>
          ) : (
            <div className="mt-4 space-y-3">
              {sources.map((source) => {
                const config = FRESHNESS_CONFIG[source.freshness as keyof typeof FRESHNESS_CONFIG] ?? FRESHNESS_CONFIG.fresh
                const daysSince = Math.floor((Date.now() - new Date(source.fetched_at).getTime()) / (1000 * 60 * 60 * 24))
                const factCheck = factCheckResults.find(r => r.index === source.index)
                const verdictConfig = factCheck ? VERDICT_CONFIG[factCheck.verdict] : null
                return (
                  <div
                    key={source.index}
                    ref={el => { sourceRefs.current[source.index] = el }}
                    className={`rounded-lg border p-4 transition-all ${
                      source.is_verified
                        ? 'border-emerald-200 bg-emerald-50/50'
                        : factCheck?.verdict === 'ng'
                          ? 'border-red-200 bg-red-50/30'
                          : factCheck?.verdict === 'caution'
                            ? 'border-amber-200 bg-amber-50/30'
                            : 'border-neutral-200 bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2">
                        <button
                          onClick={() => scrollToMarkerInBody(source.index)}
                          className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-xs font-bold text-neutral-700 hover:bg-neutral-200"
                        >
                          {CIRCLE_NUMBERS[source.index - 1] || source.index}
                        </button>
                        <div className="min-w-0">
                          {editingSourceIndex === source.index ? (
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={editedFact}
                                onChange={(e) => setEditedFact(e.target.value)}
                                className="w-full rounded border border-neutral-300 px-2 py-1 text-sm"
                              />
                              <button onClick={saveEditedFact} className="shrink-0 text-xs text-emerald-600 hover:underline">保存</button>
                              <button onClick={() => setEditingSourceIndex(null)} className="shrink-0 text-xs text-neutral-400 hover:underline">取消</button>
                            </div>
                          ) : (
                            <p className="text-sm font-medium text-neutral-900">{source.fact}</p>
                          )}
                          <p className="mt-1 text-xs text-neutral-500">
                            ソース: {source.source_name}
                          </p>
                          <div className="mt-1 flex items-center gap-2">
                            <span className={`text-xs ${config.color}`}>
                              取得日: {source.fetched_at} {config.icon} {daysSince}日前
                            </span>
                          </div>
                        </div>
                      </div>
                      {/* AI判定バッジ */}
                      {verdictConfig && (
                        <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium ${verdictConfig.bg} ${verdictConfig.color}`}>
                          {verdictConfig.icon} {verdictConfig.label}
                        </span>
                      )}
                    </div>

                    {/* AI判定理由 */}
                    {factCheck && (
                      <div className={`mt-2 rounded-md border px-3 py-2 text-xs ${verdictConfig?.bg ?? 'bg-neutral-50 border-neutral-200'}`}>
                        <p className={`font-medium ${verdictConfig?.color ?? 'text-neutral-600'}`}>AI判定: {factCheck.reason}</p>
                        {factCheck.suggestion && (
                          <p className="mt-1 text-neutral-600">修正提案: {factCheck.suggestion}</p>
                        )}
                      </div>
                    )}

                    <div className="mt-3 flex items-center gap-2">
                      {source.source_url && (
                        <a
                          href={source.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-200"
                        >
                          URLを開く
                        </a>
                      )}
                      <button
                        onClick={() => toggleVerified(source.index)}
                        className={`rounded px-2.5 py-1 text-xs font-medium transition-all ${
                          source.is_verified
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-neutral-100 text-neutral-600 hover:bg-emerald-50 hover:text-emerald-600'
                        }`}
                      >
                        {source.is_verified ? '\u2705 確認済み' : '\u2705 確認済みにする'}
                      </button>
                      <button
                        onClick={() => openEditBody(source.index)}
                        className="rounded bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100"
                      >
                        \u26A0\uFE0F 要修正
                      </button>
                      <button
                        onClick={() => startEditFact(source)}
                        className="rounded bg-neutral-50 px-2.5 py-1 text-xs font-medium text-neutral-500 hover:bg-neutral-100"
                      >
                        事実を編集
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Freshness summary */}
          {sources.length > 0 && (
            <div className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
              <p className="text-xs font-medium text-neutral-500">ソース鮮度サマリー</p>
              <div className="mt-1.5 flex gap-4 text-xs">
                <span className="text-emerald-600">\u2705 1ヶ月以内: {freshCount}件</span>
                <span className="text-amber-600">\u26A0\uFE0F 1〜6ヶ月: {cautionCount}件</span>
                <span className="text-red-600">\uD83D\uDD34 6ヶ月超: {staleCount}件</span>
              </div>
            </div>
          )}

          {/* Verification progress */}
          {sources.length > 0 && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-neutral-500">
                <span>確認状況: {verifiedCount} / {sources.length} 件確認済み</span>
              </div>
              <div className="mt-1.5 flex gap-1">
                {sources.map((s) => (
                  <button
                    key={s.index}
                    onClick={() => scrollToSource(s.index)}
                    className={`rounded px-2 py-0.5 text-xs font-medium transition-all ${
                      s.is_verified
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-neutral-100 text-neutral-500'
                    }`}
                  >
                    {CIRCLE_NUMBERS[s.index - 1] || s.index} {s.is_verified ? '\u2705' : ''}
                  </button>
                ))}
              </div>
              <button
                onClick={markAllVerified}
                className="mt-2 text-xs text-neutral-500 hover:text-neutral-700 hover:underline"
              >
                全て確認済みにする
              </button>
            </div>
          )}
        </div>

        {/* Letter body */}
        <div ref={bodyRef}>
          <h2 className="text-base font-semibold text-neutral-900">手紙本文</h2>

          {editingBody ? (
            <div className="mt-4">
              <textarea
                value={editedBody}
                onChange={(e) => setEditedBody(e.target.value)}
                rows={20}
                className="w-full rounded-lg border border-neutral-300 p-4 font-serif text-sm leading-relaxed text-neutral-900"
              />
              <div className="mt-3 flex gap-2">
                <button
                  onClick={saveEditedBody}
                  className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
                >
                  保存
                </button>
                <button
                  onClick={() => { setEditingBody(false); setEditedBody(letter.body_text) }}
                  className="text-sm text-neutral-500 hover:underline"
                >
                  キャンセル
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-lg border border-neutral-200 bg-white p-6">
              <div className="whitespace-pre-wrap font-serif text-sm leading-relaxed text-neutral-900">
                {renderBodyWithMarkers(letter.body_text)}
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-neutral-100 pt-3">
                <p className="text-xs text-neutral-400">{letter.body_text.length}文字</p>
                <button
                  onClick={() => openEditBody()}
                  className="text-xs text-neutral-500 hover:text-neutral-700 hover:underline"
                >
                  本文を編集
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Approval bar */}
      {!letter.is_approved && (
        <div className="mt-8 rounded-lg border border-neutral-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <div className="text-sm text-neutral-600">
              {sources.length > 0 ? (
                allVerified
                  ? '\u2705 全ソース確認済み。承認してdocxをダウンロードできます。'
                  : `\u26A0\uFE0F 未確認ソースが${sources.length - verifiedCount}件あります。全て確認してください。`
              ) : (
                'ソース情報がないため、そのまま承認できます。'
              )}
            </div>
            <button
              onClick={handleApprove}
              disabled={approving || (sources.length > 0 && !allVerified)}
              className="rounded-lg bg-neutral-900 px-6 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {approving ? '処理中...' : '承認してdocxをダウンロード'}
            </button>
          </div>
        </div>
      )}

      {/* Save sources button (periodic save) */}
      {sources.length > 0 && !letter.is_approved && (
        <div className="mt-3 text-right">
          <button
            onClick={saveSources}
            className="text-xs text-neutral-400 hover:text-neutral-600 hover:underline"
          >
            確認状況を保存
          </button>
        </div>
      )}
    </div>
  )
}
