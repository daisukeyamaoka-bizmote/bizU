'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { REACTION_TYPES, REACTION_CHANNELS, NEXT_ACTIONS } from '@/lib/constants'

export default function ReactionForm({
  letterId,
  sentAt,
}: {
  letterId: string
  sentAt: string | null
}) {
  const [open, setOpen] = useState(false)
  const [reactionType, setReactionType] = useState<string>(REACTION_TYPES[0])
  const [reactionChannel, setReactionChannel] = useState<string>('')
  const [reactedAt, setReactedAt] = useState(new Date().toISOString().split('T')[0])
  const [memo, setMemo] = useState('')
  const [nextAction, setNextAction] = useState<string>('')
  const [nextActionDate, setNextActionDate] = useState('')
  const [saving, setSaving] = useState(false)
  const router = useRouter()

  const handleSave = async () => {
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
    })

    setSaving(false)
    setOpen(false)
    router.refresh()
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        + 反応を記録する
      </button>
    )
  }

  return (
    <div className="mt-4 space-y-4 rounded-lg border border-gray-200 p-4">
      <div>
        <label className="block text-sm font-medium text-gray-700">反応種別 *</label>
        <div className="mt-2 flex flex-wrap gap-2">
          {REACTION_TYPES.map((type) => (
            <label key={type} className="flex items-center gap-1 text-sm">
              <input
                type="radio"
                name="reactionType"
                checked={reactionType === type}
                onChange={() => setReactionType(type)}
              />
              {type}
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">反応チャネル</label>
        <select
          value={reactionChannel}
          onChange={(e) => setReactionChannel(e.target.value)}
          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
        >
          <option value="">選択してください</option>
          {REACTION_CHANNELS.map((ch) => (
            <option key={ch} value={ch}>{ch}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">反応日 *</label>
        <input
          type="date"
          value={reactedAt}
          onChange={(e) => setReactedAt(e.target.value)}
          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">メモ</label>
        <textarea
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          rows={3}
          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
          placeholder="「興味はあるが今期は予算なし」等"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">次のアクション</label>
          <select
            value={nextAction}
            onChange={(e) => setNextAction(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
          >
            <option value="">選択してください</option>
            {NEXT_ACTIONS.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">次回予定日</label>
          <input
            type="date"
            value={nextActionDate}
            onChange={(e) => setNextActionDate(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
          />
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? '保存中...' : '保存する'}
        </button>
        <button
          onClick={() => setOpen(false)}
          className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
        >
          キャンセル
        </button>
      </div>
    </div>
  )
}
