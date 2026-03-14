'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { WHY_YOU_ANGLES, SEND_TRIGGERS } from '@/lib/constants'

type ProjectRow = {
  id: string
  name: string
  client_name: string
  status: string
  why_you_angle: string | null
  target_count: number
  sent_count: number
  reacted_count: number
  created_at: string
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [clients, setClients] = useState<{ id: string; name: string }[]>([])

  // Form
  const [formClientId, setFormClientId] = useState('')
  const [formName, setFormName] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formWhyYou, setFormWhyYou] = useState<string>(WHY_YOU_ANGLES[0])
  const [formTrigger, setFormTrigger] = useState<string>(SEND_TRIGGERS[0])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadProjects()
    loadClients()
  }, [])

  async function loadClients() {
    const supabase = createClient()
    const { data } = await supabase.from('clients').select('id, name').eq('status', 'active') as { data: { id: string; name: string }[] | null }
    setClients(data ?? [])
    if (data?.[0]) setFormClientId(data[0].id)
  }

  async function loadProjects() {
    const supabase = createClient()
    const { data } = await supabase
      .from('projects')
      .select('id, name, client_id, status, why_you_angle, target_count, sent_count, reacted_count, created_at')
      .order('created_at', { ascending: false })

    const clientIds = [...new Set((data ?? []).map(p => p.client_id).filter(Boolean))]
    const { data: clientsData } = clientIds.length > 0
      ? await supabase.from('clients').select('id, name').in('id', clientIds as string[])
      : { data: [] }
    const clientMap = new Map((clientsData ?? []).map(c => [c.id, c.name]))

    const mapped: ProjectRow[] = (data ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      client_name: clientMap.get(p.client_id ?? '') ?? '-',
      status: p.status,
      why_you_angle: p.why_you_angle,
      target_count: p.target_count ?? 0,
      sent_count: p.sent_count ?? 0,
      reacted_count: p.reacted_count ?? 0,
      created_at: p.created_at,
    }))
    setProjects(mapped)
    setLoading(false)
  }

  async function handleCreate() {
    setSaving(true)
    const supabase = createClient()
    await supabase.from('projects').insert({
      client_id: formClientId,
      name: formName,
      description: formDescription || null,
      why_you_angle: formWhyYou,
      send_trigger: formTrigger,
    })
    setShowForm(false)
    setFormName('')
    setFormDescription('')
    setSaving(false)
    loadProjects()
  }

  const statusLabel: Record<string, { text: string; color: string }> = {
    draft: { text: '下書き', color: 'bg-neutral-100 text-neutral-700' },
    active: { text: '進行中', color: 'bg-neutral-100 text-neutral-700' },
    completed: { text: '完了', color: 'bg-neutral-100 text-neutral-700' },
    archived: { text: 'アーカイブ', color: 'bg-neutral-100 text-neutral-500' },
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-neutral-900">プロジェクト管理</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          + 新規プロジェクト
        </button>
      </div>

      {showForm && (
        <div className="mt-4 rounded-lg border border-neutral-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-neutral-900">新規プロジェクト作成</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-neutral-700">プロジェクト名</label>
              <input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="2026年3月 製造業向け施策"
                className="mt-1 block w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700">クライアント</label>
              <select
                value={formClientId}
                onChange={(e) => setFormClientId(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700">Why Youの切り口</label>
              <select
                value={formWhyYou}
                onChange={(e) => setFormWhyYou(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
              >
                {WHY_YOU_ANGLES.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700">送付トリガー</label>
              <select
                value={formTrigger}
                onChange={(e) => setFormTrigger(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
              >
                {SEND_TRIGGERS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-neutral-700">説明（任意）</label>
              <textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                rows={2}
                className="mt-1 block w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
              />
            </div>
          </div>
          <div className="mt-4 flex gap-3">
            <button
              onClick={handleCreate}
              disabled={saving || !formName}
              className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              {saving ? '作成中...' : '作成する'}
            </button>
            <button onClick={() => setShowForm(false)} className="rounded-lg bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-700">
              キャンセル
            </button>
          </div>
        </div>
      )}

      {/* プロジェクト一覧 */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          <p className="text-sm text-neutral-500">読み込み中...</p>
        ) : projects.length === 0 ? (
          <p className="text-sm text-neutral-500">プロジェクトがありません</p>
        ) : (
          projects.map((p) => {
            const s = statusLabel[p.status] ?? statusLabel.draft
            const progress = p.target_count > 0 ? Math.round((p.sent_count / p.target_count) * 100) : 0
            return (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                className="block rounded-lg border border-neutral-200 bg-white p-5 transition-shadow hover:shadow"
              >
                <div className="flex items-start justify-between">
                  <h3 className="font-semibold text-neutral-900">{p.name}</h3>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.color}`}>
                    {s.text}
                  </span>
                </div>
                <p className="mt-1 text-sm text-neutral-500">{p.client_name}</p>
                {p.why_you_angle && (
                  <p className="mt-1 text-xs text-neutral-400">切り口: {p.why_you_angle}</p>
                )}

                {/* 進捗バー */}
                <div className="mt-4">
                  <div className="flex justify-between text-xs text-neutral-500">
                    <span>送付進捗</span>
                    <span>{p.sent_count} / {p.target_count}件 ({progress}%)</span>
                  </div>
                  <div className="mt-1 h-2 w-full rounded-full bg-neutral-100">
                    <div
                      className="h-2 rounded-full bg-neutral-900 transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>

                <div className="mt-3 flex gap-4 text-xs text-neutral-500">
                  <span>対象: {p.target_count}件</span>
                  <span>送付: {p.sent_count}件</span>
                  <span>反応: {p.reacted_count}件</span>
                </div>
              </Link>
            )
          })
        )}
      </div>
    </div>
  )
}
