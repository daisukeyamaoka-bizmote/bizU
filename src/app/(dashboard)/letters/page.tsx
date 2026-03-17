'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { REACTION_TYPES, REACTION_CHANNELS, NEXT_ACTIONS } from '@/lib/constants'

type LetterRow = {
  id: string
  contact_name: string
  company_name: string
  department: string | null
  title: string | null
  client_name: string
  body_text: string
  hypothesis: string | null
  sent_at: string | null
  why_you_angle: string
  reaction_type: string | null
  reaction_id: string | null
  is_approved: boolean
  approved_by: string | null
  created_at: string
}

type InlineReaction = {
  letterId: string
  reactionType: string | null
  reactedAt: string
  reactionChannel: string
  memo: string
  nextAction: string
  nextActionDate: string
  nextActionLog: string
}

const REACTION_COLORS: Record<string, string> = {
  '返信あり': 'bg-blue-50 text-blue-700 border-blue-200',
  '商談化': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  '失注': 'bg-red-50 text-red-600 border-red-200',
  '無反応': 'bg-neutral-100 text-neutral-500 border-neutral-200',
  '再送希望': 'bg-amber-50 text-amber-700 border-amber-200',
}

type SortKey = 'created_at' | 'contact_name' | 'company_name' | 'sent_at' | 'why_you_angle' | 'department' | 'title' | 'hypothesis'

