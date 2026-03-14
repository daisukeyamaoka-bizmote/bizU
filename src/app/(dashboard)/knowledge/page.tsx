'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type KnowledgeItem = {
  id: string
  category: string
  title: string
  content: string
  source_type: string
  source_name: string | null
  tags: string[] | null
  client_name: string
}

type ExtractedItem = {
  category: string
  title: string
  content: string
  tags: string[]
  case_study?: {
    company_name: string
    industry: string
    challenge_tags: string[]
    result_summary: string
  } | null
}

type SourceItem = {
  id: string
  type: 'url' | 'file'
  name: string
  status: 'pending' | 'extracting' | 'done' | 'error'
  url?: string
  file?: File
  results: ExtractedItem[]
  sourceType?: string
  error?: string
}

const CATEGORY_LABELS: Record<string, { text: string; color: string }> = {
  product_info: { text: 'プロダクト情報', color: 'bg-purple-100 text-purple-700' },
  case_study: { text: '導入事例', color: 'bg-blue-100 text-blue-700' },
  sales_material: { text: '営業資料', color: 'bg-green-100 text-green-700' },
  competitor: { text: '競合情報', color: 'bg-red-100 text-red-700' },
  market: { text: '市場動向', color: 'bg-yellow-100 text-yellow-700' },
  other: { text: 'その他', color: 'bg-gray-100 text-gray-600' },
}

