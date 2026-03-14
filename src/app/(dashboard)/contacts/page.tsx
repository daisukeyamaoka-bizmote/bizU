'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { INDUSTRIES, ROLE_LEVELS } from '@/lib/constants'

type ContactRow = {
  id: string
  full_name: string
  department: string | null
  title: string | null
  role_level: string
  company: { name: string } | null
  letter_count: number
  last_sent: string | null
}

export default function ContactsPage() {
  const [contacts, setContacts] = useState<ContactRow[]>([])
  const [industryFilter, setIndustryFilter] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadContacts()
  }, [industryFilter, roleFilter, search])

  async function loadContacts() {
    setLoading(true)
    const supabase = createClient()

    let query = supabase
      .from('contacts')
      .select(`
        id, full_name, department, title, role_level,
        target_companies!inner(name, industry)
      `)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(100)

    if (roleFilter) {
      query = query.eq('role_level', roleFilter)
    }
    if (search) {
      query = query.ilike('full_name', `%${search}%`)
    }

    const { data } = await query

    // Fetch letter counts separately
    const contactIds = data?.map(c => c.id) ?? []
    const { data: letterCounts } = contactIds.length > 0
      ? await supabase
          .from('letters')
          .select('contact_id, sent_at')
          .in('contact_id', contactIds)
      : { data: [] }

    const mapped: ContactRow[] = (data ?? []).map((c) => {
      const company = Array.isArray(c.target_companies)
        ? c.target_companies[0]
        : c.target_companies
      const letters = (letterCounts ?? []).filter(l => l.contact_id === c.id)
      const sortedLetters = letters.sort((a, b) =>
        (b.sent_at ?? '').localeCompare(a.sent_at ?? '')
      )
      return {
        id: c.id,
        full_name: c.full_name,
        department: c.department,
        title: c.title,
        role_level: c.role_level,
        company: company ? { name: company.name } : null,
        letter_count: letters.length,
        last_sent: sortedLetters[0]?.sent_at ?? null,
      }
    })

    setContacts(mapped)
    setLoading(false)
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-neutral-900">コンタクト管理</h1>
        <Link
          href="/contacts/import"
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          + CSVインポート
        </Link>
      </div>

      {/* フィルター */}
      <div className="mt-4 flex flex-wrap gap-3">
        <select
          value={industryFilter}
          onChange={(e) => setIndustryFilter(e.target.value)}
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
        >
          <option value="">業種</option>
          {INDUSTRIES.map((i) => (
            <option key={i} value={i}>{i}</option>
          ))}
        </select>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
        >
          <option value="">役職</option>
          {ROLE_LEVELS.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <input
          type="text"
          placeholder="氏名で検索"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
        />
      </div>

      {/* テーブル */}
      <div className="mt-6 overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="min-w-full divide-y divide-neutral-200">
          <thead className="bg-neutral-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-neutral-500">会社名</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-neutral-500">氏名</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-neutral-500">役職</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-neutral-500">送付数</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-neutral-500">最終送付</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-neutral-500">
                  読み込み中...
                </td>
              </tr>
            ) : contacts.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-neutral-500">
                  コンタクトがありません
                </td>
              </tr>
            ) : (
              contacts.map((contact) => (
                <tr key={contact.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-3 text-sm text-neutral-900">{contact.company?.name ?? '-'}</td>
                  <td className="px-4 py-3 text-sm font-medium text-neutral-900">{contact.full_name || '-'}</td>
                  <td className="px-4 py-3 text-sm text-neutral-600">{contact.title ?? contact.role_level}</td>
                  <td className="px-4 py-3 text-sm text-neutral-600">{contact.letter_count}通</td>
                  <td className="px-4 py-3 text-sm text-neutral-600">{contact.last_sent ?? '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
