'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

type ReactionRow = {
  id: string
  letter_id: string
  reaction_type: string
  reacted_at: string
  days_to_react: number | null
  memo: string | null
  next_action: string | null
  next_action_date: string | null
  contact_name: string
}

export default function ReactionsPage() {
  const [reactions, setReactions] = useState<ReactionRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadReactions()
  }, [])

  async function loadReactions() {
    const supabase = createClient()
    const { data } = await supabase
      .from('reactions')
      .select(`
        id, letter_id, reaction_type, reacted_at, days_to_react, memo, next_action, next_action_date,
        letters(contacts(full_name))
      `)
      .order('reacted_at', { ascending: false })
      .limit(100)

    const mapped: ReactionRow[] = (data ?? []).map((r) => {
      const letters = Array.isArray(r.letters) ? r.letters[0] : r.letters
      const contact = letters && 'contacts' in letters
        ? (Array.isArray(letters.contacts) ? letters.contacts[0] : letters.contacts)
        : null
      return {
        id: r.id,
        letter_id: r.letter_id ?? '',
        reaction_type: r.reaction_type,
        reacted_at: r.reacted_at,
        days_to_react: r.days_to_react,
        memo: r.memo,
        next_action: r.next_action,
        next_action_date: r.next_action_date,
        contact_name: contact?.full_name ?? '-',
      }
    })

    setReactions(mapped)
    setLoading(false)
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">反応記録</h1>

      <div className="mt-6 overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">宛先</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">反応種別</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">反応日</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">日数</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">次のアクション</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">メモ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">
                  読み込み中...
                </td>
              </tr>
            ) : reactions.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">
                  反応記録がありません
                </td>
              </tr>
            ) : (
              reactions.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm">
                    <Link href={`/letters/${r.letter_id}`} className="font-medium text-blue-600 hover:underline">
                      {r.contact_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700">
                      {r.reaction_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{r.reacted_at}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {r.days_to_react !== null ? `${r.days_to_react}日` : '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {r.next_action ?? '-'}
                    {r.next_action_date ? ` (${r.next_action_date})` : ''}
                  </td>
                  <td className="max-w-xs truncate px-4 py-3 text-sm text-gray-600">{r.memo ?? '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