export default function KnowledgePage() {
  const [items, setItems] = useState<KnowledgeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [clients, setClients] = useState<{ id: string; name: string }[]>([])
  const [selectedClientId, setSelectedClientId] = useState<string>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Upload state
  const [showUpload, setShowUpload] = useState(false)
  const [uploadClientId, setUploadClientId] = useState('')
  const [sources, setSources] = useState<SourceItem[]>([])
  const [urlInput, setUrlInput] = useState('')
  const [extracting, setExtracting] = useState(false)
  const [allResults, setAllResults] = useState<ExtractedItem[]>([])
  const [resultSourceInfo, setResultSourceInfo] = useState<{ type: string; name: string }[]>([])

  useEffect(() => {
    loadClients()
    loadItems()
  }, [])

  useEffect(() => {
    loadItems()
  }, [selectedClientId, categoryFilter])

  async function loadClients() {
    const supabase = createClient()
    const { data } = await supabase.from('clients').select('id, name').eq('status', 'active') as { data: { id: string; name: string }[] | null }
    setClients(data ?? [])
    if (data?.[0]) setUploadClientId(data[0].id)
  }

  async function loadItems() {
    const supabase = createClient()
    let query = supabase
      .from('knowledge_items')
      .select('id, category, title, content, source_type, source_name, tags, client_id')
      .order('created_at', { ascending: false })

    if (selectedClientId !== 'all') {
      query = query.eq('client_id', selectedClientId)
    }
    if (categoryFilter !== 'all') {
      query = query.eq('category', categoryFilter)
    }

    const { data } = await query

    const clientIds = [...new Set((data ?? []).map(k => k.client_id).filter(Boolean))]
    const { data: clientsData } = clientIds.length > 0
      ? await supabase.from('clients').select('id, name').in('id', clientIds as string[])
      : { data: [] }
    const clientMap = new Map((clientsData ?? []).map(c => [c.id, c.name]))

    const mapped: KnowledgeItem[] = (data ?? []).map((k) => ({
      id: k.id,
      category: k.category,
      title: k.title,
      content: k.content,
      source_type: k.source_type,
      source_name: k.source_name,
      tags: k.tags,
      client_name: clientMap.get(k.client_id ?? '') ?? '-',
    }))
    setItems(mapped)
    setLoading(false)
  }

  // --- Multi-source upload ---
  function addUrls() {
    const trimmed = urlInput.trim()
    if (!trimmed) return
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
    const sourceInfos: { type: string; name: string }[] = []

    for (let i = 0; i < updated.length; i++) {
      const source = updated[i]
      if (source.status === 'done') continue

      updated[i] = { ...source, status: 'extracting' }
      setSources([...updated])

      try {
        let res: Response
        if (source.type === 'url') {
          res = await fetch('/api/extract-knowledge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: source.url }),
          })
        } else {
          const formData = new FormData()
          formData.append('file', source.file!)
          res = await fetch('/api/extract-knowledge', {
            method: 'POST',
            body: formData,
          })
        }

        if (!res.ok) {
          const text = await res.text()
          updated[i] = { ...updated[i], status: 'error', error: `API ${res.status}: ${text.slice(0, 200)}` }
          setSources([...updated])
          continue
        }
        const data = await res.json()
        if (data.error) {
          updated[i] = { ...updated[i], status: 'error', error: data.error }
        } else {
          updated[i] = {
            ...updated[i],
            status: 'done',
            results: data.items ?? [],
            sourceType: data.source_type,
          }
          sourceInfos.push({ type: data.source_type, name: data.source_name })
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        updated[i] = { ...updated[i], status: 'error', error: `通信エラー: ${msg}` }
      }
      setSources([...updated])
    }

    const results = updated.flatMap(s => s.results)
    setAllResults(results)
    setResultSourceInfo(sourceInfos)
    setExtracting(false)
  }

  async function saveAllResults() {
    const supabase = createClient()
    for (let i = 0; i < allResults.length; i++) {
      const item = allResults[i]
      const sourceInfo = resultSourceInfo[0] // Use first source for now

      // Save as knowledge item
      const { data: ki } = await supabase.from('knowledge_items').insert({
        client_id: uploadClientId,
        category: item.category,
        title: item.title,
        content: item.content,
        source_type: sourceInfo?.type ?? 'manual',
        source_name: sourceInfo?.name ?? null,
        tags: item.tags,
      }).select('id').single()

      // If it's a case study, also create a case_studies record
      if (item.category === 'case_study' && item.case_study && ki) {
        const { data: cs } = await supabase.from('case_studies').insert({
          client_id: uploadClientId,
          company_name: item.case_study.company_name,
          industry: item.case_study.industry,
          challenge_tags: item.case_study.challenge_tags,
          result_summary: item.case_study.result_summary,
        }).select('id').single()

        if (cs) {
          await supabase.from('knowledge_items')
            .update({ case_study_id: cs.id })
            .eq('id', ki.id)
        }
      }
    }
    setAllResults([])
    setSources([])
    setShowUpload(false)
    loadItems()
  }

  const doneCount = sources.filter(s => s.status === 'done').length
  const pendingCount = sources.filter(s => s.status === 'pending').length

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">ナレッジ管理</h1>
        <button
          onClick={() => setShowUpload(!showUpload)}
          className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
        >
          + ナレッジを追加
        </button>
      </div>
      <p className="mt-1 text-sm text-gray-500">
        プロダクトごとの営業資料・事例・競合情報を蓄積し、手紙生成に活用します
      </p>

      {/* アップロードパネル */}
      {showUpload && (
        <div className="mt-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">ナレッジを一括追加</h2>
          <p className="mt-1 text-sm text-gray-500">
            URL・PDF・テキストファイルを投入 → AIが営業に使える情報を自動抽出・分類します
          </p>

          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700">クライアント / プロダクト</label>
            <select
              value={uploadClientId}
              onChange={(e) => setUploadClientId(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 sm:w-64"
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700">URLを追加（複数可）</label>
              <textarea
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder={"製品ページURL\n事例ページURL\n競合の記事URL\n..."}
                rows={4}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
              />
              <button
                onClick={addUrls}
                disabled={!urlInput.trim()}
                className="mt-2 rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50"
              >
                URLを追加
              </button>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">ファイルを追加（複数選択可）</label>
              <p className="mt-1 text-xs text-gray-400">営業資料PDF、事例資料、提案書など</p>
              <label className="mt-2 inline-flex cursor-pointer items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                ファイルを選択
                <input
                  type="file"
                  accept=".pdf,.txt,.csv,.md,.doc,.docx,.xlsx,.xls,.pptx"
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
                </p>
                <button onClick={() => setSources([])} className="text-sm text-gray-400 hover:text-gray-600">
                  クリア
                </button>
              </div>
              <div className="mt-2 max-h-40 space-y-1 overflow-y-auto">
                {sources.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 rounded-lg bg-gray-50 px-3 py-2">
                    <span className="text-xs">
                      {s.status === 'pending' && '⏳'}
                      {s.status === 'extracting' && '🔄'}
                      {s.status === 'done' && '✅'}
                      {s.status === 'error' && '❌'}
                    </span>
                    <span className="flex-1 truncate text-sm text-gray-700">{s.name}</span>
                    {s.status === 'done' && <span className="text-xs text-green-600">{s.results.length}件</span>}
                    {s.status === 'error' && <span className="max-w-xs truncate text-xs text-red-600" title={s.error}>{s.error}</span>}
                    <button onClick={() => removeSource(s.id)} className="text-xs text-gray-400 hover:text-red-500">×</button>
                  </div>
                ))}
              </div>
              <button
                onClick={extractAll}
                disabled={extracting || pendingCount === 0}
                className="mt-3 rounded-lg bg-green-600 px-6 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                {extracting ? '抽出中...' : `一括抽出する (${pendingCount}件)`}
              </button>
            </div>
          )}

          {/* 抽出結果 */}
          {allResults.length > 0 && (
            <div className="mt-6 border-t border-gray-200 pt-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">抽出結果: {allResults.length}件</h3>
                <button
                  onClick={saveAllResults}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  すべて登録する
                </button>
              </div>
              <div className="mt-3 space-y-3">
                {allResults.map((item, i) => {
                  const cat = CATEGORY_LABELS[item.category] ?? CATEGORY_LABELS.other
                  return (
                    <div key={i} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                      <div className="flex items-start gap-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cat.color}`}>
                          {cat.text}
                        </span>
                        <div className="flex-1">
                          <p className="font-medium text-gray-900">{item.title}</p>
                          <p className="mt-1 text-sm text-gray-600 line-clamp-3">{item.content}</p>
                          {item.tags && item.tags.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {item.tags.map(tag => (
                                <span key={tag} className="rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-600">{tag}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* フィルター */}
      <div className="mt-6 flex flex-wrap gap-3">
        <select
          value={selectedClientId}
          onChange={(e) => setSelectedClientId(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
        >
          <option value="all">全クライアント</option>
          {clients.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
        >
          <option value="all">全カテゴリ</option>
          {Object.entries(CATEGORY_LABELS).map(([key, val]) => (
            <option key={key} value={key}>{val.text}</option>
          ))}
        </select>
      </div>

      {/* ナレッジ一覧 */}
      <div className="mt-4 space-y-3">
        {loading ? (
          <p className="text-sm text-gray-500">読み込み中...</p>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
            <p className="text-gray-500">ナレッジがありません</p>
            <p className="mt-1 text-sm text-gray-400">「+ ナレッジを追加」からURL・ファイルを投入してください</p>
          </div>
        ) : (
          items.map((item) => {
            const cat = CATEGORY_LABELS[item.category] ?? CATEGORY_LABELS.other
            const isExpanded = expandedId === item.id
            return (
              <div
                key={item.id}
                className="rounded-xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md"
              >
                <button
                  onClick={() => setExpandedId(isExpanded ? null : item.id)}
                  className="flex w-full items-start gap-3 p-4 text-left"
                >
                  <span className={`mt-0.5 rounded-full px-2 py-0.5 text-xs font-medium ${cat.color}`}>
                    {cat.text}
                  </span>
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{item.title}</p>
                    <div className="mt-1 flex items-center gap-3 text-xs text-gray-400">
                      <span>{item.client_name}</span>
                      {item.source_name && <span>{item.source_type === 'url' ? '🔗' : '📄'} {item.source_name}</span>}
                    </div>
                    {!isExpanded && (
                      <p className="mt-1 text-sm text-gray-500 line-clamp-2">{item.content}</p>
                    )}
                  </div>
                  <span className="text-gray-400">{isExpanded ? '▲' : '▼'}</span>
                </button>
                {isExpanded && (
                  <div className="border-t border-gray-100 px-4 pb-4 pt-3">
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">{item.content}</p>
                    {item.tags && item.tags.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1">
                        {item.tags.map(tag => (
                          <span key={tag} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{tag}</span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
