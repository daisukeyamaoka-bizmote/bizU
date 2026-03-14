'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { INDUSTRIES, ROLE_LEVELS, EMPLOYEE_SCALES, REVENUE_SCALES } from '@/lib/constants'

type ContactRow = {
  id: string
  full_name: string
  department: string | null
  title: string | null
  role_level: string
  company: {
    name: string
    employee_scale: string | null
    revenue_scale: string | null
    website: string | null
    phone: string | null
    founded_date: string | null
    fiscal_month: string | null
    representative_email: string | null
  } | null
  company_id: string | null
  letter_count: number
  last_sent: string | null
  created_at: string
}

type SortKey = 'company_name' | 'full_name' | 'employee_scale' | 'revenue_scale' | 'letter_count' | 'last_sent' | 'created_at'
type SortDir = 'asc' | 'desc'

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'company_name', label: '会社名' },
  { value: 'full_name', label: '氏名' },
  { value: 'employee_scale', label: '社員数' },
  { value: 'revenue_scale', label: '売上' },
  { value: 'letter_count', label: '送付数' },
  { value: 'last_sent', label: '最終送付' },
  { value: 'created_at', label: '登録日' },
]

const EMPLOYEE_ORDER: Record<string, number> = {}
EMPLOYEE_SCALES.forEach((s, i) => { EMPLOYEE_ORDER[s] = i })

const REVENUE_ORDER: Record<string, number> = {}
REVENUE_SCALES.forEach((s, i) => { REVENUE_ORDER[s] = i })

function sortContacts(contacts: ContactRow[], key: SortKey, dir: SortDir): ContactRow[] {
  const sorted = [...contacts].sort((a, b) => {
    let cmp = 0
    switch (key) {
      case 'company_name':
        cmp = (a.company?.name ?? '').localeCompare(b.company?.name ?? '', 'ja')
        break
      case 'full_name':
        cmp = (a.full_name ?? '').localeCompare(b.full_name ?? '', 'ja')
        break
      case 'employee_scale': {
        const aOrd = EMPLOYEE_ORDER[a.company?.employee_scale ?? ''] ?? 999
        const bOrd = EMPLOYEE_ORDER[b.company?.employee_scale ?? ''] ?? 999
        cmp = aOrd - bOrd
        break
      }
      case 'revenue_scale': {
        const aOrd = REVENUE_ORDER[a.company?.revenue_scale ?? ''] ?? 999
        const bOrd = REVENUE_ORDER[b.company?.revenue_scale ?? ''] ?? 999
        cmp = aOrd - bOrd
        break
      }
      case 'letter_count':
        cmp = a.letter_count - b.letter_count
        break
      case 'last_sent':
        cmp = (a.last_sent ?? '').localeCompare(b.last_sent ?? '')
        break
      case 'created_at':
        cmp = a.created_at.localeCompare(b.created_at)
        break
    }
    return dir === 'asc' ? cmp : -cmp
  })
  return sorted
}