export default function LettersPage() {
  const [letters, setLetters] = useState<LetterRow[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [inline, setInline] = useState<InlineReaction | null>(null)
  const [saving, setSaving] = useState(false)
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('created_at')
  const [sortAsc, setSortAsc] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDownloading, setBulkDownloading] = useState(false)

  useEffect(() => {
    loadLetters()
  }, [])

  async function loadLetters() {
    const supabase = createClient()

    const { data, error: queryError } = await supabase
      .from('letters')
      .select(`
        id, sent_at, why_you_angle, body_text, hypothesis, created_at,
        is_approved, approved_by,
        contacts(full_name, department, title, target_companies(name)),
        clients(name)
      `)
      .order('created_at', { ascending: false })
      .limit(200)

    if (queryError) {
      console.error('[letters] Query failed:', queryError.message, queryError.code)
      setError(`データ取得に失敗しました: ${queryError.message}`)
    }

    const letterIds = data?.map(l => l.id) ?? []
    const { data: reactions } = letterIds.length > 0
      ? await supabase
          .from('reactions')
          .select('id, letter_id, reaction_type')
          .in('letter_id', letterIds)
      : { data: [] }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mapped: LetterRow[] = (data ?? []).map((l: any) => {
      const contact = Array.isArray(l.contacts) ? l.contacts[0] : l.contacts
      const company = contact && 'target_companies' in contact
        ? (Array.isArray(contact.target_companies) ? contact.target_companies[0] : contact.target_companies)
        : null
      const clientObj = Array.isArray(l.clients) ? l.clients[0] : l.clients
      const reaction = (reactions ?? []).find(r => r.letter_id === l.id)
      return {
        id: l.id,
        contact_name: contact?.full_name ?? '-',
        company_name: company?.name ?? '-',
        department: contact?.department ?? null,
        title: contact?.title ?? null,
        client_name: clientObj?.name ?? '',
        body_text: l.body_text ?? '',
        hypothesis: l.hypothesis ?? null,
        sent_at: l.sent_at ?? null,
        why_you_angle: l.why_you_angle ?? '',
        reaction_type: reaction?.reaction_type ?? null,
        reaction_id: reaction?.id ?? null,
        is_approved: l.is_approved ?? false,
        approved_by: l.approved_by ?? null,
        created_at: l.created_at,
      }
    })

    setLetters(mapped)
    setLoading(false)
  }

  async function markAsSent(letterId: string) {
    setSendingId(letterId)
    const supabase = createClient()
    const today = new Date().toISOString().split('T')[0]
    await supabase.from('letters').update({ sent_at: today }).eq('id', letterId)
    setLetters(prev => prev.map(l => l.id === letterId ? { ...l, sent_at: today } : l))
    setSendingId(null)
  }

  function openInlineReaction(letterId: string) {
    setExpandedId(letterId)
    setInline({
      letterId,
      reactionType: null,
      reactedAt: new Date().toISOString().split('T')[0],
      reactionChannel: '',
      memo: '',
      nextAction: '',
      nextActionDate: '',
      nextActionLog: '',
    })
  }

  function closeInline() {
    setExpandedId(null)
    setInline(null)
  }

  function selectReactionType(type: string) {
    if (!inline) return
    setInline({ ...inline, reactionType: type })
  }

  async function saveReaction() {
    if (!inline || !inline.reactionType) return
    setSaving(true)
    const supabase = createClient()

    const letter = letters.find(l => l.id === inline.letterId)
    let daysToReact: number | null = null
    if (letter?.sent_at && inline.reactedAt) {
      const sent = new Date(letter.sent_at)
      const reacted = new Date(inline.reactedAt)
      daysToReact = Math.floor((reacted.getTime() - sent.getTime()) / (1000 * 60 * 60 * 24))
    }

    await supabase.from('reactions').insert({
      letter_id: inline.letterId,
      reaction_type: inline.reactionType,
      reacted_at: inline.reactedAt,
      days_to_react: daysToReact,
      reaction_channel: inline.reactionChannel || null,
      memo: inline.memo || null,
      next_action: inline.nextAction || null,
      next_action_date: inline.nextActionDate || null,
      next_action_log: inline.nextActionLog || null,
    })

    setSaving(false)
    closeInline()
    loadLetters()
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(!sortAsc)
    else { setSortKey(key); setSortAsc(key === 'contact_name' || key === 'company_name') }
  }

  const sortedLetters = [...letters].sort((a, b) => {
    const va = (a[sortKey as keyof LetterRow] ?? '') as string
    const vb = (b[sortKey as keyof LetterRow] ?? '') as string
    return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va)
  })

  // 選択管理
  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    const approvedIds = sortedLetters.filter(l => l.is_approved && l.body_text).map(l => l.id)
    if (approvedIds.every(id => selectedIds.has(id))) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(approvedIds))
    }
  }

  async function bulkDownload() {
    if (selectedIds.size === 0) return
    setBulkDownloading(true)
    try {
      const res = await fetch('/api/generate-docx-bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ letterIds: Array.from(selectedIds) }),
      })
      if (!res.ok) {
        const err = await res.json()
        alert(err.error || '一括ダウンロードに失敗しました')
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const now = new Date()
      const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`
      a.download = `手紙一括_${yyyymm}.zip`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setBulkDownloading(false)
    }
  }

  const approvedCount = sortedLetters.filter(l => l.is_approved && l.body_text).length

  const SortHeader = ({ k, label }: { k: SortKey; label: string }) => (
    <th
      onClick={() => handleSort(k)}
      className="cursor-pointer whitespace-nowrap px-3 py-3 text-left text-xs font-medium uppercase text-neutral-500 hover:text-neutral-900 select-none"
    >
      {label}{sortKey === k ? (sortAsc ? ' ↑' : ' ↓') : ''}
    </th>
  )

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-neutral-900">手紙管理</h1>
        {selectedIds.size > 0 && (
          <button
            onClick={bulkDownload}
            disabled={bulkDownloading}
            className="flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {bulkDownloading ? 'ダウンロード中...' : `${selectedIds.size}件を一括DL`}
          </button>
        )}
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p className="font-medium">エラー</p>
          <p className="mt-1">{error}</p>
          <p className="mt-2 text-xs text-red-500">
            RLSポリシーが未設定の可能性があります。Supabase SQL Editorで010_add_rls_policies.sqlを実行してください。
          </p>
        </div>
      )}

      {/* 選択ツールバー */}
      {approvedCount > 0 && (
        <div className="mt-4 flex items-center gap-3 text-xs text-neutral-500">
          <span>承認済み {approvedCount}件</span>
          {selectedIds.size > 0 && (
            <>
              <span className="text-neutral-300">|</span>
              <span className="font-medium text-neutral-900">{selectedIds.size}件選択中</span>
              <button onClick={() => setSelectedIds(new Set())} className="text-neutral-400 hover:text-neutral-600 hover:underline">選択解除</button>
            </>
          )}
        </div>
      )}

      <div className="mt-4 overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="min-w-full divide-y divide-neutral-200">
          <thead className="bg-neutral-50">
            <tr>
              <th className="w-10 px-3 py-3">
                <input
                  type="checkbox"
                  checked={approvedCount > 0 && sortedLetters.filter(l => l.is_approved && l.body_text).every(l => selectedIds.has(l.id))}
                  onChange={toggleSelectAll}
                  className="h-4 w-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-500"
                />
              </th>
              <SortHeader k="company_name" label="企業名" />
              <SortHeader k="department" label="部署" />
              <SortHeader k="title" label="役職" />
              <SortHeader k="contact_name" label="担当名" />
              <SortHeader k="hypothesis" label="手紙タイトル" />
              <SortHeader k="why_you_angle" label="訴求・切り口" />
              <SortHeader k="created_at" label="作成日" />
              <th className="whitespace-nowrap px-3 py-3 text-left text-xs font-medium uppercase text-neutral-500">承認</th>
              <SortHeader k="sent_at" label="送付" />
              <th className="whitespace-nowrap px-3 py-3 text-left text-xs font-medium uppercase text-neutral-500">反応</th>
              <th className="whitespace-nowrap px-3 py-3 text-left text-xs font-medium uppercase text-neutral-500">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {loading ? (
              <tr>
                <td colSpan={12} className="px-4 py-8 text-center text-sm text-neutral-500">
                  読み込み中...
                </td>
              </tr>
            ) : letters.length === 0 ? (
              <tr>
                <td colSpan={12} className="px-4 py-8 text-center text-sm text-neutral-500">
                  手紙がありません
                </td>
              </tr>
            ) : (
              sortedLetters.map((letter) => (
                <LetterRowWithReaction
                  key={letter.id}
                  letter={letter}
                  isExpanded={expandedId === letter.id}
                  inline={expandedId === letter.id ? inline : null}
                  saving={saving}
                  sendingId={sendingId}
                  isSelected={selectedIds.has(letter.id)}
                  onToggleSelect={() => toggleSelect(letter.id)}
                  onOpenReaction={() => openInlineReaction(letter.id)}
                  onCloseReaction={closeInline}
                  onSelectType={selectReactionType}
                  onUpdateInline={(updates) => inline && setInline({ ...inline, ...updates })}
                  onSave={saveReaction}
                  onMarkAsSent={() => markAsSent(letter.id)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function LetterRowWithReaction({
  letter,
  isExpanded,
  inline,
  saving,
  sendingId,
  isSelected,
  onToggleSelect,
  onOpenReaction,
  onCloseReaction,
  onSelectType,
  onUpdateInline,
  onSave,
  onMarkAsSent,
}: {
  letter: LetterRow
  isExpanded: boolean
  inline: InlineReaction | null
  saving: boolean
  sendingId: string | null
  isSelected: boolean
  onToggleSelect: () => void
  onOpenReaction: () => void
  onCloseReaction: () => void
  onSelectType: (type: string) => void
  onUpdateInline: (updates: Partial<InlineReaction>) => void
  onSave: () => void
  onMarkAsSent: () => void
}) {
  const reactionColor = letter.reaction_type
    ? REACTION_COLORS[letter.reaction_type] ?? 'bg-neutral-100 text-neutral-600'
    : ''

  const createdDate = letter.created_at ? letter.created_at.split('T')[0] : '-'
  const canSelect = letter.is_approved && !!letter.body_text

  return (
    <>
      <tr className={`hover:bg-neutral-50 ${isExpanded ? 'bg-neutral-50' : ''}`}>
        {/* チェックボックス */}
        <td className="px-3 py-3">
          {canSelect ? (
            <input
              type="checkbox"
              checked={isSelected}
              onChange={onToggleSelect}
              className="h-4 w-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-500"
            />
          ) : (
            <span className="block h-4 w-4" />
          )}
        </td>
        {/* 企業名（クリックで詳細へ） */}
        <td className="px-3 py-3 text-sm font-medium">
          <Link href={`/letters/${letter.id}`} className="text-neutral-900 hover:text-blue-700 hover:underline">
            {letter.company_name}
          </Link>
        </td>
        <td className="px-3 py-3 text-sm text-neutral-600">{letter.department ?? '-'}</td>
        <td className="px-3 py-3 text-sm text-neutral-600">{letter.title ?? '-'}</td>
        {/* 担当名（クリックで詳細へ） */}
        <td className="px-3 py-3 text-sm font-medium">
          <Link href={`/letters/${letter.id}`} className="text-neutral-900 hover:text-blue-700 hover:underline">
            {letter.contact_name}
          </Link>
        </td>
        {/* 手紙タイトル */}
        <td className="max-w-[200px] truncate px-3 py-3 text-sm text-neutral-700" title={letter.hypothesis ?? ''}>
          {letter.hypothesis ?? '-'}
        </td>
        <td className="px-3 py-3 text-sm text-neutral-600">{letter.why_you_angle}</td>
        <td className="whitespace-nowrap px-3 py-3 text-sm text-neutral-600">{createdDate}</td>
        <td className="px-3 py-3 text-sm">
          {letter.is_approved ? (
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
              済
            </span>
          ) : (
            <Link
              href={`/letters/${letter.id}/review`}
              className="rounded-full border border-dashed border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 hover:border-amber-400"
            >
              未承認
            </Link>
          )}
        </td>
        <td className="whitespace-nowrap px-3 py-3 text-sm">
          {letter.sent_at ? (
            <span className="text-xs text-neutral-600">{letter.sent_at}</span>
          ) : (
            <button
              onClick={onMarkAsSent}
              disabled={sendingId === letter.id}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
            >
              {sendingId === letter.id ? '処理中...' : '送付済みにする'}
            </button>
          )}
        </td>
        <td className="px-3 py-3 text-sm">
          {letter.reaction_type ? (
            <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${reactionColor}`}>
              {letter.reaction_type}
            </span>
          ) : (
            <button
              onClick={onOpenReaction}
              className="rounded-full border border-dashed border-neutral-300 px-2 py-0.5 text-xs font-medium text-neutral-500 hover:border-neutral-400 hover:text-neutral-700"
            >
              ログ
            </button>
          )}
        </td>
        <td className="px-3 py-3 text-sm">
          <Link href={`/letters/${letter.id}`} className="text-xs text-neutral-600 hover:underline">
            詳細
          </Link>
        </td>
      </tr>

      {/* インライン反応記録フォーム */}
      {isExpanded && inline && (
        <tr>
          <td colSpan={12} className="border-b border-neutral-200 bg-neutral-50 px-4 py-4">
            <div className="mx-auto max-w-3xl">
              <div>
                <p className="text-xs font-medium text-neutral-500">反応種別を選択</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {REACTION_TYPES.map((type) => {
                    const isSelected = inline.reactionType === type
                    const color = REACTION_COLORS[type] ?? 'bg-neutral-100 text-neutral-600'
                    return (
                      <button
                        key={type}
                        onClick={() => onSelectType(type)}
                        className={`rounded-lg border px-4 py-2 text-sm font-medium transition-all ${
                          isSelected
                            ? `${color} ring-2 ring-neutral-400 ring-offset-1`
                            : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50'
                        }`}
                      >
                        {type}
                      </button>
                    )
                  })}
                </div>
              </div>

              {inline.reactionType && (
                <div className="mt-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <div>
                      <label className="block text-xs font-medium text-neutral-500">反応日</label>
                      <input
                        type="date"
                        value={inline.reactedAt}
                        onChange={(e) => onUpdateInline({ reactedAt: e.target.value })}
                        className="mt-1 block w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-900"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-neutral-500">反応チャネル</label>
                      <select
                        value={inline.reactionChannel}
                        onChange={(e) => onUpdateInline({ reactionChannel: e.target.value })}
                        className="mt-1 block w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-900"
                      >
                        <option value="">-</option>
                        {REACTION_CHANNELS.map((ch) => (
                          <option key={ch} value={ch}>{ch}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-neutral-500">次のアクション</label>
                      <select
                        value={inline.nextAction}
                        onChange={(e) => onUpdateInline({ nextAction: e.target.value })}
                        className="mt-1 block w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-900"
                      >
                        <option value="">-</option>
                        {NEXT_ACTIONS.map((a) => (
                          <option key={a} value={a}>{a}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {inline.nextAction && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-neutral-500">次回予定日</label>
                        <input
                          type="date"
                          value={inline.nextActionDate}
                          onChange={(e) => onUpdateInline({ nextActionDate: e.target.value })}
                          className="mt-1 block w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-900"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-neutral-500">判断根拠メモ（引き継ぎ用）</label>
                        <input
                          type="text"
                          value={inline.nextActionLog}
                          onChange={(e) => onUpdateInline({ nextActionLog: e.target.value })}
                          placeholder="予算は来期以降とのこと。Q1に再送推奨。"
                          className="mt-1 block w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-900"
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-neutral-500">メモ</label>
                    <textarea
                      value={inline.memo}
                      onChange={(e) => onUpdateInline({ memo: e.target.value })}
                      rows={2}
                      placeholder="「興味はあるが今期は予算なし」等"
                      className="mt-1 block w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-900"
                    />
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={onSave}
                      disabled={saving}
                      className="rounded-lg bg-neutral-900 px-5 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
                    >
                      {saving ? '保存中...' : '保存する'}
                    </button>
                    <button
                      onClick={onCloseReaction}
                      className="text-sm text-neutral-500 hover:underline"
                    >
                      キャンセル
                    </button>
                  </div>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
