'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { INDUSTRIES, CHALLENGE_TAG_PRESETS } from '@/lib/constants'

type CaseStudyRow = {
  id: string
  company_name: string
  industry: string
  challenge_tags: string[]
  result_summary: string
  client_name: string
  availability: string
}

export default function CasesPage() {
  const [cases, setCases] = useState<CaseStudyRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [clients, setClients] = useState<{ id: string; name: string }[]>([])

  // Form state
  const [formClientId, setFormClientId] = useState('')
  const [formCompanyName, setFormCompanyName] = useState('')
  const [formIndustry, setFormIndustry] = useState<string>(INDUSTRIES[0])
  const [formChallengeTags, setFormChallengeTags] = useState<string[]>([])
  const [formResultSummary, setFormResultSummary] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadCases()
    loadClients()
  }, [])

  async function loadClients() {
    const supabase = createClient()
    const { data } = await supabase.from('clients').select('id, name').eq('status', 'active') as { data: { id: string; name: string }[] | null }
    setClients(data ?? [])
    if (data?.[0]) setFormClientId(data[0].id)
  }

  async function loadCases() {
    const supabase = createClient()
    const { data } = await supabase
      .from('case_studies')
      .select('id, company_name, industry, challenge_tags, result_summary, availability, client_id')
      .order('created_at', { ascending: false })

    // Fetch client names
    const clientIds = [...new Set((data ?? []).map(cs => cs.client_id).filter(Boolean))]
    const { data: clientsData } = clientIds.length > 0
      ? await supabase.from('clients').select('id, name').in('id', clientIds as string[])
      : { data: [] }
    const clientMap = new Map((clientsData ?? []).map(c => [c.id, c.name]))

    const mapped: CaseStudyRow[] = (data ?? []).map((cs) => ({
      id: cs.id,
      company_name: cs.company_name,
      industry: cs.industry,
      challenge_tags: cs.challenge_tags,
      result_summary: cs.result_summary,
      client_name: clientMap.get(cs.client_id ?? '') ?? '-',
      availability: cs.availability,
    }))
    setCases(mapped)
    setLoading(false)
  }

  async function handleSave() {
    setSaving(true)
    const supabase = createClient()
    await supabase.from('case_studies').insert({
      client_id: formClientId,
      company_name: formCompanyName,
      industry: formIndustry,
      challenge_tags: formChallengeTags,
      result_summary: formResultSummary,
    })
    setShowForm(false)
    setFormCompanyName('')
    setFormChallengeTags([])
    setFormResultSummary('')
    setSaving(false)
    loadCases()
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">ケーススタディ管理</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + 新規追加
        </button>
      </div>

      {showForm && (
        <div className="mt-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">ケーススタディを追加</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700">クライアント</label>
              <select
                value={formClientId}
                onChange={(e) => setFormClientId(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">事例企業名</label>
              <input
                value={formCompanyName}
                onChange={(e) => setFormCompanyName(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">業種</label>
              <select
                value={formIndustry}
                onChange={(e) => setFormIndustry(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
              >
                {INDUSTRIES.map((i) => (
                  <option key={i} value={i}>{i}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">解決課題タグ（クリックで選択）</label>
              <div className="mt-2 flex flex-wrap gap-2">
                {CHALLENGE_TAG_PRESETS.map((tag) => {
                  const selected = formChallengeTags.includes(tag)
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() =>
                        setFormChallengeTags(prev =>
                          selected ? prev.filter(t => t !== tag) : [...prev, tag]
                        )
                      }
                      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                        selected
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {tag}
                    </button>
                  )
                })}
              </div>
              {formChallengeTags.length > 0 && (
                <p className="mt-2 text-xs text-gray-500">
                  選択中: {formChallengeTags.join(', ')}
                </p>
              )}
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700">効果指標</label>
              <input
                value={formResultSummary}
                onChange={(e) => setFormResultSummary(e.target.value)}
                placeholder="面接工数60%削減"
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
              />
            </div>
          </div>
          <div className="mt-4 flex gap-3">
            <button
              onClick={handleSave}
              disabled={saving || !formCompanyName}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? '保存中...' : '保存する'}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      <div className="mt-6 overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">クライアント</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">事例企業</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">業種</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">課題タグ</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">効果</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500">読み込み中...</td>
              </tr>
            ) : cases.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500">ケーススタディがありません</td>
              </tr>
            ) : (
              cases.map((cs) => (
                <tr key={cs.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-900">{cs.client_name}</td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{cs.company_name}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{cs.industry}</td>
                  <td className="px-4 py-3 text-sm">
                    <div className="flex flex-wrap gap-1">
                      {cs.challenge_tags.map((tag) => (
                        <span key={tag} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{cs.result_summary}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