export default function ContactsPage() {
  const [contacts, setContacts] = useState<ContactRow[]>([])
  const [industryFilter, setIndustryFilter] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  // Sort state
  const [sortKey, setSortKey] = useState<SortKey>('created_at')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  useEffect(() => {
    loadContacts()
  }, [industryFilter, roleFilter, search])

  async function loadContacts() {
    setLoading(true)
    setSelectedIds(new Set())
    const supabase = createClient()

    let query = supabase
      .from('contacts')
      .select(`
        id, full_name, department, title, role_level, company_id, created_at,
        target_companies!inner(name, industry, employee_scale, revenue_scale, website, phone, founded_date, fiscal_month, representative_email)
      `)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(200)

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
        company: company ? {
          name: company.name,
          employee_scale: company.employee_scale ?? null,
          revenue_scale: company.revenue_scale ?? null,
          website: company.website ?? null,
          phone: company.phone ?? null,
          founded_date: company.founded_date ?? null,
          fiscal_month: company.fiscal_month ?? null,
          representative_email: company.representative_email ?? null,
        } : null,
        company_id: c.company_id,
        letter_count: letters.length,
        last_sent: sortedLetters[0]?.sent_at ?? null,
        created_at: c.created_at,
      }
    })

    setContacts(mapped)
    setLoading(false)
  }

  // Selection handlers
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === sortedContacts.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(sortedContacts.map(c => c.id)))
    }
  }

  // Delete selected
  async function deleteSelected() {
    if (selectedIds.size === 0) return
    setDeleting(true)
    const supabase = createClient()

    const ids = Array.from(selectedIds)
    // Soft delete: set is_active = false
    const { error } = await supabase
      .from('contacts')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .in('id', ids)

    if (error) {
      alert(`削除エラー: ${error.message}`)
    }

    setDeleting(false)
    setShowDeleteConfirm(false)
    setSelectedIds(new Set())
    loadContacts()
  }

  // Sort handler
  function handleSortChange(key: SortKey) {
    if (key === sortKey) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sortedContacts = sortContacts(contacts, sortKey, sortDir)

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

      {/* フィルター & ソート */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
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

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-neutral-500">ソート:</span>
          <select
            value={sortKey}
            onChange={(e) => handleSortChange(e.target.value as SortKey)}
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <button
            onClick={() => setSortDir(prev => prev === 'asc' ? 'desc' : 'asc')}
            className="rounded-lg border border-neutral-300 px-2 py-2 text-sm text-neutral-600 hover:bg-neutral-50"
            title={sortDir === 'asc' ? '昇順' : '降順'}
          >
            {sortDir === 'asc' ? '↑' : '↓'}
          </button>
        </div>
      </div>

      {/* 選択操作バー */}
      {selectedIds.size > 0 && (
        <div className="mt-3 flex items-center gap-4 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-2">
          <span className="text-sm font-medium text-neutral-700">
            {selectedIds.size}件を選択中
          </span>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            disabled={deleting}
            className="rounded-lg bg-red-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            選択したコンタクトを削除
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-sm text-neutral-500 hover:underline"
          >
            選択解除
          </button>
        </div>
      )}

      {/* 削除確認モーダル */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-neutral-900">コンタクトを削除しますか？</h3>
            <p className="mt-2 text-sm text-neutral-600">
              {selectedIds.size}件のコンタクトを非アクティブにします。この操作は管理者が復元できます。
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
              >
                キャンセル
              </button>
              <button
                onClick={deleteSelected}
                disabled={deleting}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? '削除中...' : '削除する'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* テーブル */}
      <div className="mt-4 overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="min-w-full divide-y divide-neutral-200">
          <thead className="bg-neutral-50">
            <tr>
              <th className="px-3 py-3">
                <input
                  type="checkbox"
                  checked={sortedContacts.length > 0 && selectedIds.size === sortedContacts.length}
                  onChange={toggleSelectAll}
                  className="h-4 w-4 rounded border-neutral-300"
                />
              </th>
              {[
                { key: 'company_name' as SortKey, label: '会社名' },
                { key: 'full_name' as SortKey, label: '氏名' },
              ].map(col => (
                <th
                  key={col.key}
                  onClick={() => handleSortChange(col.key)}
                  className="cursor-pointer px-4 py-3 text-left text-xs font-medium uppercase text-neutral-500 hover:text-neutral-700"
                >
                  {col.label} {sortKey === col.key && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
              ))}
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-neutral-500">役職</th>
              <th
                onClick={() => handleSortChange('employee_scale')}
                className="cursor-pointer px-4 py-3 text-left text-xs font-medium uppercase text-neutral-500 hover:text-neutral-700"
              >
                社員数 {sortKey === 'employee_scale' && (sortDir === 'asc' ? '↑' : '↓')}
              </th>
              <th
                onClick={() => handleSortChange('revenue_scale')}
                className="cursor-pointer px-4 py-3 text-left text-xs font-medium uppercase text-neutral-500 hover:text-neutral-700"
              >
                売上 {sortKey === 'revenue_scale' && (sortDir === 'asc' ? '↑' : '↓')}
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-neutral-500">会社HP</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-neutral-500">代表電話</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-neutral-500">設立</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-neutral-500">決算月</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-neutral-500">代表メール</th>
              <th
                onClick={() => handleSortChange('letter_count')}
                className="cursor-pointer px-4 py-3 text-left text-xs font-medium uppercase text-neutral-500 hover:text-neutral-700"
              >
                送付数 {sortKey === 'letter_count' && (sortDir === 'asc' ? '↑' : '↓')}
              </th>
              <th
                onClick={() => handleSortChange('last_sent')}
                className="cursor-pointer px-4 py-3 text-left text-xs font-medium uppercase text-neutral-500 hover:text-neutral-700"
              >
                最終送付 {sortKey === 'last_sent' && (sortDir === 'asc' ? '↑' : '↓')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {loading ? (
              <tr>
                <td colSpan={13} className="px-4 py-8 text-center text-sm text-neutral-500">
                  読み込み中...
                </td>
              </tr>
            ) : sortedContacts.length === 0 ? (
              <tr>
                <td colSpan={13} className="px-4 py-8 text-center text-sm text-neutral-500">
                  コンタクトがありません
                </td>
              </tr>
            ) : (
              sortedContacts.map((contact) => (
                <tr
                  key={contact.id}
                  className={`hover:bg-neutral-50 ${selectedIds.has(contact.id) ? 'bg-neutral-50' : ''}`}
                >
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(contact.id)}
                      onChange={() => toggleSelect(contact.id)}
                      className="h-4 w-4 rounded border-neutral-300"
                    />
                  </td>
                  <td className="px-4 py-3 text-sm text-neutral-900">{contact.company?.name ?? '-'}</td>
                  <td className="px-4 py-3 text-sm font-medium text-neutral-900">{contact.full_name || '-'}</td>
                  <td className="px-4 py-3 text-sm text-neutral-600">{contact.title ?? contact.role_level}</td>
                  <td className="px-4 py-3 text-sm text-neutral-600">{contact.company?.employee_scale ?? '-'}</td>
                  <td className="px-4 py-3 text-sm text-neutral-600">{contact.company?.revenue_scale ?? '-'}</td>
                  <td className="px-4 py-3 text-sm text-neutral-600">
                    {contact.company?.website ? (
                      <a href={contact.company.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline truncate block max-w-[120px]" title={contact.company.website}>
                        {contact.company.website.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]}
                      </a>
                    ) : '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-neutral-600">{contact.company?.phone ?? '-'}</td>
                  <td className="px-4 py-3 text-sm text-neutral-600">{contact.company?.founded_date ?? '-'}</td>
                  <td className="px-4 py-3 text-sm text-neutral-600">{contact.company?.fiscal_month ?? '-'}</td>
                  <td className="px-4 py-3 text-sm text-neutral-600">{contact.company?.representative_email ?? '-'}</td>
                  <td className="px-4 py-3 text-sm text-neutral-600">{contact.letter_count}通</td>
                  <td className="px-4 py-3 text-sm text-neutral-600">{contact.last_sent ?? '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-neutral-400">{sortedContacts.length}件表示</p>
    </div>
  )
}
