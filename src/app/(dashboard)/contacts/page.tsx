'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { INDUSTRIES, EMPLOYEE_SCALES, REVENUE_SCALES } from '@/lib/constants'

type CompanyRow = {
  id: string
  name: string
  industry: string
  employee_scale: string | null
  revenue_scale: string | null
  website: string | null
  phone: string | null
  prefecture: string | null
  lead_count: number
  letter_count: number
  created_at: string
}

type SortKey = 'name' | 'industry' | 'employee_scale' | 'revenue_scale' | 'lead_count' | 'letter_count' | 'created_at'
type SortDir = 'asc' | 'desc'

const PAGE_SIZE = 300

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'name', label: '会社名' },
  { value: 'industry', label: '業種' },
  { value: 'employee_scale', label: '社員数' },
  { value: 'revenue_scale', label: '売上' },
  { value: 'lead_count', label: 'リード数' },
  { value: 'letter_count', label: '送付数' },
  { value: 'created_at', label: '登録日' },
]

const EMPLOYEE_ORDER: Record<string, number> = {}
EMPLOYEE_SCALES.forEach((s, i) => { EMPLOYEE_ORDER[s] = i })

const REVENUE_ORDER: Record<string, number> = {}
REVENUE_SCALES.forEach((s, i) => { REVENUE_ORDER[s] = i })

