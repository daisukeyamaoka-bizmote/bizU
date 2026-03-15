'use client'

import { useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Company = {
  id: string
  name: string
  industry: string
  employee_scale: string | null
  revenue_scale: string | null
  website: string | null
  phone: string | null
  founded_date: string | null
  fiscal_month: string | null
  representative_email: string | null
  prefecture: string | null
  recent_topics: string | null
}

type Lead = {
  id: string
  full_name: string
  department: string | null
  title: string | null
  role_level: string
  address: string | null
  created_at: string
  letter_count: number
  last_sent: string | null
}

export default function CompanyDetailPage() {
  const params = useParams()
  const companyId = params.companyId as string

  const [company, setCompany] = useState<Company | null>(null)
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()

    const { data: companyData } = await supabase
      .from('target_companies')
      .select('*')
      .eq('id', companyId)
      .single()

    setCompany(companyData)

    const { data: contactData } = await supabase
      .from('contacts')
      .select('id, full_name, department, title, role_level, address, created_at')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })

    const contactIds = contactData?.map(c => c.id) ?? []
    const { data: letterData } = contactIds.length > 0
      ? await supabase
          .from('letters')
          .select('contact_id, sent_at')
          .in('contact_id', contactIds)
      : { data: [] }

    const mapped: Lead[] = (contactData ?? []).map(c => {
      const letters = (letterData ?? []).filter(l => l.contact_id === c.id)
      const sorted = letters.sort((a, b) => (b.sent_at ?? '').localeCompare(a.sent_at ?? ''))
      return {
        id: c.id,
        full_name: c.full_name ?? '',
        department: c.department,
        title: c.title,
        role_level: c.role_level,
        address: c.address ?? null,
        created_at: c.created_at,
        letter_count: letters.length,
        last_sent: sorted[0]?.sent_at ?? null,
      }
    })

    setLeads(mapped)
    setLoading(false)
  }, [companyId])

  useEffect(() => {
    loadData()
  }, [loadData])

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === leads.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(leads.map(l => l.id)))
    }
  }

  async function deleteSelected() {
    if (selectedIds.size === 0) return
    setDeleting(true)
    const supabase = createClient()
    const ids = Array.from(selectedIds)

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
    loadData()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-neutral-500">読み込み中...</p>
      </div>
    )
  }

  if (!company) {
    return (
      <div className="py-20 text-center">
        <p className="text-sm text-neutral-500">取引先が見つかりません</p>
        <Link href="/contacts" className="mt-4 inline-block text-sm text-blue-600 hover:underline">
          取引先一覧に戻る
        </Link>
      </div>
    )
  }

  const infoItems = [
    { label: '業種', value: company.industry },
    { label: '社員数', value: company.employee_scale },
    { label: '売上規模', value: company.revenue_scale },
    { label: '所在地', value: company.prefecture },
    { label: '設立', value: company.founded_date },
    { label: '決算月', value: company.fiscal_month },
    { label: '代表電話', value: company.phone },
    { label: '代表メール', value: company.representative_email },
  ]

  return (
    <div>
      {/* パンくず */}
      <div className="mb-4 flex items-center gap-2 text-sm text-neutral-500">
        <Link href="/contacts" className="hover:text-neutral-700 hover:underline">取引先管理</Link>
        <span>/</span>
        <span className="text-neutral-900 font-medium">{company.name}</span>
      </div>

      {/* 会社情報ヘッダー */}
      <div className="rounded-lg border border-neutral-200 bg-white p-5">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-neutral-900">{company.name}</h1>
            {company.website && (
              <a
                href={company.website}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-block text-sm text-blue-600 hover:underline"
              >
                {company.website}
              </a>
            )}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-2 sm:grid-cols-4">
          {infoItems.map(item => (
            <div key={item.label}>
              <dt className="text-xs text-neutral-500">{item.label}</dt>
              <dd className="text-sm text-neutral-900">{item.value || '-'}</dd>
            </div>
          ))}
        </div>

        {company.recent_topics && (
          <div className="mt-4 rounded-md bg-neutral-50 p-3">
            <p className="text-xs font-medium text-neutral-500 mb-1">最近のトピック</p>
            <p className="text-sm text-neutral-700 whitespace-pre-wrap">{company.recent_topics}</p>
          </div>
        )}
      </div>

      {/* リード一覧 */}
      <div className="mt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900">リード ({leads.length}名)</h2>
        </div>

        {/* 選択操作バー */}
        {selectedIds.size > 0 && (
          <div className="mt-3 flex items-center gap-4 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-2">
            <span className="text-sm font-medium text-neutral-700">
              {selectedIds.size}名を選択中
            </span>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              disabled={deleting}
              className="rounded-lg bg-red-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              選択したリードを削除
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
        {showDeleteConfirm && typeof document !== 'undefined' && createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
              <h3 className="text-lg font-semibold text-neutral-900">リードを削除しますか？</h3>
              <p className="mt-2 text-sm text-neutral-600">
                {selectedIds.size}名のリードを非アクティブにします。
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
          </div>,
          document.body
        )}

        <div className="mt-3 overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <table className="min-w-full divide-y divide-neutral-200">
            <thead className="bg-neutral-50">
              <tr>
                <th className="px-3 py-3">
                  <input
                    type="checkbox"
                    checked={leads.length > 0 && selectedIds.size === leads.length}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded border-neutral-300"
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-neutral-500">氏名</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-neutral-500">部署</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-neutral-500">役職</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-neutral-500">住所</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-neutral-500">送付数</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-neutral-500">最終送付</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-neutral-500">登録日</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {leads.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-neutral-500">
                    リードがありません
                  </td>
                </tr>
              ) : (
                leads.map((lead) => (
                  <tr
                    key={lead.id}
                    className={`hover:bg-neutral-50 ${selectedIds.has(lead.id) ? 'bg-neutral-50' : ''}`}
                  >
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(lead.id)}
                        onChange={() => toggleSelect(lead.id)}
                        className="h-4 w-4 rounded border-neutral-300"
                      />
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-neutral-900">{lead.full_name || '-'}</td>
                    <td className="px-4 py-3 text-sm text-neutral-600">{lead.department ?? '-'}</td>
                    <td className="px-4 py-3 text-sm text-neutral-600">{lead.title ?? lead.role_level}</td>
                    <td className="px-4 py-3 text-sm text-neutral-600 max-w-[200px] truncate">{lead.address ?? '-'}</td>
                    <td className="px-4 py-3 text-sm text-neutral-600">{lead.letter_count}通</td>
                    <td className="px-4 py-3 text-sm text-neutral-600">{lead.last_sent ?? '-'}</td>
                    <td className="px-4 py-3 text-sm text-neutral-600">
                      {new Date(lead.created_at).toLocaleDateString('ja-JP')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
