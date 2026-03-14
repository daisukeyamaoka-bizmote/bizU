'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

type LetterRow = {
  id: string
  contact_name: string
  sent_at: string | null
  why_you_angle: string
  reaction_type: string | null
}

export default function LettersPage() {
  const [letters, setLetters] = useState<LetterRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadLetters()
  }, [])

  async function loadLetters() {
    const supabase = createClient()
    const { data } = await supabase
      .from('letters')
      .select(`
        id, sent_at, why_you_angle,
        contacts(full_name)
      `)
      .order('created_at', { ascending: false })
      .limit(100)

    // Fetch reactions
    const letterIds = data?.map(l => l.id) ?? []
    const { data: reactions } = letterIds.length > 0
      ? await supabase
          .from('reactions')
          .select('letter_id, reaction_type')
          .in('letter_id', letterIds)
      : { data: [] }

    const mapped: LetterRow[] = (data ?? []).map((l) => {
      const contact = Array.isArray(l.contacts) ? l.contacts[0] : l.contacts
      const reaction = (reactions ?? []).find(r => r.letter_id === l.id)
      return {
        id: l.id,
        contact_name: contact?.full_name ?? '-',
        sent_at: l.sent_at,
        why_you_angle: l.why_you_angle,
        reaction_type: reaction?.reaction_type ?? null,
      }
    })

    setLetters(mapped)
    setLoading(false)
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">手紙一覧</h1>
        <Link
          href="/letters/new"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + 新規生成
        </Link>
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">宛先</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">送付日</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">切り口</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">反応</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500">
                  読み込み中...
                </td>
              </tr>
            ) : letters.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500">
                  手紙がありません
                </td>
              </tr>
            ) : (
              letters.map((letter) => (
                <tr key={letter.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{letter.contact_name}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{letter.sent_at ?? '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{letter.why_you_angle}</td>
                  <td className="px-4 py-3 text-sm">
                    {letter.reaction_type ? (
                      <span className="rounded-full bg-green-100 px-2 py-1 text-xs text-green-700">
                        {letter.reaction_type}
                      </span>
                    ) : (
                      <span className="text-gray-400">未記録</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <Link href={`/letters/${letter.id}`} className="text-blue-600 hover:underline">
                      詳細
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
