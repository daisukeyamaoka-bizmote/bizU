'use client'

import { useEffect, useState, useCallback } from 'react'
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

  const loadLetter = useCallback(async () => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('letters')
      .select(`
        id, body_text, hypothesis, sources, personalization,
        is_approved, approved_by, approved_at,
        why_you_angle, send_trigger, collected_context,
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
      const loadedSources = Array.isArray(data.sources) ? (data.sources as Source[]) : []
      setSources(loadedSources)
      setEditedBody(data.body_text)
    }
    setLoading(false)
  }, [letterId])

  useEffect(() => {
    loadLetter()
  }, [loadLetter])

  function toggleVerified(index: number) {
    setSources(prev => prev.map(s =>
      s.index === index ? { ...s, is_verified: !s.is_verified } : s
    ))
  }

  function markAllVerified() {
    setSources(prev => prev.map(s => ({ ...s, is_verified: true })))
  }

  async function saveEditedBody() {
    if (!letter) return
    const supabase = createClient()
    await supabase.from('letters').update({
      body_text: editedBody,
    }).eq('id', letter.id)
    setLetter({ ...letter, body_text: editedBody })
    setEditingBody(false)
  }

  async function handleApprove() {
    if (!letter) return
    setApproving(true)

    const supabase = createClient()

    // Save sources and approval
    await supabase.from('letters').update({
      sources,
      is_approved: true,
      approved_by: 'オペレーター',
      approved_at: new Date().toISOString(),
    }).eq('id', letter.id)

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
        title: letter.hypothesis ?? '',
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
  const allVerified = sources.length > 0 ? sources.every(s => s.is_verified) : true
  const verifiedCount = sources.filter(s => s.is_verified).length
  const personalization = letter.personalization

  return (
    <div>
      <div className="flex items-center gap-4">
        <Link href={`/letters/${letterId}`} className="text-sm text-neutral-500 hover:text-neutral-900 hover:underline">
          ← 手紙詳細
        </Link>
        <h1 className="text-xl font-bold text-neutral-900">確認・承認</h1>
      </div>

      {letter.is_approved && (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-5 py-3">
          <p className="text-sm font-medium text-emerald-700">
            承認済み — {letter.approved_by} ({letter.approved_at ? new Date(letter.approved_at).toLocaleString('ja-JP') : ''})
          </p>
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Left: personalization + sources */}
        <div className="lg:col-span-2 space-y-6">

          {/* 個別化ポイント */}
          <div className="rounded-lg border border-neutral-200 bg-white">
            <div className="border-b border-neutral-100 px-5 py-3">
              <h2 className="text-sm font-semibold text-neutral-900">個別化ポイント</h2>
              <p className="mt-0.5 text-xs text-neutral-400">
                {(company as { name: string } | null)?.name ?? ''} 向け
              </p>
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
                  <PointRow label="トリガー" value={letter.send_trigger ?? 'なし'} />
                </>
              )}
            </div>
          </div>

          {/* ソースリンク一覧 */}
          <div className="rounded-lg border border-neutral-200 bg-white">
            <div className="border-b border-neutral-100 px-5 py-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-neutral-900">ソースリンク一覧</h2>
                {sources.length > 0 && (
                  <span className="text-xs text-neutral-400">
                    {verifiedCount}/{sources.length} 確認済み
                  </span>
                )}
              </div>
              {sources.length > 0 && !allVerified && !letter.is_approved && (
                <button
                  onClick={markAllVerified}
                  className="mt-1 text-xs text-neutral-500 hover:text-neutral-700 hover:underline"
                >
                  全てアクセス確認済みにする
                </button>
              )}
            </div>

            {sources.length === 0 ? (
              <div className="px-5 py-4">
                <p className="text-sm text-neutral-500">ソース情報がありません</p>
              </div>
            ) : (
              <div className="divide-y divide-neutral-100">
                {sources.map((source) => (
                  <div key={source.index} className="px-5 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-neutral-900">{source.fact}</p>
                        <div className="mt-1">
                          {source.source_url ? (
                            <a
                              href={source.source_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-600 hover:underline break-all"
                            >
                              {source.source_url}
                            </a>
                          ) : (
                            <span className="text-xs text-neutral-400">{source.source_name}</span>
                          )}
                        </div>
                      </div>
                      {!letter.is_approved && (
                        <button
                          onClick={() => toggleVerified(source.index)}
                          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-all ${
                            source.is_verified
                              ? 'border-emerald-500 bg-emerald-500 text-white'
                              : 'border-neutral-300 bg-white hover:border-emerald-400'
                          }`}
                        >
                          {source.is_verified && (
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: letter body */}
        <div className="lg:col-span-3">
          <div className="rounded-lg border border-neutral-200 bg-white">
            <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-3">
              <h2 className="text-sm font-semibold text-neutral-900">手紙本文</h2>
              {!letter.is_approved && !editingBody && (
                <button
                  onClick={() => setEditingBody(true)}
                  className="text-xs text-neutral-500 hover:text-neutral-700 hover:underline"
                >
                  編集
                </button>
              )}
            </div>
            {editingBody ? (
              <div className="p-5">
                <textarea
                  value={editedBody}
                  onChange={(e) => setEditedBody(e.target.value)}
                  rows={24}
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
              <div className="p-5">
                {letter.hypothesis && (
                  <p className="mb-4 text-center text-sm font-bold text-neutral-900 underline underline-offset-4">
                    {letter.hypothesis}
                  </p>
                )}
                <div className="whitespace-pre-wrap font-serif text-sm leading-relaxed text-neutral-900">
                  {letter.body_text}
                </div>
                <p className="mt-4 border-t border-neutral-100 pt-3 text-xs text-neutral-400">
                  {letter.body_text.length}文字
                </p>
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
                allVerified
                  ? '全ソースのアクセス確認済み。承認して送付準備に進めます。'
                  : `未確認ソースが${sources.length - verifiedCount}件あります。全てのソースリンクにアクセスして内容を確認してください。`
              ) : (
                'ソース情報がないため、内容を確認して承認してください。'
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
