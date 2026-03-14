'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useNotification } from '@/lib/useNotification'

type KnowledgeItem = {
  id: string
  category: string
  title: string
  content: string
  source_type: string
  source_name: string | null
  tags: string[] | null
  client_name: string
  created_at: string
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
  stage?: 'uploading' | 'analyzing' | 'extracting'
  progress?: number
}

const STAGE_LABELS: Record<string, string> = {
  uploading: 'アップロード中',
  analyzing: 'AI分析中',
  extracting: 'ナレッジ抽出中',
}

const CATEGORY_LABELS: Record<string, { text: string; color: string }> = {
  product_info: { text: 'プロダクト情報', color: 'bg-neutral-900 text-white' },
  case_study: { text: '導入事例', color: 'bg-neutral-700 text-white' },
  sales_material: { text: '営業資料', color: 'bg-neutral-200 text-neutral-800' },
  competitor: { text: '競合情報', color: 'bg-neutral-200 text-neutral-800' },
  market: { text: '市場動向', color: 'bg-neutral-200 text-neutral-800' },
  other: { text: 'その他', color: 'bg-neutral-100 text-neutral-500' },
}

export default function KnowledgePage() {
  const { requestPermission, notify } = useNotification()

  useEffect(() => {
    requestPermission()
  }, [requestPermission])

  const [items, setItems] = useState<KnowledgeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [clients, setClients] = useState<{ id: string; name: string }[]>([])
  const [selectedClientId, setSelectedClientId] = useState<string>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)
  const [sortKey, setSortKey] = useState<'created_at' | 'title' | 'category' | 'source_name'>('created_at')
  const [sortAsc, setSortAsc] = useState(false)

  // Upload state
  const [showUpload, setShowUpload] = useState(false)
  const [uploadClientId, setUploadClientId] = useState('')
  const [sources, setSources] = useState<SourceItem[]>([])
  const [urlInput, setUrlInput] = useState('')
  const [extracting, setExtracting] = useState(false)
  const [allResults, setAllResults] = useState<ExtractedItem[]>([])
  const [resultSourceInfo, setResultSourceInfo] = useState<{ type: string; name: string }[]>([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedMessage, setSavedMessage] = useState<string | null>(null)

  useEffect(() => {
    loadClients()
    loadItems()
  }, [])

  useEffect(() => {
    loadItems()
  }, [selectedClientId, categoryFilter, sortKey, sortAsc])

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
      .select('id, category, title, content, source_type, source_name, tags, client_id, created_at')
      .order(sortKey, { ascending: sortAsc })

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
      created_at: k.created_at,
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

  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const startProgressAnimation = useCallback((index: number, stage: 'uploading' | 'analyzing' | 'extracting', startPct: number, endPct: number) => {
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current)
    const duration = stage === 'analyzing' ? 20000 : 3000
    const stepMs = 200
    const steps = duration / stepMs
    const increment = (endPct - startPct) / steps
    let current = startPct

    progressIntervalRef.current = setInterval(() => {
      current = Math.min(current + increment, endPct)
      setSources(prev => {
        const copy = [...prev]
        if (copy[index]) copy[index] = { ...copy[index], progress: Math.round(current), stage }
        return copy
      })
      if (current >= endPct && progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current)
        progressIntervalRef.current = null
      }
    }, stepMs)
  }, [])

  async function callExtractAPI(source: SourceItem): Promise<Response> {
    if (source.type === 'url') {
      return fetch('/api/extract-knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: source.url }),
      })
    } else {
      const formData = new FormData()
      formData.append('file', source.file!)
      return fetch('/api/extract-knowledge', {
        method: 'POST',
        body: formData,
      })
    }
  }

  function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  async function extractAll() {
    setExtracting(true)
    const updated = [...sources]
    const sourceInfos: { type: string; name: string }[] = []
    let processedCount = 0

    for (let i = 0; i < updated.length; i++) {
      const source = updated[i]
      if (source.status === 'done') continue

      // ファイル間に待機を入れてレート制限を回避
      if (processedCount > 0) {
        updated[i] = { ...source, status: 'extracting', stage: 'uploading', progress: 0 }
        setSources([...updated])
        // 前のファイル処理後に5秒待機
        await sleep(5000)
      }

      // Stage 1: Uploading (0-15%)
      updated[i] = { ...updated[i], status: 'extracting', stage: 'uploading', progress: 0 }
      setSources([...updated])
      startProgressAnimation(i, 'uploading', 0, 15)

      const MAX_RETRIES = 3
      let lastError = ''

      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          // Stage 2: AI Analyzing (15-85%)
          updated[i] = { ...updated[i], stage: 'analyzing', progress: 15 }
          setSources([...updated])
          startProgressAnimation(i, 'analyzing', 15, 85)

          const res = await callExtractAPI(source)

          // Stage 3: Extracting results (85-100%)
          if (progressIntervalRef.current) clearInterval(progressIntervalRef.current)
          updated[i] = { ...updated[i], stage: 'extracting', progress: 85 }
          setSources([...updated])
          startProgressAnimation(i, 'extracting', 85, 98)

          if (!res.ok) {
            const text = await res.text()
            // レート制限エラーの場合はリトライ
            if (res.status === 429 || (res.status === 500 && text.includes('rate_limit'))) {
              if (progressIntervalRef.current) clearInterval(progressIntervalRef.current)
              const waitSec = 15 * (attempt + 1)
              lastError = `レート制限 - ${waitSec}秒後にリトライ (${attempt + 1}/${MAX_RETRIES})`
              updated[i] = { ...updated[i], stage: 'uploading', progress: 0, error: lastError }
              setSources([...updated])
              await sleep(waitSec * 1000)
              continue
            }
            if (progressIntervalRef.current) clearInterval(progressIntervalRef.current)
            lastError = `API ${res.status}: ${text.slice(0, 300)}`
            break
          }

          const data = await res.json()
          if (progressIntervalRef.current) clearInterval(progressIntervalRef.current)

          if (data.error) {
            if (data.error.includes('rate_limit')) {
              const waitSec = 15 * (attempt + 1)
              lastError = `レート制限 - ${waitSec}秒後にリトライ (${attempt + 1}/${MAX_RETRIES})`
              updated[i] = { ...updated[i], stage: 'uploading', progress: 0, error: lastError }
              setSources([...updated])
              await sleep(waitSec * 1000)
              continue
            }
            lastError = data.error
            break
          }

          // 成功
          updated[i] = {
            ...updated[i],
            status: 'done',
            progress: 100,
            stage: undefined,
            error: undefined,
            results: data.items ?? [],
            sourceType: data.source_type,
          }
          sourceInfos.push({ type: data.source_type, name: data.source_name })
          lastError = ''
          break
        } catch (err) {
          if (progressIntervalRef.current) clearInterval(progressIntervalRef.current)
          lastError = `通信エラー: ${err instanceof Error ? err.message : String(err)}`
          break
        }
      }

      if (lastError) {
        if (progressIntervalRef.current) clearInterval(progressIntervalRef.current)
        updated[i] = { ...updated[i], status: 'error', progress: undefined, stage: undefined, error: lastError }
      }
      setSources([...updated])
      processedCount++
    }

    const results = updated.flatMap(s => s.results)
    setAllResults(results)
    setResultSourceInfo(sourceInfos)
    setExtracting(false)

    // 抽出完了後に自動保存
    if (results.length > 0) {
      setSaving(true)
      setSaveError(null)
      const savedCount = await saveExtractedItems(results, sourceInfos)
      setSaving(false)
      if (savedCount > 0) {
        setSavedMessage(`${savedCount}件のナレッジを自動保存しました`)
        setTimeout(() => setSavedMessage(null), 5000)
        loadItems()
        // Desktop notification
        notify('ナレッジ抽出完了', `${savedCount}件のナレッジを保存しました`)
      }
    } else {
      // Notify even if no results
      notify('ナレッジ抽出完了', '抽出結果が0件でした')
    }
  }

  async function saveExtractedItems(items: ExtractedItem[], sourceInfos: { type: string; name: string }[]) {
    const supabase = createClient()
    let savedCount = 0
    const errors: string[] = []

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const sourceInfo = sourceInfos[i] ?? sourceInfos[0]

      const { data: ki, error: kiError } = await supabase.from('knowledge_items').insert({
        client_id: uploadClientId,
        category: item.category,
        title: item.title,
        content: item.content,
        source_type: sourceInfo?.type ?? 'manual',
        source_name: sourceInfo?.name ?? null,
        tags: item.tags,
      }).select('id').single()

      if (kiError) {
        errors.push(`「${item.title}」の保存に失敗: ${kiError.message}`)
        continue
      }

      savedCount++

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

    if (errors.length > 0) {
      setSaveError(errors.join('\n'))
    }

    return savedCount
  }

  async function saveAllResults() {
    setSaving(true)
    setSaveError(null)
    const savedCount = await saveExtractedItems(allResults, resultSourceInfo)
    setSaving(false)
    if (savedCount > 0) {
      setAllResults([])
      setSources([])
      setShowUpload(false)
      loadItems()
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(items.map(i => i.id)))
    }
  }

  async function deleteSelected() {
    if (selectedIds.size === 0) return
    if (!confirm(`${selectedIds.size}件のナレッジを削除しますか？`)) return
    setDeleting(true)
    const supabase = createClient()
    await supabase.from('knowledge_items').delete().in('id', Array.from(selectedIds))
    setSelectedIds(new Set())
    setDeleting(false)
    loadItems()
  }

  function handleSort(key: typeof sortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc)
    } else {
      setSortKey(key)
      setSortAsc(key === 'title' || key === 'category')
    }
  }

  const doneCount = sources.filter(s => s.status === 'done').length
  const pendingCount = sources.filter(s => s.status === 'pending').length

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-neutral-900">ナレッジ管理</h1>
        <button
          onClick={() => setShowUpload(!showUpload)}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
        >
          + ナレッジを追加
        </button>
      </div>
      <p className="mt-1 text-sm text-neutral-500">
        プロダクトごとの営業資料・事例・競合情報を蓄積し、手紙生成に活用します
      </p>

      {/* アップロードパネル */}
      {showUpload && (
        <div className="mt-4 rounded-lg border border-neutral-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-neutral-900">ナレッジを一括追加</h2>
          <p className="mt-1 text-sm text-neutral-500">
            URL・PDF・テキストファイルを投入 → AIが営業に使える情報を自動抽出・分類します
          </p>
          <p className="mt-2 text-xs text-neutral-400">
            複数ファイルを一括処理できます。PDF1件あたり30秒〜1分程度かかります。件数が多い場合は自動的に間隔を空けて処理します。
          </p>

          <div className="mt-4">
            <label className="block text-sm font-medium text-neutral-700">クライアント / プロダクト</label>
            <select
              value={uploadClientId}
              onChange={(e) => setUploadClientId(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 sm:w-64"
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-neutral-700">URLを追加（複数可）</label>
              <textarea
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder={"製品ページURL\n事例ページURL\n競合の記事URL\n..."}
                rows={4}
                className="mt-1 block w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
              />
              <button
                onClick={addUrls}
                disabled={!urlInput.trim()}
                className="mt-2 rounded-lg bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-200 disabled:opacity-50"
              >
                URLを追加
              </button>
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700">ファイルを追加（複数選択可）</label>
              <p className="mt-1 text-xs text-neutral-400">営業資料PDF、事例資料、提案書など</p>
              <label className="mt-2 inline-flex cursor-pointer items-center rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50">
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
                <p className="text-sm font-medium text-neutral-700">
                  ソース: {sources.length}件
                  {doneCount > 0 && <span className="text-neutral-900 font-medium"> ({doneCount}件完了)</span>}
                </p>
                <button onClick={() => setSources([])} className="text-sm text-neutral-400 hover:text-neutral-600">
                  クリア
                </button>
              </div>
              <div className="mt-2 max-h-60 space-y-2 overflow-y-auto">
                {sources.map((s) => (
                  <div key={s.id} className="rounded-lg bg-neutral-50 px-3 py-2">
                    <div className="flex items-center gap-3">
                      <span className="flex h-5 w-5 items-center justify-center">
                        {s.status === 'pending' && <span className="h-2 w-2 rounded-full bg-neutral-300" />}
                        {s.status === 'extracting' && <span className="h-2 w-2 rounded-full bg-neutral-900 progress-active" />}
                        {s.status === 'done' && (
                          <svg className="h-4 w-4 text-neutral-900" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                        {s.status === 'error' && (
                          <svg className="h-4 w-4 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                        )}
                      </span>
                      <span className="flex-1 truncate text-sm text-neutral-700">{s.name}</span>
                      {s.status === 'done' && <span className="text-xs text-neutral-900 font-medium">{s.results.length}件抽出</span>}
                      {s.status === 'error' && <span className="max-w-sm text-xs text-red-600 break-all" title={s.error}>{s.error}</span>}
                      {s.status === 'extracting' && s.stage && (
                        <span className="text-xs text-neutral-600">{STAGE_LABELS[s.stage]}</span>
                      )}
                      <button onClick={() => removeSource(s.id)} className="text-xs text-neutral-400 hover:text-red-500">×</button>
                    </div>
                    {s.status === 'extracting' && s.progress !== undefined && (
                      <div className="mt-2">
                        <div className="flex items-center justify-between text-xs text-neutral-500">
                          <span>{s.stage && STAGE_LABELS[s.stage]}</span>
                          <span>{s.progress}%</span>
                        </div>
                        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-neutral-200">
                          <div
                            className="h-full rounded-full bg-neutral-900 transition-all duration-300 ease-out"
                            style={{ width: `${s.progress}%` }}
                          />
                        </div>
                      </div>
                    )}
                    {s.status === 'done' && (
                      <div className="mt-1">
                        <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-200">
                          <div className="h-full w-full rounded-full bg-neutral-900" />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-4">
                <button
                  onClick={extractAll}
                  disabled={extracting || pendingCount === 0}
                  className="rounded-md bg-neutral-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-neutral-800 disabled:opacity-50"
                >
                  {extracting
                    ? `抽出中... (${doneCount}/${sources.length})`
                    : `一括抽出する (${pendingCount}件)`}
                </button>
                {extracting && (
                  <span className="text-xs text-neutral-500">
                    {sources.length > 1
                      ? `${sources.length}件を順番に処理中... 全体で${Math.ceil(sources.length * 1.5)}分ほどかかる場合があります`
                      : 'AI処理のため30秒〜1分ほどかかります'}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* 保存状態メッセージ */}
          {saving && (
            <div className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
              <p className="text-sm text-neutral-600">データベースに保存中...</p>
            </div>
          )}
          {savedMessage && (
            <div className="mt-4 rounded-lg border border-neutral-900 bg-neutral-900 p-3">
              <p className="text-sm text-white font-medium">{savedMessage}</p>
            </div>
          )}
          {saveError && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3">
              <p className="text-sm text-red-700 font-medium">保存エラー</p>
              <p className="mt-1 text-xs text-red-600 whitespace-pre-wrap">{saveError}</p>
            </div>
          )}

          {/* 抽出結果 */}
          {allResults.length > 0 && (
            <div className="mt-6 border-t border-neutral-200 pt-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-neutral-900">抽出結果: {allResults.length}件</h3>
                {saveError && (
                  <button
                    onClick={saveAllResults}
                    disabled={saving}
                    className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
                  >
                    {saving ? '保存中...' : '再保存する'}
                  </button>
                )}
              </div>
              <div className="mt-3 space-y-3">
                {allResults.map((item, i) => {
                  const cat = CATEGORY_LABELS[item.category] ?? CATEGORY_LABELS.other
                  return (
                    <div key={i} className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
                      <div className="flex items-start gap-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cat.color}`}>
                          {cat.text}
                        </span>
                        <div className="flex-1">
                          <p className="font-medium text-neutral-900">{item.title}</p>
                          <p className="mt-1 text-sm text-neutral-600 line-clamp-3">{item.content}</p>
                          {item.tags && item.tags.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {item.tags.map(tag => (
                                <span key={tag} className="rounded-full bg-neutral-200 px-2 py-0.5 text-xs text-neutral-600">{tag}</span>
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

      {/* フィルター・ソート・削除 */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <select
          value={selectedClientId}
          onChange={(e) => setSelectedClientId(e.target.value)}
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
        >
          <option value="all">全クライアント</option>
          {clients.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
        >
          <option value="all">全カテゴリ</option>
          {Object.entries(CATEGORY_LABELS).map(([key, val]) => (
            <option key={key} value={key}>{val.text}</option>
          ))}
        </select>

        <div className="flex items-center gap-1 rounded-lg border border-neutral-200 bg-white p-0.5">
          {([
            ['created_at', '日付'],
            ['title', 'タイトル'],
            ['category', 'カテゴリ'],
            ['source_name', '元資料'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => handleSort(key)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                sortKey === key ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:bg-neutral-100'
              }`}
            >
              {label}{sortKey === key ? (sortAsc ? ' ↑' : ' ↓') : ''}
            </button>
          ))}
        </div>

        {selectedIds.size > 0 && (
          <button
            onClick={deleteSelected}
            disabled={deleting}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {deleting ? '削除中...' : `${selectedIds.size}件を削除`}
          </button>
        )}
      </div>

      {/* 一括選択 */}
      {items.length > 0 && (
        <div className="mt-4 flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-neutral-500">
            <input
              type="checkbox"
              checked={selectedIds.size === items.length && items.length > 0}
              onChange={toggleSelectAll}
              className="h-4 w-4 rounded border-neutral-300"
            />
            全選択
          </label>
          <span className="text-xs text-neutral-400">{items.length}件</span>
        </div>
      )}

      {/* ナレッジ一覧 */}
      <div className="mt-2 space-y-3">
        {loading ? (
          <p className="text-sm text-neutral-500">読み込み中...</p>
        ) : items.length === 0 ? (
          <div className="rounded-lg border border-neutral-200 bg-white p-8 text-center shadow-sm">
            <p className="text-neutral-500">ナレッジがありません</p>
            <p className="mt-1 text-sm text-neutral-400">「+ ナレッジを追加」からURL・ファイルを投入してください</p>
          </div>
        ) : (
          items.map((item) => {
            const cat = CATEGORY_LABELS[item.category] ?? CATEGORY_LABELS.other
            const isExpanded = expandedId === item.id
            const isSelected = selectedIds.has(item.id)
            return (
              <div
                key={item.id}
                className={`rounded-lg border bg-white transition-all hover:border-neutral-300 ${isSelected ? 'border-neutral-400 ring-1 ring-neutral-300' : 'border-neutral-200'}`}
              >
                <div className="flex items-start gap-3 p-4">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(item.id)}
                    className="mt-1 h-4 w-4 rounded border-neutral-300"
                  />
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : item.id)}
                    className="flex flex-1 items-start gap-3 text-left"
                  >
                    <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${cat.color}`}>
                      {cat.text}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-neutral-900">{item.title}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                        <span className="text-neutral-400">{item.client_name}</span>
                        {item.source_name && (
                          <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-neutral-600">
                            {item.source_type === 'url' ? '🔗' : '📄'} {item.source_name}
                          </span>
                        )}
                        <span className="text-neutral-300">
                          {new Date(item.created_at).toLocaleDateString('ja-JP')}
                        </span>
                      </div>
                      {!isExpanded && (
                        <p className="mt-1 text-sm text-neutral-500 line-clamp-2">{item.content}</p>
                      )}
                    </div>
                    <span className="text-neutral-400">{isExpanded ? '▲' : '▼'}</span>
                  </button>
                </div>
                {isExpanded && (
                  <div className="border-t border-neutral-100 px-4 pb-4 pt-3 ml-7">
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-700">{item.content}</p>
                    {item.tags && item.tags.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1">
                        {item.tags.map(tag => (
                          <span key={tag} className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">{tag}</span>
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