function sortCompanies(companies: CompanyRow[], key: SortKey, dir: SortDir): CompanyRow[] {
  const sorted = [...companies].sort((a, b) => {
    let cmp = 0
    switch (key) {
      case 'name':
        cmp = a.name.localeCompare(b.name, 'ja')
        break
      case 'industry':
        cmp = (a.industry ?? '').localeCompare(b.industry ?? '', 'ja')
        break
      case 'employee_scale': {
        const aOrd = EMPLOYEE_ORDER[a.employee_scale ?? ''] ?? 999
        const bOrd = EMPLOYEE_ORDER[b.employee_scale ?? ''] ?? 999
        cmp = aOrd - bOrd
        break
      }
      case 'revenue_scale': {
        const aOrd = REVENUE_ORDER[a.revenue_scale ?? ''] ?? 999
        const bOrd = REVENUE_ORDER[b.revenue_scale ?? ''] ?? 999
        cmp = aOrd - bOrd
        break
      }
      case 'lead_count':
        cmp = a.lead_count - b.lead_count
        break
      case 'letter_count':
        cmp = a.letter_count - b.letter_count
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
  const [companies, setCompanies] = useState<CompanyRow[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [industryFilter, setIndustryFilter] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  const [sortKey, setSortKey] = useState<SortKey>('created_at')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)
  const [deleteProgress, setDeleteProgress] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  useEffect(() => {
    setCurrentPage(1)
  }, [industryFilter, search])

  useEffect(() => {
    loadCompanies()
  }, [industryFilter, search, currentPage])

  async function loadCompanies() {
    setLoading(true)
    setSelectedIds(new Set())
    const supabase = createClient()

    // Total count
    let countQuery = supabase
      .from('target_companies')
      .select('*', { count: 'exact', head: true })
    if (industryFilter) countQuery = countQuery.eq('industry', industryFilter)
    if (search) countQuery = countQuery.ilike('name', `%${search}%`)
    const { count } = await countQuery
    setTotalCount(count ?? 0)

    // Paginated data
    const from = (currentPage - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    let query = supabase
      .from('target_companies')
      .select(`
        id, name, industry, employee_scale, revenue_scale, website, phone,
        prefecture, created_at
      `)
      .order('created_at', { ascending: false })
      .range(from, to)

    if (industryFilter) query = query.eq('industry', industryFilter)
    if (search) query = query.ilike('name', `%${search}%`)

    const { data: companyData } = await query
    const companyIds = companyData?.map(c => c.id) ?? []

    const { data: contactData } = companyIds.length > 0
      ? await supabase
          .from('contacts')
          .select('id, company_id')
          .eq('is_active', true)
          .in('company_id', companyIds)
      : { data: [] }

    const contactIds = contactData?.map(c => c.id) ?? []
    const { data: letterData } = contactIds.length > 0
      ? await supabase
          .from('letters')
          .select('contact_id')
          .in('contact_id', contactIds)
      : { data: [] }

    const leadCountMap: Record<string, number> = {}
    const contactToCompany: Record<string, string> = {}
    for (const c of contactData ?? []) {
      if (c.company_id) {
        leadCountMap[c.company_id] = (leadCountMap[c.company_id] ?? 0) + 1
        contactToCompany[c.id] = c.company_id
      }
    }

    const letterCountMap: Record<string, number> = {}
    for (const l of letterData ?? []) {
      const compId = contactToCompany[l.contact_id]
      if (compId) {
        letterCountMap[compId] = (letterCountMap[compId] ?? 0) + 1
      }
    }

    const mapped: CompanyRow[] = (companyData ?? []).map(c => ({
      id: c.id,
      name: c.name,
      industry: c.industry,
      employee_scale: c.employee_scale,
      revenue_scale: c.revenue_scale,
      website: c.website,
      phone: c.phone,
      prefecture: c.prefecture,
      lead_count: leadCountMap[c.id] ?? 0,
      letter_count: letterCountMap[c.id] ?? 0,
      created_at: c.created_at,
    }))

    setCompanies(mapped)
    setLoading(false)
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === sorted.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(sorted.map(c => c.id)))
    }
  }

  async function deleteSelected() {
    if (selectedIds.size === 0) return
    setDeleting(true)
    setDeleteProgress('関連データを確認中...')
    const supabase = createClient()
    const ids = Array.from(selectedIds)

    try {
      // 1. Get all contacts under these companies
      setDeleteProgress('リードを取得中...')
      const { data: contacts } = await supabase
        .from('contacts')
        .select('id')
        .in('company_id', ids)

      const contactIds = (contacts ?? []).map(c => c.id)

      if (contactIds.length > 0) {
        // 2. Delete reactions for letters of these contacts
        setDeleteProgress('反応記録を削除中...')
        const { data: letters } = await supabase
          .from('letters')
          .select('id')
          .in('contact_id', contactIds)
        const letterIds = (letters ?? []).map(l => l.id)

        if (letterIds.length > 0) {
          await supabase.from('reactions').delete().in('letter_id', letterIds)
        }

        // 3. Delete letters
        setDeleteProgress('手紙データを削除中...')
        await supabase.from('letters').delete().in('contact_id', contactIds)

        // 4. Delete project_contacts references
        setDeleteProgress('プロジェクト紐付けを削除中...')
        await supabase.from('project_contacts').delete().in('contact_id', contactIds)
      }

      // 5. Delete contacts
      setDeleteProgress('リードを削除中...')
      await supabase.from('contacts').delete().in('company_id', ids)

      // 6. Delete companies
      setDeleteProgress('取引先を削除中...')
      const { error } = await supabase
        .from('target_companies')
        .delete()
        .in('id', ids)

      if (error) {
        alert(`削除エラー: ${error.message}`)
      }
    } catch (err) {
      alert(`削除エラー: ${err instanceof Error ? err.message : String(err)}`)
    }

    setDeleting(false)
    setDeleteProgress('')
    setShowDeleteConfirm(false)
    setSelectedIds(new Set())
    loadCompanies()
  }

  function handleSortChange(key: SortKey) {
    if (key === sortKey) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sorted = sortCompanies(companies, sortKey, sortDir)
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-neutral-900">取引先管理</h1>
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
        <input
          type="text"
          placeholder="会社名で検索"
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
      {selectedIds.size > 0 && !deleting && (
        <div className="mt-3 flex items-center gap-4 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-2">
          <span className="text-sm font-medium text-neutral-700">
            {selectedIds.size}社を選択中
          </span>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="rounded-lg bg-red-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-700"
          >
            選択した取引先を削除
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-sm text-neutral-500 hover:underline"
          >
            選択解除
          </button>
        </div>
      )}

      {/* 削除中プログレス */}
      {deleting && (
        <div className="mt-3 flex items-center gap-3 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3">
          <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
          <span className="text-sm font-medium text-neutral-700">{deleteProgress}</span>
        </div>
      )}

      {/* 削除確認モーダル */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-neutral-900">取引先を削除しますか？</h3>
            <p className="mt-2 text-sm text-neutral-600">
              {selectedIds.size}社の取引先と配下のリード・手紙・反応記録を完全に削除します。この操作は取り消せません。
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
                  checked={sorted.length > 0 && selectedIds.size === sorted.length}
                  onChange={toggleSelectAll}
                  className="h-4 w-4 rounded border-neutral-300"
                />
              </th>
              {[
                { key: 'name' as SortKey, label: '会社名' },
                { key: 'industry' as SortKey, label: '業種' },
                { key: 'employee_scale' as SortKey, label: '社員数' },
                { key: 'revenue_scale' as SortKey, label: '売上' },
              ].map(col => (
                <th
                  key={col.key}
                  onClick={() => handleSortChange(col.key)}
                  className="cursor-pointer px-4 py-3 text-left text-xs font-medium uppercase text-neutral-500 hover:text-neutral-700"
                >
                  {col.label} {sortKey === col.key && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
              ))}
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-neutral-500">所在地</th>
              <th
                onClick={() => handleSortChange('lead_count')}
                className="cursor-pointer px-4 py-3 text-left text-xs font-medium uppercase text-neutral-500 hover:text-neutral-700"
              >
                リード数 {sortKey === 'lead_count' && (sortDir === 'asc' ? '↑' : '↓')}
              </th>
              <th
                onClick={() => handleSortChange('letter_count')}
                className="cursor-pointer px-4 py-3 text-left text-xs font-medium uppercase text-neutral-500 hover:text-neutral-700"
              >
                送付数 {sortKey === 'letter_count' && (sortDir === 'asc' ? '↑' : '↓')}
              </th>
              <th
                onClick={() => handleSortChange('created_at')}
                className="cursor-pointer px-4 py-3 text-left text-xs font-medium uppercase text-neutral-500 hover:text-neutral-700"
              >
                登録日 {sortKey === 'created_at' && (sortDir === 'asc' ? '↑' : '↓')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {loading ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-neutral-400" />
                    <span className="text-sm text-neutral-500">読み込み中...</span>
                  </div>
                </td>
              </tr>
            ) : sorted.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-sm text-neutral-500">
                  取引先がありません
                </td>
              </tr>
            ) : (
              sorted.map((company) => (
                <tr
                  key={company.id}
                  className={`hover:bg-neutral-50 ${selectedIds.has(company.id) ? 'bg-neutral-50' : ''}`}
                >
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(company.id)}
                      onChange={() => toggleSelect(company.id)}
                      className="h-4 w-4 rounded border-neutral-300"
                    />
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-neutral-900">
                    <Link href={`/contacts/${company.id}`} className="text-blue-700 hover:underline">
                      {company.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-neutral-600">{company.industry || '-'}</td>
                  <td className="px-4 py-3 text-sm text-neutral-600">{company.employee_scale ?? '-'}</td>
                  <td className="px-4 py-3 text-sm text-neutral-600">{company.revenue_scale ?? '-'}</td>
                  <td className="px-4 py-3 text-sm text-neutral-600">{company.prefecture ?? '-'}</td>
                  <td className="px-4 py-3 text-sm text-neutral-600">{company.lead_count}名</td>
                  <td className="px-4 py-3 text-sm text-neutral-600">{company.letter_count}通</td>
                  <td className="px-4 py-3 text-sm text-neutral-600">
                    {company.created_at ? new Date(company.created_at).toLocaleDateString('ja-JP') : '-'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ページネーション */}
      <div className="mt-3 flex items-center justify-between">
        <p className="text-xs text-neutral-400">
          全{totalCount}社中 {(currentPage - 1) * PAGE_SIZE + 1}〜{Math.min(currentPage * PAGE_SIZE, totalCount)}社を表示
        </p>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-50 disabled:opacity-30"
            >
              前へ
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                  page === currentPage
                    ? 'bg-neutral-900 text-white'
                    : 'border border-neutral-300 text-neutral-600 hover:bg-neutral-50'
                }`}
              >
                {page}
              </button>
            ))}
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-50 disabled:opacity-30"
            >
              次へ
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
