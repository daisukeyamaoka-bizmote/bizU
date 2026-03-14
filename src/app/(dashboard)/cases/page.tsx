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

type ExtractedCaseStudy = {
  company_name: string
  industry: string
  challenge_tags: string[]
  result_summary: string
  recommended_roles?: string[]
  recommended_industries?: string[]
}

type SourceItem = {
  id: string
  type: 'url' | 'file'
  name: string
  status: 'pending' | 'extracting' | 'done' | 'error'
  url?: string
  file?: File
  results: ExtractedCaseStudy[]
  error?: string
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

  // Multi-source extraction
  const [showExtract, setShowExtract] = useState(false)
  const [sources, setSources] = useState<SourceItem[]>([])
  const [urlInput, setUrlInput] = useState('')
  const [extracting, setExtracting] = useState(false)
  const [allResults, setAllResults] = useState<ExtractedCaseStudy[]>([])

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

  // --- Multi-source extraction ---

  function addUrl() {
    const trimmed = urlInput.trim()
    if (!trimmed) return
    // 複数URLを改行・カンマ・スペースで分割
    const urls = trimmed.split(/[\n,\s]+/).filter(u => u.startsWith('http'))
    const newSources: SourceItem[] = urls.map(url => ({
      id: crypto.randomUUID(),
      type: 'url',
      name: url,
      status: 'pending',
      url,
      results: [],
    }))
    setSources(prev => [...prev, ...newSources])
    setUrlInput('')
  }

  function addFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files) return
    const newSources: SourceItem[] = Array.from(files).map(file => ({
      id: crypto.randomUUID(),
      type: 'file',
      name: file.name,
      status: 'pending',
      file,
      results: [],
    }))
    setSources(prev => [...prev, ...newSources])
    e.target.value = ''
  }

  function removeSource(id: string) {
    setSources(prev => prev.filter(s => s.id !== id))
  }

  async function extractAll() {
    setExtracting(true)
    const updated = [...sources]

    for (let i = 0; i < updated.length; i++) {
      const source = updated[i]
      if (source.status === 'done') continue

      updated[i] = { ...source, status: 'extracting' }
      setSources([...updated])

      try {
        let res: Response

        if (source.type === 'url') {
          res = await fetch('/api/extract-case-study', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: source.url }),
          })
        } else {
          const formData = new FormData()
          formData.append('file', source.file!)
          res = await fetch('/api/extract-case-study', {
            method: 'POST',
            body: formData,
          })
        }

        const data = await res.json()
        if (data.error) {
          updated[i] = { ...updated[i], status: 'error', error: data.error }
        } else {
          updated[i] = { ...updated[i], status: 'done', results: data.case_studies ?? [] }
        }
      } catch {
        updated[i] = { ...updated[i], status: 'error', error: '通信エラー' }
      }
      setSources([...updated])
    }

    // Collect all results
    const results = updated.flatMap(s => s.results)
    setAllResults(results)
    setExtracting(false)
  }

  async function saveResult(cs: ExtractedCaseStudy) {
    const supabase = createClient()
    await supabase.from('case_studies').insert({
      client_id: formClientId,
      company_name: cs.company_name,
      industry: cs.industry,
      challenge_tags: cs.challenge_tags,
      result_summary: cs.result_summary,
      recommended_roles: cs.recommended_roles ?? [],
      recommended_industries: cs.recommended_industries ?? [],
    })
    setAllResults(prev => prev.filter(item => item !== cs))
    loadCases()
  }

  async function saveAllResults() {
    const supabase = createClient()
    for (const cs of allResults) {
      await supabase.from('case_studies').insert({
        client_id: formClientId,
        company_name: cs.company_name,
        industry: cs.industry,
        challenge_tags: cs.challenge_tags,
        result_summary: cs.result_summary,
        recommended_roles: cs.recommended_roles ?? [],
        recommended_industries: cs.recommended_industries ?? [],
      })
    }
    setAllResults([])
    setSources([])
    setShowExtract(false)
    loadCases()
  }

  const doneCount = sources.filter(s => s.status === 'done').length
  const errorCount = sources.filter(s => s.status === 'error').length
  const pendingCount = sources.filter(s => s.status === 'pending').length

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">ケーススタディ管理</h1>
        <div className="flex gap-2">
          <button
            onClick={() => { setShowExtract(!showExtract); setShowForm(false) }}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
          >
            AI一括抽出
          </button>
          <button
            onClick={() => { setShowForm(!showForm); setShowExtract(false) }}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            + 手動追加
          </button>
        </div>
      </div>

      {/* AI一括抽出パネル */}
      {showExtract && (
        <div className="mt-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">ケーススタディ一括抽出</h2>
          <p className="mt-1 text-sm text-gray-500">
            複数のURL・ファイルをまとめて投入 → AIが自動でケーススタディを抽出します
          </p>

          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700">クライアント</label>
            <select
              value={formClientId}
              onChange={(e) => setFormClientId(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 sm:w-64"
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* ソース追加 */}
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700">URLを追加（複数可：改行やカンマ区切り）</label>
              <textarea
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder={"https://example.com/case1\nhttps://example.com/case2"}
                rows={3}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
              />
              <button
                onClick={addUrl}
                disabled={!urlInput.trim()}
                className="mt-2 rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50"
              >
                URLを追加
              </button>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">ファイルを追加（複数選択可）</label>
              <label className="mt-1 inline-flex cursor-pointer items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                ファイルを選択（PDF・テキスト）
                <input
                  type="file"
                  accept=".pdf,.txt,.csv,.md,.doc,.docx"
                  multiple
                  className="hidden"
                  onChange={addFiles}
                />
              </label>
            </div>
          </div>

          {/* ソース一覧 */}
          {sources.length > 0 && (
            <div className="mt-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-700">
                  ソース: {sources.length}件
                  {doneCount > 0 && <span className="text-green-600"> ({doneCount}件完了)</span>}
                  {errorCount > 0 && <span className="text-red-600"> ({errorCount}件エラー)</span>}
                </p>
                <button
                  onClick={() => setSources([])}
                  className="text-sm text-gray-400 hover:text-gray-600"
                >
                  すべてクリア
                </button>
              </div>
              <div className="mt-2 max-h-48 space-y-1 overflow-y-auto">
                {sources.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 rounded-lg bg-gray-50 px-3 py-2">
                    <span className="text-xs">
                      {s.status === 'pending' && '⏳'}
                      {s.status === 'extracting' && '🔄'}
                      {s.status === 'done' && '✅'}
                      {s.status === 'error' && '❌'}
                    </span>
                    <span className="flex-1 truncate text-sm text-gray-700">{s.name}</span>
                    {s.status === 'done' && (
                      <span className="text-xs text-green-600">{s.results.length}件抽出</span>
                    )}
                    {s.status === 'error' && (
                      <span className="text-xs text-red-600">{s.error}</span>
                    )}
                    <button
                      onClick={() => removeSource(s.id)}
                      className="text-xs text-gray-400 hover:text-red-500"
                    >
                      削除
                    </button>
                  </div>
                ))}
              </div>

              <button
                onClick={extractAll}
                disabled={extracting || pendingCount === 0}
                className="mt-3 rounded-lg bg-green-600 px-6 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                {extracting ? '抽出中...' : `${pendingCount > 0 ? pendingCount + '件を' : ''}一括抽出する`}
              </button>
            </div>
          )}

          {/* 抽出結果 */}
          {allResults.length > 0 && (
            <div className="mt-6 border-t border-gray-200 pt-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">
                  抽出結果: {allResults.length}件のケーススタディ
                </h3>
                <button
                  onClick={saveAllResults}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  すべて登録する
                </button>
              </div>
              <div className="mt-3 space-y-3">
                {allResults.map((cs, i) => (
                  <div key={i} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium text-gray-900">{cs.company_name}</p>
                        <p className="text-sm text-gray-600">業種: {cs.industry}</p>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {cs.challenge_tags.map((tag) => (
                            <span key={tag} className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                              {tag}
                            </span>
                          ))}
                        </div>
                        <p className="mt-2 text-sm text-gray-700">{cs.result_summary}</p>
                      </div>
                      <button
                        onClick={() => saveResult(cs)}
                        className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
                      >
                        登録
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 手動追加フォーム */}
      {showForm && (
        <div className="mt-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">ケーススタディを手動追加</h2>
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

      {/* テーブル */}
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
