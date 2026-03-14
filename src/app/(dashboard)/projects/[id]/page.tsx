'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

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
  title: string | null
  role_level: string
  status: string
  letter_id: string | null
  sent_at: string | null
}

export default function ProjectDetailPage() {
  const params = useParams()
  const projectId = params.id as string

  const [project, setProject] = useState<Project | null>(null)
  const [contacts, setContacts] = useState<ProjectContact[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [generatingId, setGeneratingId] = useState<string | null>(null)
  const [bulkGenerating, setBulkGenerating] = useState(false)
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 })

  // CSV Upload
  const [showUpload, setShowUpload] = useState(false)
  const [availableContacts, setAvailableContacts] = useState<{ id: string; full_name: string; company_name: string; title: string | null }[]>([])
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [addingContacts, setAddingContacts] = useState(false)

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
      .select('id, full_name, title, role_level, company_id')
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

  useEffect(() => {
    loadProject()
    loadContacts()
  }, [loadProject, loadContacts])

  // コンタクトを検索して追加
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

    // Update target count
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

  // 全コンタクトを一括追加
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

  // 1件の手紙を生成
  async function generateLetterForContact(pc: ProjectContact) {
    if (!project) return
    setGeneratingId(pc.contact_id)

    const supabase = createClient()

    // Get contact and company details
    const { data: contact } = await supabase
      .from('contacts')
      .select('*, target_companies(name)')
      .eq('id', pc.contact_id)
      .single()

    if (!contact) { setGeneratingId(null); return }

    const company = Array.isArray(contact.target_companies) ? contact.target_companies[0] : contact.target_companies

    // Get client
    const { data: client } = await supabase
      .from('clients')
      .select('id, name, product_name')
      .eq('id', project.client_id)
      .single()

    // Get case study
    let caseStudy = null
    if (project.case_study_id) {
      const { data } = await supabase
        .from('case_studies')
        .select('company_name, challenge_tags, result_summary')
        .eq('id', project.case_study_id)
        .single()
      caseStudy = data
    }

    // Get knowledge context for this client
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
      // Fallback: use all knowledge for this client
      const { data: knowledge } = await supabase
        .from('knowledge_items')
        .select('category, title, content')
        .eq('client_id', project.client_id)
        .limit(10)
      knowledgeContext = knowledge ?? []
    }

    // Generate letter
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
        caseStudy,
        whyYouAngle: project.why_you_angle ?? '採用強化',
        sendTrigger: project.send_trigger ?? '',
        collectedContext: '',
        knowledgeContext,
      }),
    })
    const data = await res.json()

    if (data.letter) {
      // Save letter
      const { data: letter } = await supabase.from('letters').insert({
        client_id: project.client_id,
        contact_id: pc.contact_id,
        case_study_id: project.case_study_id,
        project_id: projectId,
        why_you_angle: project.why_you_angle ?? '採用強化',
        send_trigger: project.send_trigger ?? null,
        body_text: data.letter,
      }).select('id').single()

      // Update project_contact
      if (letter) {
        await supabase
          .from('project_contacts')
          .update({ status: 'generated', letter_id: letter.id })
          .eq('id', pc.id)
      }
    }

    setGeneratingId(null)
    loadContacts()
  }

  // 一括生成
  async function bulkGenerate() {
    const pending = contacts.filter(c => c.status === 'pending')
    if (pending.length === 0) return

    setBulkGenerating(true)
    setBulkProgress({ current: 0, total: pending.length })

    for (let i = 0; i < pending.length; i++) {
      setBulkProgress({ current: i + 1, total: pending.length })
      await generateLetterForContact(pending[i])
    }

    setBulkGenerating(false)
    loadProject()
  }

  // ステータスを「送付済み」に更新
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

    // Update sent count
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
    generated: { text: '生成済', color: 'bg-neutral-100 text-neutral-700' },
    sent: { text: '送付済', color: 'bg-neutral-100 text-neutral-700' },
    reacted: { text: '反応あり', color: 'bg-neutral-100 text-neutral-700' },
    skipped: { text: 'スキップ', color: 'bg-neutral-100 text-neutral-400' },
  }

  if (!project) return <p className="text-sm text-neutral-500">読み込み中...</p>

  const pendingCount = contacts.filter(c => c.status === 'pending').length
  const generatedCount = contacts.filter(c => c.status === 'generated').length
  const sentCount = contacts.filter(c => c.status === 'sent').length

  return (
    <div>
      <div className="flex items-center gap-4">
        <Link href="/projects" className="text-sm text-neutral-900 hover:underline">← プロジェクト一覧</Link>
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
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          onClick={() => { setShowUpload(true); searchContacts() }}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          + 対象者を追加
        </button>
        {pendingCount > 0 && (
          <button
            onClick={bulkGenerate}
            disabled={bulkGenerating}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            {bulkGenerating
              ? `一括生成中... (${bulkProgress.current}/${bulkProgress.total})`
              : `未生成 ${pendingCount}件を一括生成`
            }
          </button>
        )}
      </div>

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
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-neutral-500">読み込み中...</td>
              </tr>
            ) : contacts.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-neutral-500">
                  対象者がいません。「+ 対象者を追加」から追加してください。
                </td>
              </tr>
            ) : (
              contacts.map((pc) => {
                const s = statusLabel[pc.status] ?? statusLabel.pending
                return (
                  <tr key={pc.id} className="hover:bg-neutral-50">
                    <td className="px-4 py-3 text-sm text-neutral-900">{pc.company_name}</td>
                    <td className="px-4 py-3 text-sm font-medium text-neutral-900">{pc.full_name}</td>
                    <td className="px-4 py-3 text-sm text-neutral-600">{pc.title ?? pc.role_level}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.color}`}>
                        {s.text}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-neutral-600">{pc.sent_at ?? '-'}</td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex gap-2">
                        {pc.status === 'pending' && (
                          <button
                            onClick={() => generateLetterForContact(pc)}
                            disabled={generatingId === pc.contact_id}
                            className="text-neutral-900 hover:underline disabled:opacity-50"
                          >
                            {generatingId === pc.contact_id ? '生成中...' : '生成'}
                          </button>
                        )}
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
