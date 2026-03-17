'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useNotification } from '@/lib/useNotification'

type KnowledgeFolder = {
  id: string
  name: string
  client_id: string
  client_name: string
  description: string | null
  created_at: string
  item_count: number
}

type KnowledgeItem = {
  id: string
  category: string
  title: string
  content: string
  source_type: string
  source_name: string | null
  tags: string[] | null
  client_name: string
  folder_id: string | null
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
  stage?: 'uploading' | 'analyzing' | 'extracting' | 'crawling'
  progress?: number
}

const STAGE_LABELS: Record<string, string> = {
  uploading: 'アップロード中',
  analyzing: 'AI分析中',
  extracting: 'ナレッジ抽出中',
  crawling: '子ページをクロール中',
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

  // View mode: 'folders' or 'list'
  const [viewMode, setViewMode] = useState<'folders' | 'list'>('folders')
  const [folders, setFolders] = useState<KnowledgeFolder[]>([])
  const [openFolderId, setOpenFolderId] = useState<string | null>(null)
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

  // Folder management
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null)
  const [editFolderName, setEditFolderName] = useState('')
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [newFolderClientId, setNewFolderClientId] = useState('')
  const [movingToFolder, setMovingToFolder] = useState(false)

  // Upload state
  const [showUpload, setShowUpload] = useState(false)
  const [uploadClientId, setUploadClientId] = useState('')
  const [folderName, setFolderName] = useState('')
  const [deepCrawl, setDeepCrawl] = useState(false)
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
    loadFolders()
    loadItems()
  }, [])

  useEffect(() => {
    loadFolders()
    loadItems()
  }, [selectedClientId, categoryFilter, sortKey, sortAsc])

  async function loadClients() {
    const supabase = createClient()
    const { data } = await supabase.from('clients').select('id, name').eq('status', 'active') as { data: { id: string; name: string }[] | null }
    setClients(data ?? [])
    if (data?.[0]) setUploadClientId(data[0].id)
  }

  async function loadFolders() {
    try {
      const supabase = createClient()
      let query = supabase
        .from('knowledge_folders')
        .select('id, name, client_id, description, created_at')
        .order('created_at', { ascending: false })

      if (selectedClientId !== 'all') {
        query = query.eq('client_id', selectedClientId)
      }

      const { data: foldersData, error } = await query
      if (error) {
        // Table may not exist yet - switch to list view
        setViewMode('list')
        return
      }

      // Get client names
      const clientIds = [...new Set((foldersData ?? []).map(f => f.client_id).filter(Boolean))]
      const { data: clientsData } = clientIds.length > 0
        ? await supabase.from('clients').select('id, name').in('id', clientIds as string[])
        : { data: [] }
      const clientMap = new Map((clientsData ?? []).map(c => [c.id, c.name]))

      // Get item counts per folder
      const folderIds = (foldersData ?? []).map(f => f.id)
      let itemCounts = new Map<string, number>()
      if (folderIds.length > 0) {
        const { data: countData } = await supabase
          .from('knowledge_items')
          .select('folder_id')
          .in('folder_id', folderIds)

        const counts: Record<string, number> = {}
        for (const row of (countData ?? [])) {
          if (row.folder_id) {
            counts[row.folder_id] = (counts[row.folder_id] ?? 0) + 1
          }
        }
        itemCounts = new Map(Object.entries(counts))
      }

      const mapped: KnowledgeFolder[] = (foldersData ?? []).map(f => ({
        id: f.id,
        name: f.name,
        client_id: f.client_id,
        client_name: clientMap.get(f.client_id ?? '') ?? '-',
        description: f.description,
        created_at: f.created_at,
        item_count: itemCounts.get(f.id) ?? 0,
      }))
      setFolders(mapped)
    } catch {
      // Folder table not available yet - use list view
      setViewMode('list')
    }
  }

  async function loadItems(folderId?: string | null) {
    const supabase = createClient()
    let query = supabase
      .from('knowledge_items')
      .select('id, category, title, content, source_type, source_name, tags, client_id, folder_id, created_at')
      .order(sortKey, { ascending: sortAsc })

    if (selectedClientId !== 'all') {
      query = query.eq('client_id', selectedClientId)
    }
    if (categoryFilter !== 'all') {
      query = query.eq('category', categoryFilter)
    }
    if (folderId) {
      query = query.eq('folder_id', folderId)
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
      folder_id: k.folder_id,
      created_at: k.created_at,
    }))
    setItems(mapped)
    setLoading(false)
  }

  // --- Folder actions ---
  async function renameFolder(folderId: string) {
    if (!editFolderName.trim()) return
    const supabase = createClient()
    await supabase.from('knowledge_folders').update({ name: editFolderName.trim() }).eq('id', folderId)
    setEditingFolderId(null)
    loadFolders()
  }

  async function deleteFolder(folderId: string) {
    if (!confirm('このフォルダを削除しますか？中のナレッジは「未分類」に移動されます。')) return
    const supabase = createClient()
    // Move items to no folder
    await supabase.from('knowledge_items').update({ folder_id: null }).eq('folder_id', folderId)
    await supabase.from('knowledge_folders').delete().eq('id', folderId)
    if (openFolderId === folderId) setOpenFolderId(null)
    loadFolders()
    loadItems()
  }

  async function createNewFolder() {
    if (!newFolderName.trim()) return
    const clientId = newFolderClientId || (selectedClientId !== 'all' ? selectedClientId : clients[0]?.id)
    if (!clientId) return
    const supabase = createClient()
    const { error } = await supabase.from('knowledge_folders').insert({
      client_id: clientId,
      name: newFolderName.trim(),
    })
    if (!error) {
      setNewFolderName('')
      setCreatingFolder(false)
      loadFolders()
    }
  }

  async function moveItemsToFolder(targetFolderId: string | null) {
    if (selectedIds.size === 0) return
    setMovingToFolder(true)
    const supabase = createClient()
    await supabase
      .from('knowledge_items')
      .update({ folder_id: targetFolderId })
      .in('id', Array.from(selectedIds))
    setSelectedIds(new Set())
    setMovingToFolder(false)
    loadFolders()
    loadItems(openFolderId)
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

  const startProgressAnimation = useCallback((index: number, stage: 'uploading' | 'analyzing' | 'extracting' | 'crawling', startPct: number, endPct: number) => {
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current)
    const duration = stage === 'analyzing' ? 20000 : stage === 'crawling' ? 30000 : 3000
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
        body: JSON.stringify({ url: source.url, deepCrawl }),
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

      if (processedCount > 0) {
        updated[i] = { ...source, status: 'extracting', stage: 'uploading', progress: 0 }
        setSources([...updated])
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
          // If deep crawl + URL, show crawling stage
          if (deepCrawl && source.type === 'url') {
            updated[i] = { ...updated[i], stage: 'crawling', progress: 15 }
            setSources([...updated])
            startProgressAnimation(i, 'crawling', 15, 50)

            // Wait a bit then switch to analyzing
            await sleep(3000)
            updated[i] = { ...updated[i], stage: 'analyzing', progress: 50 }
            setSources([...updated])
            startProgressAnimation(i, 'analyzing', 50, 85)
          } else {
            updated[i] = { ...updated[i], stage: 'analyzing', progress: 15 }
            setSources([...updated])
            startProgressAnimation(i, 'analyzing', 15, 85)
          }

          const res = await callExtractAPI(source)

          if (progressIntervalRef.current) clearInterval(progressIntervalRef.current)
          updated[i] = { ...updated[i], stage: 'extracting', progress: 85 }
          setSources([...updated])
          startProgressAnimation(i, 'extracting', 85, 98)

          if (!res.ok) {
            const text = await res.text()
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

          // Success
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

    // Auto-save after extraction
    if (results.length > 0) {
      setSaving(true)
      setSaveError(null)
      const savedCount = await saveExtractedItems(results, sourceInfos)
      setSaving(false)
      if (savedCount > 0) {
        setSavedMessage(`${savedCount}件のナレッジを自動保存しました`)
        setTimeout(() => setSavedMessage(null), 5000)
        loadFolders()
        loadItems()
        notify('ナレッジ抽出完了', `${savedCount}件のナレッジを保存しました`)
      }
    } else {
      notify('ナレッジ抽出完了', '抽出結果が0件でした')
    }
  }

  async function saveExtractedItems(items: ExtractedItem[], sourceInfos: { type: string; name: string }[]) {
    const supabase = createClient()
    let savedCount = 0
    const errors: string[] = []

    // Try to create folder for this import batch
    const autoFolderName = folderName.trim() || `インポート ${new Date().toLocaleDateString('ja-JP')} ${new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`
    let folderId: string | null = null
    let folderSupported = true

    try {
      const { data: folder, error: folderError } = await supabase.from('knowledge_folders').insert({
        client_id: uploadClientId,
        name: autoFolderName,
        description: sourceInfos.map(s => s.name).join(', '),
      }).select('id').single()

      if (folderError) {
        // knowledge_folders table may not exist yet
        folderSupported = false
      } else {
        folderId = folder?.id ?? null
      }
    } catch {
      folderSupported = false
    }

    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const sourceInfo = sourceInfos[i] ?? sourceInfos[0]

      // Build insert payload - include folder_id only if supported
      const insertData: Record<string, unknown> = {
        client_id: uploadClientId,
        category: item.category,
        title: item.title,
        content: item.content,
        source_type: sourceInfo?.type ?? 'manual',
        source_name: sourceInfo?.name ?? null,
        tags: item.tags,
      }
      if (folderSupported && folderId) {
        insertData.folder_id = folderId
      }

      let { error: kiError } = await supabase.from('knowledge_items').insert(insertData)

      // If folder_id column doesn't exist, retry without it
      if (kiError && kiError.message.includes('folder_id')) {
        folderSupported = false
        delete insertData.folder_id
        const retry = await supabase.from('knowledge_items').insert(insertData)
        kiError = retry.error
      }

      if (kiError) {
        errors.push(`「${item.title}」の保存に失敗: ${kiError.message}`)
        continue
      }

      savedCount++
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
      loadFolders()
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
    loadFolders()
    loadItems(openFolderId)
  }

  function handleSort(key: typeof sortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc)
    } else {
      setSortKey(key)
      setSortAsc(key === 'title' || key === 'category')
    }
  }

  function openFolder(folderId: string) {
    setOpenFolderId(folderId)
    setViewMode('list')
    loadItems(folderId)
  }

  function goBackToFolders() {
    setOpenFolderId(null)
    setViewMode('folders')
    loadItems()
  }

  const doneCount = sources.filter(s => s.status === 'done').length
  const pendingCount = sources.filter(s => s.status === 'pending').length

  // Items to display: if in folder view, only folder items; in list view, all items
  const displayItems = openFolderId ? items.filter(i => i.folder_id === openFolderId) : items

  // Count of items without a folder
  const unfolderedItems = items.filter(i => !i.folder_id)

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

      {/* Upload panel */}
      {showUpload && (
        <div className="mt-4 rounded-lg border border-neutral-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-neutral-900">ナレッジを一括追加</h2>
          <p className="mt-1 text-sm text-neutral-500">
            URL・PDF・テキストファイルを投入 → AIが営業に使える情報を自動抽出・分類します
          </p>
          <p className="mt-2 text-xs text-neutral-400">
            複数ファイルを一括処理できます。PDF1件あたり30秒〜1分程度かかります。件数が多い場合は自動的に間隔を空けて処理します。
          </p>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-neutral-700">クライアント / プロダクト</label>
              <select
                value={uploadClientId}
                onChange={(e) => setUploadClientId(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700">フォルダ名（任意）</label>
              <input
                type="text"
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                placeholder="例: harutaka事例集、営業資料2024Q4"
                className="mt-1 block w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
              />
              <p className="mt-1 text-xs text-neutral-400">空欄の場合は日時で自動命名されます</p>
            </div>
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
              <div className="mt-2 flex items-center gap-3">
                <button
                  onClick={addUrls}
                  disabled={!urlInput.trim()}
                  className="rounded-lg bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-200 disabled:opacity-50"
                >
                  URLを追加
                </button>
                <label className="flex items-center gap-2 text-sm text-neutral-600">
                  <input
                    type="checkbox"
                    checked={deepCrawl}
                    onChange={(e) => setDeepCrawl(e.target.checked)}
                    className="h-4 w-4 rounded border-neutral-300"
                  />
                  子ページも読み取る（事例インタビュー等）
                </label>
              </div>
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

          {/* Source queue */}
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
                    {deepCrawl
                      ? '子ページのクロールを含むため、通常より時間がかかります'
                      : sources.length > 1
                        ? `${sources.length}件を順番に処理中... 全体で${Math.ceil(sources.length * 1.5)}分ほどかかる場合があります`
                        : 'AI処理のため30秒〜1分ほどかかります'}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Save state messages */}
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

          {/* Extraction results */}
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

      {/* Filter / Sort / Delete */}
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

        {/* View toggle */}
        <div className="flex items-center gap-1 rounded-lg border border-neutral-200 bg-white p-0.5">
          <button
            onClick={() => { setViewMode('folders'); setOpenFolderId(null); loadItems() }}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              viewMode === 'folders' && !openFolderId ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:bg-neutral-100'
            }`}
          >
            フォルダ
          </button>
          <button
            onClick={() => { setViewMode('list'); setOpenFolderId(null); loadItems() }}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              viewMode === 'list' && !openFolderId ? 'bg-neutral-900 text-white' : 'text-neutral-500 hover:bg-neutral-100'
            }`}
          >
            一覧
          </button>
        </div>

        {viewMode === 'list' && (
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
        )}

        {selectedIds.size > 0 && (
          <>
            {/* Move to folder */}
            <select
              value=""
              onChange={(e) => {
                const val = e.target.value
                if (val === '__none__') moveItemsToFolder(null)
                else if (val) moveItemsToFolder(val)
              }}
              disabled={movingToFolder}
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-700"
            >
              <option value="">フォルダに移動...</option>
              <option value="__none__">未分類に移動</option>
              {folders.map(f => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
            <button
              onClick={deleteSelected}
              disabled={deleting}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {deleting ? '削除中...' : `${selectedIds.size}件を削除`}
            </button>
          </>
        )}
      </div>

      {/* Folder breadcrumb */}
      {openFolderId && (
        <div className="mt-4 flex items-center gap-2 text-sm">
          <button onClick={goBackToFolders} className="text-neutral-900 hover:underline font-medium">
            フォルダ一覧
          </button>
          <span className="text-neutral-400">/</span>
          {editingFolderId === openFolderId ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={editFolderName}
                onChange={(e) => setEditFolderName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && renameFolder(openFolderId)}
                className="rounded border border-neutral-300 px-2 py-0.5 text-sm"
                autoFocus
              />
              <button onClick={() => renameFolder(openFolderId)} className="text-xs text-neutral-900 hover:underline">保存</button>
              <button onClick={() => setEditingFolderId(null)} className="text-xs text-neutral-400 hover:underline">キャンセル</button>
            </div>
          ) : (
            <span className="flex items-center gap-1.5 text-neutral-600">
              {folders.find(f => f.id === openFolderId)?.name ?? ''}
              <button
                onClick={() => { setEditingFolderId(openFolderId); setEditFolderName(folders.find(f => f.id === openFolderId)?.name ?? '') }}
                className="rounded p-0.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
                title="名前変更"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
              </button>
            </span>
          )}
        </div>
      )}

      {/* Folder view */}
      {viewMode === 'folders' && !openFolderId && (
        <div className="mt-4 space-y-3">
          {/* New folder button / form */}
          {creatingFolder ? (
            <div className="rounded-lg border border-neutral-300 bg-white p-4">
              <p className="text-sm font-medium text-neutral-900">新しいフォルダを作成</p>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && createNewFolder()}
                  placeholder="フォルダ名を入力"
                  className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
                  autoFocus
                />
                <select
                  value={newFolderClientId || (selectedClientId !== 'all' ? selectedClientId : clients[0]?.id ?? '')}
                  onChange={(e) => setNewFolderClientId(e.target.value)}
                  className="rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
                >
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <button
                  onClick={createNewFolder}
                  disabled={!newFolderName.trim()}
                  className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
                >
                  作成
                </button>
                <button
                  onClick={() => { setCreatingFolder(false); setNewFolderName('') }}
                  className="text-sm text-neutral-400 hover:text-neutral-600"
                >
                  キャンセル
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setCreatingFolder(true)}
              className="w-full rounded-lg border border-dashed border-neutral-300 bg-white p-3 text-center text-sm font-medium text-neutral-500 hover:border-neutral-400 hover:text-neutral-700 transition-colors"
            >
              + 新しいフォルダを作成
            </button>
          )}

          {loading ? (
            <p className="text-sm text-neutral-500">読み込み中...</p>
          ) : folders.length === 0 && unfolderedItems.length === 0 ? (
            <div className="rounded-lg border border-neutral-200 bg-white p-8 text-center shadow-sm">
              <p className="text-neutral-500">ナレッジがありません</p>
              <p className="mt-1 text-sm text-neutral-400">「+ ナレッジを追加」からURL・ファイルを投入してください</p>
            </div>
          ) : (
            <>
              {folders.map((folder) => (
                <div
                  key={folder.id}
                  className="rounded-lg border border-neutral-200 bg-white hover:border-neutral-300 transition-colors"
                >
                  <div className="flex items-center gap-3 p-4">
                    <span className="text-lg">📁</span>
                    {editingFolderId === folder.id ? (
                      <div className="flex flex-1 items-center gap-2">
                        <input
                          type="text"
                          value={editFolderName}
                          onChange={(e) => setEditFolderName(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && renameFolder(folder.id)}
                          className="flex-1 rounded border border-neutral-300 px-2 py-1 text-sm"
                          autoFocus
                        />
                        <button onClick={() => renameFolder(folder.id)} className="text-xs text-neutral-900 hover:underline">保存</button>
                        <button onClick={() => setEditingFolderId(null)} className="text-xs text-neutral-400 hover:underline">キャンセル</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => openFolder(folder.id)}
                        className="flex flex-1 items-center gap-3 text-left"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-neutral-900">{folder.name}</p>
                          <div className="mt-1 flex items-center gap-3 text-xs text-neutral-400">
                            <span>{folder.client_name}</span>
                            <span>{folder.item_count}件</span>
                            <span>{new Date(folder.created_at).toLocaleDateString('ja-JP')}</span>
                          </div>
                        </div>
                        <span className="text-neutral-400">→</span>
                      </button>
                    )}
                    {editingFolderId !== folder.id && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => { setEditingFolderId(folder.id); setEditFolderName(folder.name) }}
                          className="rounded p-1 text-xs text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
                          title="名前変更"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => deleteFolder(folder.id)}
                          className="rounded p-1 text-xs text-neutral-400 hover:bg-red-50 hover:text-red-500"
                          title="削除"
                        >
                          🗑
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* Unfoldered items */}
              {unfolderedItems.length > 0 && (
                <div
                  className="rounded-lg border border-neutral-200 bg-white hover:border-neutral-300 transition-colors cursor-pointer"
                  onClick={() => { setViewMode('list'); setOpenFolderId(null) }}
                >
                  <div className="flex items-center gap-3 p-4">
                    <span className="text-lg">📄</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-neutral-500">未分類</p>
                      <p className="mt-1 text-xs text-neutral-400">{unfolderedItems.length}件</p>
                    </div>
                    <span className="text-neutral-400">→</span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* List view (inside folder or all items) */}
      {(viewMode === 'list' || openFolderId) && (
        <>
          {/* Bulk select */}
          {displayItems.length > 0 && (
            <div className="mt-4 flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-neutral-500">
                <input
                  type="checkbox"
                  checked={selectedIds.size === displayItems.length && displayItems.length > 0}
                  onChange={toggleSelectAll}
                  className="h-4 w-4 rounded border-neutral-300"
                />
                全選択
              </label>
              <span className="text-xs text-neutral-400">{displayItems.length}件</span>
            </div>
          )}

          {/* Knowledge list */}
          <div className="mt-2 space-y-3">
            {loading ? (
              <p className="text-sm text-neutral-500">読み込み中...</p>
            ) : displayItems.length === 0 ? (
              <div className="rounded-lg border border-neutral-200 bg-white p-8 text-center shadow-sm">
                <p className="text-neutral-500">ナレッジがありません</p>
                <p className="mt-1 text-sm text-neutral-400">「+ ナレッジを追加」からURL・ファイルを投入してください</p>
              </div>
            ) : (
              displayItems.map((item) => {
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
        </>
      )}
    </div>
  )
}
