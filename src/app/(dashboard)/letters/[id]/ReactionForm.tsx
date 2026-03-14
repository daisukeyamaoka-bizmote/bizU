'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { REACTION_TYPES, REACTION_CHANNELS, NEXT_ACTIONS } from '@/lib/constants'

const REACTION_COLORS: Record<string, string> = {
  '返信あり': 'bg-blue-50 text-blue-700 border-blue-200',
  '商談化': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  '失注': 'bg-red-50 text-red-600 border-red-200',
  '無反応': 'bg-neutral-100 text-neutral-500 border-neutral-200',
  '再送希望': 'bg-amber-50 text-amber-700 border-amber-200',
}

export default function ReactionForm({
  letterId,
  sentAt,
}: {
  letterId: string
  sentAt: string | null
}) {
  const [open, setOpen] = useState(false)
  const [reactionType, setReactionType] = useState<string | null>(null)
  const [reactionChannel, setReactionChannel] = useState<string>('')
  const [reactedAt, setReactedAt] = useState(new Date().toISOString().split('T')[0])
  const [memo, setMemo] = useState('')
  const [nextAction, setNextAction] = useState<string>('')
  const [nextActionDate, setNextActionDate] = useState('')
  const [nextActionLog, setNextActionLog] = useState('')
  const [saving, setSaving] = useState(false)
  const router = useRouter()

  const handleSave = async () => {
    if (!reactionType) return
    setSaving(true)
    const supabase = createClient()

    let daysToReact: number | null = null
    if (sentAt && reactedAt) {
      const sent = new Date(sentAt)
      const reacted = new Date(reactedAt)
      daysToReact = Math.floor((reacted.getTime() - sent.getTime()) / (1000 * 60 * 60 * 24))
    }

    await supabase.from('reactions').insert({
      letter_id: letterId,
      reaction_type: reactionType,
      reaction_channel: reactionChannel || null,
      reacted_at: reactedAt,
      days_to_react: daysToReact,
      memo: memo || null,
      next_action: nextAction || null,
      next_action_date: nextActionDate || null,
      next_action_log: nextActionLog || null,
    })

    setSaving(false)
    setOpen(false)
    router.refresh()
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-4 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
      >
        + 反応を記録する
      </button>
    )
  }

  return (
    <div className="mt-4 space-y-4 rounded-lg border border-neutral-200 p-4">
      {/* 反応種別: 5択ボタン */}
      <div>
        <p className="text-xs font-medium text-neutral-500">反応種別を選択</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {REACTION_TYPES.map((type) => {
            const isSelected = reactionType === type
            const color = REACTION_COLORS[type] ?? 'bg-neutral-100 text-neutral-600'
            return (
              <button
                key={type}
                onClick={() => setReactionType(type)}
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

      {/* 選択後に詳細フィールド＋保存ボタン出現 */}
      {reactionType && (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-medium text-neutral-500">反応日</label>
              <input
                type="date"
                value={reactedAt}
                onChange={(e) => setReactedAt(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-500">反応チャネル</label>
              <select
                value={reactionChannel}
                onChange={(e) => setReactionChannel(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
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
                value={nextAction}
                onChange={(e) => setNextAction(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
              >
                <option value="">-</option>
                {NEXT_ACTIONS.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>
          </div>

          {nextAction && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-neutral-500">次回予定日</label>
                <input
                  type="date"
                  value={nextActionDate}
                  onChange={(e) => setNextActionDate(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-500">判断根拠メモ（引き継ぎ用）</label>
                <input
                  type="text"
                  value={nextActionLog}
                  onChange={(e) => setNextActionLog(e.target.value)}
                  placeholder="予算は来期以降とのこと。Q1に再送推奨。"
                  className="mt-1 block w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-neutral-500">メモ</label>
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              rows={3}
              className="mt-1 block w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
              placeholder="「興味はあるが今期は予算なし」等"
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              {saving ? '保存中...' : '保存する'}
            </button>
            <button
              onClick={() => setOpen(false)}
              className="rounded-lg bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-200"
            >
              キャンセル
            </button>
          </div>
        </>
      )}
    </div>
  )
}
