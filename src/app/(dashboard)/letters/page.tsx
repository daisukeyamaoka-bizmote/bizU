'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { REACTION_TYPES, REACTION_CHANNELS, NEXT_ACTIONS } from '@/lib/constants'

type LetterRow = {
  id: string
  contact_name: string
  company_name: string
  sent_at: string | null
  why_you_angle: string
  reaction_type: string | null
  reaction_id: string | null
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

export default function LettersPage() {
  const [letters, setLetters] = useState<LetterRow[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [inline, setInline] = useState<InlineReaction | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadLetters()
  }, [])

  async function loadLetters() {
    const supabase = createClient()
    const { data } = await supabase
      .from('letters')
      .select(`
        id, sent_at, why_you_angle,
        contacts(full_name, target_companies(name))
      `)
      .order('created_at', { ascending: false })
      .limit(100)

    const letterIds = data?.map(l => l.id) ?? []
    const { data: reactions } = letterIds.length > 0
      ? await supabase
          .from('reactions')
          .select('id, letter_id, reaction_type')
          .in('letter_id', letterIds)
      : { data: [] }

    const mapped: LetterRow[] = (data ?? []).map((l) => {
      const contact = Array.isArray(l.contacts) ? l.contacts[0] : l.contacts
      const company = contact && 'target_companies' in contact
        ? (Array.isArray(contact.target_companies) ? contact.target_companies[0] : contact.target_companies)
        : null
      const reaction = (reactions ?? []).find(r => r.letter_id === l.id)
      return {
        id: l.id,
        contact_name: contact?.full_name ?? '-',
        company_name: (company as { name: string } | null)?.name ?? '-',
        sent_at: l.sent_at,
        why_you_angle: l.why_you_angle,
        reaction_type: reaction?.reaction_type ?? null,
        reaction_id: reaction?.id ?? null,
      }
    })

    setLetters(mapped)
    setLoading(false)
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

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-neutral-900">手紙一覧</h1>
        <Link
          href="/projects"
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          + 新規生成
        </Link>
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="min-w-full divide-y divide-neutral-200">
          <thead className="bg-neutral-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-neutral-500">宛先</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-neutral-500">会社名</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-neutral-500">送付日</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-neutral-500">切り口</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-neutral-500">反応</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-neutral-500">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-neutral-500">
                  読み込み中...
                </td>
              </tr>
            ) : letters.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-neutral-500">
                  手紙がありません
                </td>
              </tr>
            ) : (
              letters.map((letter) => (
                <LetterRowWithReaction
                  key={letter.id}
                  letter={letter}
                  isExpanded={expandedId === letter.id}
                  inline={expandedId === letter.id ? inline : null}
                  saving={saving}
                  onOpenReaction={() => openInlineReaction(letter.id)}
                  onCloseReaction={closeInline}
                  onSelectType={selectReactionType}
                  onUpdateInline={(updates) => inline && setInline({ ...inline, ...updates })}
                  onSave={saveReaction}
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
  onOpenReaction,
  onCloseReaction,
  onSelectType,
  onUpdateInline,
  onSave,
}: {
  letter: LetterRow
  isExpanded: boolean
  inline: InlineReaction | null
  saving: boolean
  onOpenReaction: () => void
  onCloseReaction: () => void
  onSelectType: (type: string) => void
  onUpdateInline: (updates: Partial<InlineReaction>) => void
  onSave: () => void
}) {
  const reactionColor = letter.reaction_type
    ? REACTION_COLORS[letter.reaction_type] ?? 'bg-neutral-100 text-neutral-600'
    : ''

  return (
    <>
      <tr className={`hover:bg-neutral-50 ${isExpanded ? 'bg-neutral-50' : ''}`}>
        <td className="px-4 py-3 text-sm font-medium text-neutral-900">{letter.contact_name}</td>
        <td className="px-4 py-3 text-sm text-neutral-600">{letter.company_name}</td>
        <td className="px-4 py-3 text-sm text-neutral-600">{letter.sent_at ?? '-'}</td>
        <td className="px-4 py-3 text-sm text-neutral-600">{letter.why_you_angle}</td>
        <td className="px-4 py-3 text-sm">
          {letter.reaction_type ? (
            <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${reactionColor}`}>
              {letter.reaction_type}
            </span>
          ) : (
            <button
              onClick={onOpenReaction}
              className="rounded-full border border-dashed border-neutral-300 px-2.5 py-1 text-xs font-medium text-neutral-500 hover:border-neutral-400 hover:text-neutral-700"
            >
              + 反応を記録
            </button>
          )}
        </td>
        <td className="px-4 py-3 text-sm">
          <Link href={`/letters/${letter.id}`} className="text-neutral-900 hover:underline">
            詳細
          </Link>
        </td>
      </tr>

      {/* インライン反応記録フォーム */}
      {isExpanded && inline && (
        <tr>
          <td colSpan={6} className="border-b border-neutral-200 bg-neutral-50 px-4 py-4">
            <div className="mx-auto max-w-3xl">
              {/* Step 1: 反応種別（5択ボタン） */}
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

              {/* Step 2: 選択後に詳細フィールド＋保存ボタンが出現 */}
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
