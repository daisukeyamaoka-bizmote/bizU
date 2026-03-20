'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { REACTION_TYPES, REACTION_CHANNELS, NEXT_ACTIONS } from '@/lib/constants'

type ReactionRow = {
  id: string
  letter_id: string
  reaction_type: string
  reaction_channel: string | null
  reacted_at: string
  days_to_react: number | null
  memo: string | null
  next_action: string | null
  next_action_date: string | null
  next_action_log: string | null
  created_at: string
  // joined
  contact_name: string
  company_name: string
  department: string | null
  title: string | null
  why_you_angle: string
  sent_at: string | null
}

const REACTION_COLORS: Record<string, string> = {
  '返信あり': 'bg-blue-50 text-blue-700 border-blue-200',
  '商談化': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  '失注': 'bg-red-50 text-red-600 border-red-200',
  '無反応': 'bg-neutral-100 text-neutral-500 border-neutral-200',
  '再送希望': 'bg-amber-50 text-amber-700 border-amber-200',
}

type SortKey = 'reacted_at' | 'company_name' | 'contact_name' | 'reaction_type' | 'next_action_date' | 'days_to_react'

export default function ReactionsPage() {
  const [reactions, setReactions] = useState<ReactionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filterType, setFilterType] = useState<string>('')
  const [filterNextAction, setFilterNextAction] = useState<string>('')
  const [sortKey, setSortKey] = useState<SortKey>('reacted_at')
  const [sortAsc, setSortAsc] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<{
    next_action: string
    next_action_date: string
    next_action_log: string
    memo: string
  }>({ next_action: '', next_action_date: '', next_action_log: '', memo: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadReactions()
  }, [])

  async function loadReactions() {
    const supabase = createClient()

    const { data, error } = await supabase
      .from('reactions')
      .select(`
        id, letter_id, reaction_type, reaction_channel, reacted_at,
        days_to_react, memo, next_action, next_action_date, next_action_log, created_at,
        letters(
          why_you_angle, sent_at,
          contacts(full_name, department, title, target_companies(name))
        )
      `)
      .order('reacted_at', { ascending: false })
      .limit(300)

    if (error) {
      console.error('[reactions] Query failed:', error.message)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mapped: ReactionRow[] = (data ?? []).map((r: any) => {
      const letter = Array.isArray(r.letters) ? r.letters[0] : r.letters
      const contact = letter?.contacts
        ? (Array.isArray(letter.contacts) ? letter.contacts[0] : letter.contacts)
        : null
      const company = contact?.target_companies
        ? (Array.isArray(contact.target_companies) ? contact.target_companies[0] : contact.target_companies)
        : null

      return {
        id: r.id,
        letter_id: r.letter_id,
        reaction_type: r.reaction_type,
        reaction_channel: r.reaction_channel,
        reacted_at: r.reacted_at,
        days_to_react: r.days_to_react,
        memo: r.memo,
        next_action: r.next_action,
        next_action_date: r.next_action_date,
        next_action_log: r.next_action_log,
        created_at: r.created_at,
        contact_name: contact?.full_name ?? '-',
        company_name: company?.name ?? '-',
        department: contact?.department ?? null,
        title: contact?.title ?? null,
        why_you_angle: letter?.why_you_angle ?? '',
        sent_at: letter?.sent_at ?? null,
      }
    })

    setReactions(mapped)
    setLoading(false)
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(!sortAsc)
    else { setSortKey(key); setSortAsc(key === 'company_name' || key === 'contact_name') }
  }

  function startEdit(r: ReactionRow) {
    setEditingId(r.id)
    setEditForm({
      next_action: r.next_action ?? '',
      next_action_date: r.next_action_date ?? '',
      next_action_log: r.next_action_log ?? '',
      memo: r.memo ?? '',
    })
  }

  async function saveEdit() {
    if (!editingId) return
    setSaving(true)
    const supabase = createClient()
    await supabase
      .from('reactions')
      .update({
        next_action: editForm.next_action || null,
        next_action_date: editForm.next_action_date || null,
        next_action_log: editForm.next_action_log || null,
        memo: editForm.memo || null,
      })
      .eq('id', editingId)

    setSaving(false)
    setEditingId(null)
    loadReactions()
  }

  // Filter
  const filtered = reactions.filter(r => {
    if (filterType && r.reaction_type !== filterType) return false
    if (filterNextAction && r.next_action !== filterNextAction) return false
    return true
  })

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    const va = (a[sortKey as keyof ReactionRow] ?? '') as string | number
    const vb = (b[sortKey as keyof ReactionRow] ?? '') as string | number
    if (typeof va === 'number' && typeof vb === 'number') {
      return sortAsc ? va - vb : vb - va
    }
    return sortAsc
      ? String(va).localeCompare(String(vb))
      : String(vb).localeCompare(String(va))
  })

  // Summary counts
  const typeCounts: Record<string, number> = {}
  for (const r of reactions) {
    typeCounts[r.reaction_type] = (typeCounts[r.reaction_type] ?? 0) + 1
  }

  // Upcoming next actions
  const today = new Date().toISOString().split('T')[0]
  const upcomingActions = reactions.filter(r => r.next_action && r.next_action_date && r.next_action_date <= today)

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
      <h1 className="text-2xl font-bold text-neutral-900">反応記録</h1>

      {/* サマリーカード */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-lg border border-neutral-200 bg-white p-3">
          <p className="text-xs text-neutral-500">全反応数</p>
          <p className="mt-1 text-xl font-bold text-neutral-900">{reactions.length}</p>
        </div>
        {REACTION_TYPES.map(type => (
          <div key={type} className="rounded-lg border border-neutral-200 bg-white p-3">
            <p className="text-xs text-neutral-500">{type}</p>
            <p className="mt-1 text-xl font-bold text-neutral-900">{typeCounts[type] ?? 0}</p>
          </div>
        ))}
      </div>

      {/* 期限到来アクションアラート */}
      {upcomingActions.length > 0 && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-800">
            期限到来・超過のアクションが {upcomingActions.length} 件あります
          </p>
          <div className="mt-2 space-y-1">
            {upcomingActions.slice(0, 5).map(r => (
              <p key={r.id} className="text-xs text-amber-700">
                {r.next_action_date} — {r.company_name} {r.contact_name} : {r.next_action}
                {r.next_action_log && <span className="ml-1 text-amber-600">({r.next_action_log})</span>}
              </p>
            ))}
            {upcomingActions.length > 5 && (
              <p className="text-xs text-amber-600">他 {upcomingActions.length - 5} 件</p>
            )}
          </div>
        </div>
      )}

      {/* フィルター */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-900"
          >
            <option value="">反応種別: すべて</option>
            {REACTION_TYPES.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <select
            value={filterNextAction}
            onChange={(e) => setFilterNextAction(e.target.value)}
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-900"
          >
            <option value="">次アクション: すべて</option>
            {NEXT_ACTIONS.map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
        {(filterType || filterNextAction) && (
          <button
            onClick={() => { setFilterType(''); setFilterNextAction('') }}
            className="text-xs text-neutral-500 hover:text-neutral-700 hover:underline"
          >
            フィルター解除
          </button>
        )}
        <span className="text-xs text-neutral-400">{sorted.length}件表示</span>
      </div>

      {/* テーブル */}
      <div className="mt-4 overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="min-w-full divide-y divide-neutral-200">
          <thead className="bg-neutral-50">
            <tr>
              <SortHeader k="reacted_at" label="反応日" />
              <SortHeader k="company_name" label="企業名" />
              <SortHeader k="contact_name" label="担当名" />
              <th className="whitespace-nowrap px-3 py-3 text-left text-xs font-medium uppercase text-neutral-500">部署・役職</th>
              <SortHeader k="reaction_type" label="反応種別" />
              <th className="whitespace-nowrap px-3 py-3 text-left text-xs font-medium uppercase text-neutral-500">チャネル</th>
              <SortHeader k="days_to_react" label="反応日数" />
              <th className="whitespace-nowrap px-3 py-3 text-left text-xs font-medium uppercase text-neutral-500">訴求</th>
              <th className="whitespace-nowrap px-3 py-3 text-left text-xs font-medium uppercase text-neutral-500">メモ</th>
              <th className="whitespace-nowrap px-3 py-3 text-left text-xs font-medium uppercase text-neutral-500">次アクション</th>
              <SortHeader k="next_action_date" label="予定日" />
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
            ) : sorted.length === 0 ? (
              <tr>
                <td colSpan={12} className="px-4 py-8 text-center text-sm text-neutral-500">
                  反応記録がありません
                </td>
              </tr>
            ) : (
              sorted.map((r) => {
                const color = REACTION_COLORS[r.reaction_type] ?? 'bg-neutral-100 text-neutral-600 border-neutral-200'
                const isOverdue = r.next_action_date && r.next_action_date <= today
                const isEditing = editingId === r.id

                return isEditing ? (
                  <tr key={r.id} className="bg-neutral-50">
                    <td className="whitespace-nowrap px-3 py-3 text-sm text-neutral-600">{r.reacted_at}</td>
                    <td className="px-3 py-3 text-sm font-medium text-neutral-900">{r.company_name}</td>
                    <td className="px-3 py-3 text-sm text-neutral-900">{r.contact_name}</td>
                    <td className="px-3 py-3 text-sm text-neutral-600">
                      {[r.department, r.title].filter(Boolean).join(' / ') || '-'}
                    </td>
                    <td className="px-3 py-3">
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${color}`}>
                        {r.reaction_type}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-sm text-neutral-600">{r.reaction_channel ?? '-'}</td>
                    <td className="px-3 py-3 text-sm text-neutral-600">{r.days_to_react != null ? `${r.days_to_react}日` : '-'}</td>
                    <td className="px-3 py-3 text-sm text-neutral-600">{r.why_you_angle}</td>
                    <td className="px-3 py-2">
                      <textarea
                        value={editForm.memo}
                        onChange={(e) => setEditForm({ ...editForm, memo: e.target.value })}
                        rows={2}
                        className="w-full min-w-[140px] rounded border border-neutral-300 px-2 py-1 text-xs text-neutral-900"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={editForm.next_action}
                        onChange={(e) => setEditForm({ ...editForm, next_action: e.target.value })}
                        className="rounded border border-neutral-300 px-2 py-1 text-xs text-neutral-900"
                      >
                        <option value="">-</option>
                        {NEXT_ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
                      </select>
                      {editForm.next_action && (
                        <input
                          type="text"
                          value={editForm.next_action_log}
                          onChange={(e) => setEditForm({ ...editForm, next_action_log: e.target.value })}
                          placeholder="引き継ぎメモ"
                          className="mt-1 w-full rounded border border-neutral-300 px-2 py-1 text-xs text-neutral-900"
                        />
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="date"
                        value={editForm.next_action_date}
                        onChange={(e) => setEditForm({ ...editForm, next_action_date: e.target.value })}
                        className="rounded border border-neutral-300 px-2 py-1 text-xs text-neutral-900"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={saveEdit}
                          disabled={saving}
                          className="rounded bg-neutral-900 px-3 py-1 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
                        >
                          {saving ? '...' : '保存'}
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="text-xs text-neutral-500 hover:underline"
                        >
                          取消
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={r.id} className="hover:bg-neutral-50">
                    <td className="whitespace-nowrap px-3 py-3 text-sm text-neutral-600">{r.reacted_at}</td>
                    <td className="px-3 py-3 text-sm font-medium">
                      <Link href={`/letters/${r.letter_id}`} className="text-neutral-900 hover:text-blue-700 hover:underline">
                        {r.company_name}
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-sm text-neutral-900">{r.contact_name}</td>
                    <td className="px-3 py-3 text-sm text-neutral-600">
                      {[r.department, r.title].filter(Boolean).join(' / ') || '-'}
                    </td>
                    <td className="px-3 py-3">
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${color}`}>
                        {r.reaction_type}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-sm text-neutral-600">{r.reaction_channel ?? '-'}</td>
                    <td className="px-3 py-3 text-sm text-neutral-600">{r.days_to_react != null ? `${r.days_to_react}日` : '-'}</td>
                    <td className="px-3 py-3 text-sm text-neutral-600">{r.why_you_angle}</td>
                    <td className="max-w-[160px] truncate px-3 py-3 text-xs text-neutral-600" title={r.memo ?? ''}>
                      {r.memo ?? '-'}
                    </td>
                    <td className="px-3 py-3 text-sm">
                      {r.next_action ? (
                        <span className="text-xs text-neutral-700">{r.next_action}</span>
                      ) : (
                        <span className="text-xs text-neutral-400">-</span>
                      )}
                      {r.next_action_log && (
                        <p className="mt-0.5 text-[11px] text-neutral-400" title={r.next_action_log}>
                          {r.next_action_log.length > 20 ? r.next_action_log.slice(0, 20) + '...' : r.next_action_log}
                        </p>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-sm">
                      {r.next_action_date ? (
                        <span className={`text-xs ${isOverdue ? 'font-medium text-red-600' : 'text-neutral-600'}`}>
                          {r.next_action_date}
                          {isOverdue && ' !'}
                        </span>
                      ) : (
                        <span className="text-xs text-neutral-400">-</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-sm">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => startEdit(r)}
                          className="text-xs text-neutral-500 hover:text-neutral-700 hover:underline"
                        >
                          編集
                        </button>
                        <Link
                          href={`/letters/${r.letter_id}`}
                          className="text-xs text-neutral-500 hover:text-neutral-700 hover:underline"
                        >
                          手紙
                        </Link>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
