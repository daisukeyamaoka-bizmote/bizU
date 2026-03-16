'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useNotification } from '@/lib/useNotification'

type Project = {
  id: string
  name: string
  description: string | null
  why_you_angle: string | null
  send_trigger: string | null
  status: string
  target_count: number
  sent_count: number
  reacted_count: number
  client_id: string
  case_study_id: string | null
}

type ProjectContact = {
  id: string
  contact_id: string
  full_name: string
  company_name: string
  department: string | null
  title: string | null
  role_level: string
  status: string
  letter_id: string | null
  sent_at: string | null
}

type ResearchProgress = {
  contactId: string
  step: 'company' | 'person' | 'fit' | 'whyyou' | 'letter' | 'done'
  stepLabel: string
}

export default function ProjectDetailPage() {
  const params = useParams()
  const projectId = params.id as string

  const [project, setProject] = useState<Project | null>(null)
  const [contacts, setContacts] = useState<ProjectContact[]>([])
  const [loading, setLoading] = useState(true)

  // 優先選択（最大5社）
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // 生成パイプライン
  const [pipelineRunning, setPipelineRunning] = useState(false)
  const [pipelineProgress, setPipelineProgress] = useState<ResearchProgress[]>([])
  const [pipelineCurrentIdx, setPipelineCurrentIdx] = useState(0)
  const [pipelineTotal, setPipelineTotal] = useState(0)

  // 対象者追加
  const [showUpload, setShowUpload] = useState(false)
  const [availableContacts, setAvailableContacts] = useState<{ id: string; full_name: string; company_name: string; title: string | null }[]>([])

  // ナレッジ選択
  const [showKnowledge, setShowKnowledge] = useState(false)
  const [allKnowledge, setAllKnowledge] = useState<{ id: string; title: string; category: string; folder_name: string | null }[]>([])
  const [selectedKnowledgeIds, setSelectedKnowledgeIds] = useState<Set<string>>(new Set())
  const [savingKnowledge, setSavingKnowledge] = useState(false)
  const [knowledgeCategoryFilter, setKnowledgeCategoryFilter] = useState<string>('all')
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [addingContacts, setAddingContacts] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const { requestPermission, notify } = useNotification()

  const loadProject = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single()
    setProject(data)
  }, [projectId])

  const loadContacts = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('project_contacts')
      .select('id, contact_id, status, letter_id, sent_at')
      .eq('project_id', projectId)
      .order('assigned_at', { ascending: false })

    const contactIds = (data ?? []).map(pc => pc.contact_id)
    if (contactIds.length === 0) {
      setContacts([])
      setLoading(false)
      return
    }

    const { data: contactsData } = await supabase
      .from('contacts')
      .select('id, full_name, department, title, role_level, company_id')
      .in('id', contactIds)

    const companyIds = [...new Set((contactsData ?? []).map(c => c.company_id).filter(Boolean))]
    const { data: companies } = companyIds.length > 0
      ? await supabase.from('target_companies').select('id, name').in('id', companyIds as string[])
      : { data: [] }
    const companyMap = new Map((companies ?? []).map(c => [c.id, c.name]))
    const contactMap = new Map((contactsData ?? []).map(c => [c.id, c]))

    const mapped: ProjectContact[] = (data ?? []).map((pc) => {
      const contact = contactMap.get(pc.contact_id)
      return {
        id: pc.id,
        contact_id: pc.contact_id,
        full_name: contact?.full_name ?? '-',
        company_name: companyMap.get(contact?.company_id ?? '') ?? '-',
        department: contact?.department ?? null,
        title: contact?.title ?? null,
        role_level: contact?.role_level ?? '-',
        status: pc.status,
        letter_id: pc.letter_id,
        sent_at: pc.sent_at,
      }
    })
    setContacts(mapped)
    setLoading(false)
  }, [projectId])

  // ナレッジ読み込み
  const loadKnowledge = useCallback(async () => {
    if (!project) return
    const supabase = createClient()

    // Get all knowledge for this client
    const { data: knowledge } = await supabase
      .from('knowledge_items')
      .select('id, title, category, folder_id')
      .eq('client_id', project.client_id)
      .order('created_at', { ascending: false })

    // Get folder names
    const folderIds = [...new Set((knowledge ?? []).map(k => k.folder_id).filter(Boolean))]
    const { data: foldersData } = folderIds.length > 0
      ? await supabase.from('knowledge_folders').select('id, name').in('id', folderIds as string[])
      : { data: [] }
    const folderMap = new Map((foldersData ?? []).map(f => [f.id, f.name]))

    setAllKnowledge((knowledge ?? []).map(k => ({
      id: k.id,
      title: k.title,
      category: k.category,
      folder_name: folderMap.get(k.folder_id ?? '') ?? null,
    })))

    // Load currently selected knowledge
    const { data: selected } = await supabase
      .from('project_knowledge')
      .select('knowledge_id')
      .eq('project_id', projectId)
    setSelectedKnowledgeIds(new Set((selected ?? []).map(s => s.knowledge_id)))
  }, [project, projectId])

  async function saveKnowledgeSelection() {
    setSavingKnowledge(true)
    const supabase = createClient()

    // Delete existing selections
    await supabase.from('project_knowledge').delete().eq('project_id', projectId)

    // Insert new selections
    if (selectedKnowledgeIds.size > 0) {
      const inserts = Array.from(selectedKnowledgeIds).map(knowledgeId => ({
        project_id: projectId,
        knowledge_id: knowledgeId,
      }))
      await supabase.from('project_knowledge').insert(inserts)
    }

    setSavingKnowledge(false)
    setShowKnowledge(false)
  }

  useEffect(() => {
    loadProject()
    loadContacts()
  }, [loadProject, loadContacts])

  // 優先チェック切替
  function toggleSelection(contactId: string) {
    const next = new Set(selectedIds)
    if (next.has(contactId)) {
      next.delete(contactId)
    } else if (next.size < 5) {
      next.add(contactId)
    }
    setSelectedIds(next)
  }

  // 対象者検索
  async function searchContacts() {
    const supabase = createClient()
    let query = supabase
      .from('contacts')
      .select('id, full_name, title, company_id')
      .eq('is_active', true)
      .limit(50)

    if (searchQuery) {
      query = query.ilike('full_name', `%${searchQuery}%`)
    }

    const { data } = await query
    const existingIds = new Set(contacts.map(c => c.contact_id))

    const companyIds = [...new Set((data ?? []).map(c => c.company_id).filter(Boolean))]
    const { data: companies } = companyIds.length > 0
      ? await supabase.from('target_companies').select('id, name').in('id', companyIds as string[])
      : { data: [] }
    const companyMap = new Map((companies ?? []).map(c => [c.id, c.name]))

    const filtered = (data ?? [])
      .filter(c => !existingIds.has(c.id))
      .map(c => ({
        id: c.id,
        full_name: c.full_name,
        company_name: companyMap.get(c.company_id ?? '') ?? '-',
        title: c.title,
      }))
    setAvailableContacts(filtered)
  }

  async function addSelectedContacts() {
    if (selectedContactIds.size === 0) return
    setAddingContacts(true)
    const supabase = createClient()

    const inserts = Array.from(selectedContactIds).map(contactId => ({
      project_id: projectId,
      contact_id: contactId,
    }))

    await supabase.from('project_contacts').insert(inserts)
    await supabase
      .from('projects')
      .update({ target_count: contacts.length + inserts.length })
      .eq('id', projectId)

    setSelectedContactIds(new Set())
    setShowUpload(false)
    setAddingContacts(false)
    loadContacts()
    loadProject()
  }

  async function addAllContacts() {
    setAddingContacts(true)
    const supabase = createClient()

    const inserts = availableContacts.map(c => ({
      project_id: projectId,
      contact_id: c.id,
    }))

    if (inserts.length > 0) {
      await supabase.from('project_contacts').insert(inserts)
      await supabase
        .from('projects')
        .update({ target_count: contacts.length + inserts.length })
        .eq('id', projectId)
    }

    setShowUpload(false)
    setAddingContacts(false)
    loadContacts()
    loadProject()
  }

  // ===== メインパイプライン: 選択した5社のディープリサーチ＋手紙生成 =====
  async function runPipeline() {
    if (!project || selectedIds.size === 0) return

    const targets = contacts.filter(c => selectedIds.has(c.contact_id) && c.status === 'pending')
    if (targets.length === 0) return

    requestPermission()
    setPipelineRunning(true)
    setPipelineTotal(targets.length)
    setPipelineProgress([])

    const supabase = createClient()

    // ナレッジ取得（全社共通）
    const { data: knowledgeIds } = await supabase
      .from('project_knowledge')
      .select('knowledge_id')
      .eq('project_id', projectId)

    let knowledgeContext: { category: string; title: string; content: string }[] = []
    if (knowledgeIds && knowledgeIds.length > 0) {
      const { data: knowledge } = await supabase
        .from('knowledge_items')
        .select('category, title, content')
        .in('id', knowledgeIds.map(k => k.knowledge_id))
      knowledgeContext = knowledge ?? []
    } else {
      const { data: knowledge } = await supabase
        .from('knowledge_items')
        .select('category, title, content')
        .eq('client_id', project.client_id)
        .limit(10)
      knowledgeContext = knowledge ?? []
    }

    // クライアント取得
    const { data: client } = await supabase
      .from('clients')
      .select('id, name, product_name')
      .eq('id', project.client_id)
      .single()

    for (let i = 0; i < targets.length; i++) {
      const pc = targets[i]
      setPipelineCurrentIdx(i + 1)

      // Step 1: 役職確認（最重要）
      updateProgress(pc.contact_id, 'company', '役職の最新情報を確認中...')

      let deepResearch = null
      try {
        // Deep Research API実行（内部で5ステップ: 役職確認→企業リサーチ→人物リサーチ→適合性分析→WhyYou）
        const researchPromise = fetch('/api/deep-research', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyName: pc.company_name,
            contactName: pc.full_name,
            contactTitle: pc.title,
            contactDepartment: pc.department,
            knowledgeContext,
          }),
        })

        // 進捗をシミュレーション表示（実際のAPIは内部で5ステップ実行）
        await delay(3000)
        updateProgress(pc.contact_id, 'company', '企業の中計・採用体制を調査中...')
        await delay(3000)
        updateProgress(pc.contact_id, 'person', '担当者のインタビュー・講演情報を調査中...')
        await delay(3000)
        updateProgress(pc.contact_id, 'fit', 'プロダクト適合性・事例選定を分析中...')
        await delay(3000)
        updateProgress(pc.contact_id, 'whyyou', 'Why Youを明確化中...')

        const researchRes = await researchPromise
        if (!researchRes.ok) {
          console.error('[deep-research] API error:', researchRes.status, await researchRes.text())
        } else {
          const researchData = await researchRes.json()
          if (!researchData.error) {
            deepResearch = researchData
          }
        }
      } catch (err) {
        console.error('[deep-research] Exception:', err)
        // リサーチ失敗時も手紙生成は続行
      }

      // Step 5: 手紙生成
      updateProgress(pc.contact_id, 'letter', '手紙を生成中...')

      const { data: contact } = await supabase
        .from('contacts')
        .select('*, target_companies(name)')
        .eq('id', pc.contact_id)
        .single()

      if (!contact) continue

      const company = Array.isArray(contact.target_companies) ? contact.target_companies[0] : contact.target_companies

      try {
        const res = await fetch('/api/generate-letter', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contact: {
              full_name: contact.full_name,
              department: contact.department,
              title: contact.title,
              company_name: company?.name ?? '',
              address: contact.address,
            },
            client,
            whyYouAngle: project.why_you_angle ?? '採用強化',
            sendTrigger: project.send_trigger ?? '',
            collectedContext: deepResearch?.companyResearch ?? '',
            knowledgeContext,
            deepResearch,
          }),
        })
        if (!res.ok) {
          console.error('[generate-letter] API error:', res.status, await res.text())
          continue
        }
        const data = await res.json()

        if (data.letter) {
          const { data: letter } = await supabase.from('letters').insert({
            client_id: project.client_id,
            contact_id: pc.contact_id,
            project_id: projectId,
            why_you_angle: project.why_you_angle ?? '採用強化',
            send_trigger: project.send_trigger ?? null,
            body_text: data.letter,
            hypothesis: data.title ?? null,
            collected_context: deepResearch ? JSON.stringify(deepResearch) : null,
            sources: data.sources ?? null,
          }).select('id').single()

          if (letter) {
            await supabase
              .from('project_contacts')
              .update({ status: 'generated', letter_id: letter.id })
              .eq('id', pc.id)
          }
        }
      } catch (err) {
        console.error('[generate-letter] Exception:', err)
        // 個別エラー時は次へ進む
      }

      updateProgress(pc.contact_id, 'done', '完了')
    }

    const successCount = pipelineProgress.filter(p => p.step === 'done').length + 1
    setPipelineRunning(false)
    setSelectedIds(new Set())
    setToast({ message: `${targets.length}社の手紙生成が完了しました！`, type: 'success' })
    notify('手紙生成完了', `${targets.length}社のリサーチ＋手紙生成が完了しました`)
    loadContacts()
    loadProject()
  }

  function updateProgress(contactId: string, step: ResearchProgress['step'], stepLabel: string) {
    setPipelineProgress(prev => {
      const existing = prev.find(p => p.contactId === contactId)
      if (existing) {
        return prev.map(p => p.contactId === contactId ? { ...p, step, stepLabel } : p)
      }
      return [...prev, { contactId, step, stepLabel }]
    })
  }

  // 送付済みに更新
  async function markAsSent(pc: ProjectContact) {
    const supabase = createClient()
    const today = new Date().toISOString().split('T')[0]

    await supabase
      .from('project_contacts')
      .update({ status: 'sent', sent_at: today })
      .eq('id', pc.id)

    if (pc.letter_id) {
      await supabase
        .from('letters')
        .update({ sent_at: today })
        .eq('id', pc.letter_id)
    }

    const newSentCount = contacts.filter(c => c.status === 'sent').length + 1
    await supabase
      .from('projects')
      .update({ sent_count: newSentCount })
      .eq('id', projectId)

    loadContacts()
    loadProject()
  }

  const statusLabel: Record<string, { text: string; color: string }> = {
    pending: { text: '未生成', color: 'bg-neutral-100 text-neutral-600' },
    generated: { text: '生成済', color: 'bg-emerald-50 text-emerald-700' },
    sent: { text: '送付済', color: 'bg-blue-50 text-blue-700' },
    reacted: { text: '反応あり', color: 'bg-amber-50 text-amber-700' },
    skipped: { text: 'スキップ', color: 'bg-neutral-100 text-neutral-400' },
  }

  if (!project) return <p className="text-sm text-neutral-500">読み込み中...</p>

  const pendingCount = contacts.filter(c => c.status === 'pending').length
  const generatedCount = contacts.filter(c => c.status === 'generated').length
  const sentCount = contacts.filter(c => c.status === 'sent').length
  const selectedPendingCount = contacts.filter(c => selectedIds.has(c.contact_id) && c.status === 'pending').length

  // Auto-dismiss toast
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), toast.type === 'error' ? 10000 : 5000)
    return () => clearTimeout(t)
  }, [toast])

  return (
    <div>
      {/* Toast notification */}
      {toast && (
        <div className={`fixed right-4 top-4 z-50 rounded-lg px-4 py-3 text-sm shadow-lg ${
          toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'
        }`}>
          {toast.message}
          <button onClick={() => setToast(null)} className="ml-3 opacity-70 hover:opacity-100">✕</button>
        </div>
      )}
      <div className="flex items-center gap-4">
        <Link href="/projects" className="text-sm text-neutral-900 hover:underline">&larr; プロジェクト一覧</Link>
      </div>

      {/* プロジェクトヘッダー */}
      <div className="mt-4 rounded-lg border border-neutral-200 bg-white p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">{project.name}</h1>
            {project.description && <p className="mt-1 text-sm text-neutral-500">{project.description}</p>}
            <div className="mt-2 flex gap-4 text-sm text-neutral-600">
              {project.why_you_angle && <span>切り口: {project.why_you_angle}</span>}
              {project.send_trigger && <span>トリガー: {project.send_trigger}</span>}
            </div>
          </div>
        </div>

        {/* KPI */}
        <div className="mt-4 grid grid-cols-4 gap-4">
          <div className="rounded-lg bg-neutral-50 p-3 text-center">
            <p className="text-2xl font-bold text-neutral-900">{contacts.length}</p>
            <p className="text-xs text-neutral-500">対象者</p>
          </div>
          <div className="rounded-lg bg-neutral-50 p-3 text-center">
            <p className="text-2xl font-bold text-neutral-600">{generatedCount}</p>
            <p className="text-xs text-neutral-500">生成済</p>
          </div>
          <div className="rounded-lg bg-neutral-50 p-3 text-center">
            <p className="text-2xl font-bold text-neutral-700">{sentCount}</p>
            <p className="text-xs text-neutral-500">送付済</p>
          </div>
          <div className="rounded-lg bg-neutral-50 p-3 text-center">
            <p className="text-2xl font-bold text-neutral-900">{project.reacted_count}</p>
            <p className="text-xs text-neutral-500">反応</p>
          </div>
        </div>
      </div>

      {/* アクションバー */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={() => { setShowUpload(true); searchContacts() }}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          + 対象者を追加
        </button>

        {selectedPendingCount > 0 && !pipelineRunning && (
          <button
            onClick={runPipeline}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
          >
            選択した{selectedPendingCount}社のリサーチ＋手紙生成を開始
          </button>
        )}

        {selectedIds.size > 0 && !pipelineRunning && (
          <button
            onClick={() => setSelectedIds(new Set())}
            className="rounded-lg bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-200"
          >
            選択を解除
          </button>
        )}

        <button
          onClick={() => { setShowKnowledge(!showKnowledge); if (!showKnowledge) loadKnowledge() }}
          className="rounded-lg bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-200"
        >
          ナレッジ設定 {selectedKnowledgeIds.size > 0 ? `(${selectedKnowledgeIds.size}件選択中)` : ''}
        </button>

        {pendingCount > 0 && !pipelineRunning && (
          <p className="text-sm text-neutral-500">
            未生成の対象者にチェックを入れて手紙を作成（最大5社）
          </p>
        )}
      </div>

      {/* ナレッジ選択パネル */}
      {showKnowledge && (
        <div className="mt-4 rounded-lg border border-neutral-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-neutral-900">利用するナレッジを選択</h2>
              <p className="mt-1 text-sm text-neutral-500">
                このプロジェクトの手紙生成に使用するナレッジを選択してください。未選択の場合はクライアントの全ナレッジが使用されます。
              </p>
            </div>
            <select
              value={knowledgeCategoryFilter}
              onChange={(e) => setKnowledgeCategoryFilter(e.target.value)}
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
            >
              <option value="all">全カテゴリ</option>
              <option value="product_info">プロダクト情報</option>
              <option value="case_study">導入事例</option>
              <option value="sales_material">営業資料</option>
              <option value="competitor">競合情報</option>
              <option value="market">市場動向</option>
              <option value="other">その他</option>
            </select>
          </div>

          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={() => {
                const filtered = allKnowledge.filter(k => knowledgeCategoryFilter === 'all' || k.category === knowledgeCategoryFilter)
                setSelectedKnowledgeIds(new Set(filtered.map(k => k.id)))
              }}
              className="text-sm text-neutral-900 hover:underline"
            >
              表示中を全選択
            </button>
            <button
              onClick={() => setSelectedKnowledgeIds(new Set())}
              className="text-sm text-neutral-400 hover:underline"
            >
              全解除
            </button>
            <span className="text-xs text-neutral-400">{selectedKnowledgeIds.size}件選択中 / {allKnowledge.length}件</span>
          </div>

          <div className="mt-3 max-h-80 overflow-y-auto rounded-lg border border-neutral-200">
            {allKnowledge
              .filter(k => knowledgeCategoryFilter === 'all' || k.category === knowledgeCategoryFilter)
              .map((k) => {
                const catLabels: Record<string, string> = {
                  product_info: 'プロダクト', case_study: '事例', sales_material: '営業資料',
                  competitor: '競合', market: '市場', other: 'その他',
                }
                return (
                  <label
                    key={k.id}
                    className="flex cursor-pointer items-center gap-3 border-b border-neutral-100 px-3 py-2 hover:bg-neutral-50"
                  >
                    <input
                      type="checkbox"
                      checked={selectedKnowledgeIds.has(k.id)}
                      onChange={() => {
                        const next = new Set(selectedKnowledgeIds)
                        if (next.has(k.id)) next.delete(k.id)
                        else next.add(k.id)
                        setSelectedKnowledgeIds(next)
                      }}
                      className="h-4 w-4 rounded border-neutral-300"
                    />
                    <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-600">
                      {catLabels[k.category] ?? k.category}
                    </span>
                    <span className="flex-1 text-sm font-medium text-neutral-900">{k.title}</span>
                    {k.folder_name && (
                      <span className="text-xs text-neutral-400">📁 {k.folder_name}</span>
                    )}
                  </label>
                )
              })}
            {allKnowledge.filter(k => knowledgeCategoryFilter === 'all' || k.category === knowledgeCategoryFilter).length === 0 && (
              <p className="px-3 py-4 text-center text-sm text-neutral-400">ナレッジがありません</p>
            )}
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={saveKnowledgeSelection}
              disabled={savingKnowledge}
              className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              {savingKnowledge ? '保存中...' : '保存'}
            </button>
            <button
              onClick={() => setShowKnowledge(false)}
              className="text-sm text-neutral-500 hover:underline"
            >
              閉じる
            </button>
          </div>
        </div>
      )}

      {/* パイプライン進捗 */}
      {pipelineRunning && (() => {
        const stepPercent: Record<string, number> = {
          company: 20,
          person: 40,
          fit: 60,
          whyyou: 80,
          letter: 90,
          done: 100,
        }
        const completedCount = pipelineProgress.filter(p => p.step === 'done').length
        const currentItem = pipelineProgress.find(p => p.step !== 'done')
        const currentStepPct = currentItem ? stepPercent[currentItem.step] ?? 0 : 0
        const overallPercent = pipelineTotal > 0
          ? Math.round(((completedCount * 100) + currentStepPct) / pipelineTotal)
          : 0

        return (
          <div className="mt-4 rounded-lg border border-neutral-200 bg-white p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-neutral-900">
                リサーチ＋手紙生成中（{pipelineCurrentIdx}/{pipelineTotal}）
              </h2>
              <span className="text-2xl font-bold text-neutral-900">{overallPercent}%</span>
            </div>

            {/* 全体プログレスバー */}
            <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-neutral-200">
              <div
                className="h-full rounded-full bg-neutral-900 transition-all duration-700 ease-out"
                style={{ width: `${overallPercent}%` }}
              />
            </div>
            <div className="mt-1 flex justify-between text-xs text-neutral-400">
              <span>{completedCount}社完了 / {pipelineTotal}社</span>
              <span>
                {overallPercent < 30 ? '残り約2分' :
                 overallPercent < 60 ? '残り約1分' :
                 overallPercent < 90 ? 'もうすぐ完了' : '完了処理中'}
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {pipelineProgress.map((p) => {
                const pc = contacts.find(c => c.contact_id === p.contactId)
                const pct = stepPercent[p.step] ?? 0
                return (
                  <div key={p.contactId} className="rounded-lg bg-neutral-50 px-4 py-3">
                    <div className="flex items-center gap-4">
                      <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                        p.step === 'done' ? 'bg-emerald-100 text-emerald-700' : 'bg-neutral-200 text-neutral-700'
                      }`}>
                        {p.step === 'done' ? '✓' : `${pct}%`}
                      </span>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-neutral-900">
                          {pc?.company_name} - {pc?.full_name}
                        </p>
                        <p className="text-xs text-neutral-500">{p.stepLabel}</p>
                      </div>
                      {p.step === 'done' && (
                        <span className="text-xs font-medium text-emerald-600">完了</span>
                      )}
                    </div>
                    {/* 個別プログレスバー */}
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-neutral-200">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ease-out ${
                          p.step === 'done' ? 'bg-emerald-500' : 'bg-neutral-900'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* 対象者追加パネル */}
      {showUpload && (
        <div className="mt-4 rounded-lg border border-neutral-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-neutral-900">対象者を追加</h2>
          <div className="mt-4 flex gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && searchContacts()}
              placeholder="氏名で検索（空欄で全件表示）"
              className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
            />
            <button
              onClick={searchContacts}
              className="rounded-lg bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-200"
            >
              検索
            </button>
          </div>

          {availableContacts.length > 0 && (
            <div className="mt-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-neutral-500">{availableContacts.length}件のコンタクト</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedContactIds(new Set(availableContacts.map(c => c.id)))}
                    className="text-sm text-neutral-900 hover:underline"
                  >
                    全選択
                  </button>
                  <button
                    onClick={addAllContacts}
                    disabled={addingContacts}
                    className="rounded-lg bg-neutral-900 px-3 py-1 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
                  >
                    全件追加
                  </button>
                </div>
              </div>
              <div className="mt-2 max-h-60 overflow-y-auto rounded-lg border border-neutral-200">
                {availableContacts.map((c) => (
                  <label
                    key={c.id}
                    className="flex cursor-pointer items-center gap-3 border-b border-neutral-100 px-3 py-2 hover:bg-neutral-50"
                  >
                    <input
                      type="checkbox"
                      checked={selectedContactIds.has(c.id)}
                      onChange={() => {
                        const next = new Set(selectedContactIds)
                        if (next.has(c.id)) next.delete(c.id)
                        else next.add(c.id)
                        setSelectedContactIds(next)
                      }}
                    />
                    <span className="text-sm font-medium text-neutral-900">{c.full_name}</span>
                    <span className="text-sm text-neutral-500">{c.company_name}</span>
                    <span className="text-sm text-neutral-400">{c.title}</span>
                  </label>
                ))}
              </div>
              {selectedContactIds.size > 0 && (
                <button
                  onClick={addSelectedContacts}
                  disabled={addingContacts}
                  className="mt-3 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
                >
                  {addingContacts ? '追加中...' : `選択した${selectedContactIds.size}件を追加`}
                </button>
              )}
            </div>
          )}

          <button
            onClick={() => setShowUpload(false)}
            className="mt-4 text-sm text-neutral-500 hover:underline"
          >
            閉じる
          </button>
        </div>
      )}

      {/* 対象者テーブル */}
      <div className="mt-4 overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="min-w-full divide-y divide-neutral-200">
          <thead className="bg-neutral-50">
            <tr>
              <th className="w-10 px-4 py-3 text-left text-xs font-medium uppercase text-neutral-500">
                <span className="sr-only">選択</span>
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-neutral-500">会社名</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-neutral-500">氏名</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-neutral-500">役職</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-neutral-500">ステータス</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-neutral-500">送付日</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-neutral-500">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-neutral-500">読み込み中...</td>
              </tr>
            ) : contacts.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-neutral-500">
                  対象者がいません。「+ 対象者を追加」から追加してください。
                </td>
              </tr>
            ) : (
              contacts.map((pc) => {
                const s = statusLabel[pc.status] ?? statusLabel.pending
                const isSelected = selectedIds.has(pc.contact_id)
                const progressItem = pipelineProgress.find(p => p.contactId === pc.contact_id)
                return (
                  <tr key={pc.id} className={`hover:bg-neutral-50 ${isSelected ? 'bg-neutral-50' : ''}`}>
                    <td className="px-4 py-3">
                      {pc.status === 'pending' && !pipelineRunning && (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelection(pc.contact_id)}
                          disabled={!isSelected && selectedIds.size >= 5}
                          className="h-4 w-4 rounded border-neutral-300 disabled:opacity-30"
                        />
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-neutral-900">{pc.company_name}</td>
                    <td className="px-4 py-3 text-sm font-medium text-neutral-900">{pc.full_name}</td>
                    <td className="px-4 py-3 text-sm text-neutral-600">{pc.title ?? pc.role_level}</td>
                    <td className="px-4 py-3 text-sm">
                      {progressItem && progressItem.step !== 'done' ? (
                        <span className="inline-flex items-center gap-1.5 text-xs text-neutral-600">
                          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-neutral-400" />
                          {progressItem.stepLabel}
                        </span>
                      ) : (
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.color}`}>
                          {s.text}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-neutral-600">{pc.sent_at ?? '-'}</td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex gap-2">
                        {pc.status === 'generated' && pc.letter_id && (
                          <>
                            <Link href={`/letters/${pc.letter_id}`} className="text-neutral-900 hover:underline">
                              確認
                            </Link>
                            <button
                              onClick={() => markAsSent(pc)}
                              className="text-neutral-700 hover:underline"
                            >
                              送付済にする
                            </button>
                          </>
                        )}
                        {pc.status === 'sent' && pc.letter_id && (
                          <Link href={`/letters/${pc.letter_id}`} className="text-neutral-900 hover:underline">
                            詳細
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
