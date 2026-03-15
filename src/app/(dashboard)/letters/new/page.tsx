'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { WHY_YOU_ANGLES } from '@/lib/constants'
import { useNotification } from '@/lib/useNotification'

type Contact = {
  id: string
  full_name: string
  department: string | null
  title: string | null
  company_name: string
  address: string | null
}

type Client = {
  id: string
  name: string
  product_name: string | null
}

export default function NewLetterPage() {
  const router = useRouter()
  const { requestPermission, notify } = useNotification()

  useEffect(() => {
    requestPermission()
  }, [requestPermission])

  const [contacts, setContacts] = useState<Contact[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [contactSearch, setContactSearch] = useState('')
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
  const [selectedClient, setSelectedClient] = useState<string>('')
  const [whyYouAngle, setWhyYouAngle] = useState<string>(WHY_YOU_ANGLES[0])
  const [customAngle, setCustomAngle] = useState('')
  const [collectedContext, setCollectedContext] = useState('')
  const [generatedLetter, setGeneratedLetter] = useState('')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [generatedSources, setGeneratedSources] = useState<any[] | null>(null)
  const [generating, setGenerating] = useState(false)
  const [generatingProgress, setGeneratingProgress] = useState(0)
  const [generatingPhase, setGeneratingPhase] = useState('')
  const [collectingInfo, setCollectingInfo] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    loadClients()
  }, [])

  async function loadClients() {
    const supabase = createClient()
    const { data } = await supabase
      .from('clients')
      .select('id, name, product_name')
      .eq('status', 'active')
    setClients(data ?? [])
    if (data?.[0]) setSelectedClient(data[0].id)
  }

  async function searchContacts() {
    if (!contactSearch.trim()) return
    const supabase = createClient()
    const { data } = await supabase
      .from('contacts')
      .select('id, full_name, department, title, target_companies(name), address')
      .ilike('full_name', `%${contactSearch}%`)
      .eq('is_active', true)
      .limit(10)

    const mapped: Contact[] = (data ?? []).map((c) => {
      const company = Array.isArray(c.target_companies) ? c.target_companies[0] : c.target_companies
      return {
        id: c.id,
        full_name: c.full_name,
        department: c.department,
        title: c.title,
        company_name: company?.name ?? '',
        address: c.address,
      }
    })
    setContacts(mapped)
  }

  async function collectInfo() {
    if (!selectedContact) return
    setCollectingInfo(true)
    try {
      const res = await fetch('/api/collect-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyName: selectedContact.company_name }),
      })
      const data = await res.json()
      setCollectedContext(data.context ?? '')
    } catch {
      setCollectedContext('情報収集に失敗しました。')
    }
    setCollectingInfo(false)
  }

  async function generateLetter() {
    if (!selectedContact || !selectedClient) return
    setGenerating(true)
    setGeneratingProgress(0)
    setGeneratingPhase('ナレッジを取得中...')

    const client = clients.find(c => c.id === selectedClient)

    // ナレッジコンテキストを取得（事例情報含む）
    const supabase = createClient()
    const { data: knowledge } = await supabase
      .from('knowledge_items')
      .select('category, title, content')
      .eq('client_id', selectedClient)
      .limit(20)
    const knowledgeContext = knowledge ?? []

    setGeneratingProgress(10)
    setGeneratingPhase('AIが手紙を作成中...')

    // プログレスアニメーション
    const progressInterval = setInterval(() => {
      setGeneratingProgress(prev => {
        if (prev >= 85) { clearInterval(progressInterval); return 85 }
        return prev + 1
      })
    }, 500)

    const phaseTimeout1 = setTimeout(() => setGeneratingPhase('企業情報を分析中...'), 5000)
    const phaseTimeout2 = setTimeout(() => setGeneratingPhase('パーソナライズ文面を構成中...'), 15000)
    const phaseTimeout3 = setTimeout(() => setGeneratingPhase('文章を推敲中...'), 25000)

    try {
      const res = await fetch('/api/generate-letter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact: selectedContact,
          client,
          whyYouAngle: whyYouAngle === 'その他' ? customAngle : whyYouAngle,
          sendTrigger: '',
          collectedContext,
          knowledgeContext,
        }),
      })
      clearInterval(progressInterval)
      clearTimeout(phaseTimeout1)
      clearTimeout(phaseTimeout2)
      clearTimeout(phaseTimeout3)
      setGeneratingProgress(95)
      setGeneratingPhase('完了処理中...')

      const data = await res.json()
      setGeneratingProgress(100)
      setGeneratedLetter(data.letter ?? '')
      setGeneratedSources(data.sources ?? null)
      notify('手紙生成完了', `${selectedContact.full_name}宛の手紙が生成されました`)
    } catch {
      clearInterval(progressInterval)
      clearTimeout(phaseTimeout1)
      clearTimeout(phaseTimeout2)
      clearTimeout(phaseTimeout3)
      setGeneratedLetter('生成に失敗しました。')
      notify('手紙生成エラー', '生成に失敗しました')
    }
    setGenerating(false)
    setGeneratingProgress(0)
    setGeneratingPhase('')
  }

  async function saveLetter() {
    if (!selectedContact || !generatedLetter) return
    const supabase = createClient()
    const { data: savedLetter } = await supabase.from('letters').insert({
      client_id: selectedClient,
      contact_id: selectedContact.id,
      why_you_angle: whyYouAngle === 'その他' ? customAngle : whyYouAngle,
      collected_context: collectedContext,
      body_text: generatedLetter,
      sources: generatedSources,
    }).select('id').single()
    setSaved(true)
    await downloadDocx()
    if (savedLetter?.id) {
      router.push(`/letters/${savedLetter.id}/review`)
    } else {
      router.push('/letters')
    }
  }

  async function downloadDocx() {
    if (!selectedContact || !generatedLetter) return
    const client = clients.find(c => c.id === selectedClient)

    const res = await fetch('/api/generate-docx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contact: selectedContact,
        clientName: client?.name ?? '',
        bodyText: generatedLetter,
      }),
    })
    const blob = await res.blob()

    const now = new Date()
    const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`
    const fileName = `${client?.name ?? ''}手紙施策_${yyyymm}_${selectedContact.company_name} ${selectedContact.department ?? ''} ${selectedContact.title ?? ''} ${selectedContact.full_name} 様.docx`

    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-neutral-900">手紙を生成する</h1>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* STEP 1: 宛先選択 */}
        <div className="rounded-lg border border-neutral-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-neutral-900">STEP 1: 宛先選択</h2>
          <div className="mt-4 flex gap-2">
            <input
              type="text"
              placeholder="コンタクトを検索"
              value={contactSearch}
              onChange={(e) => setContactSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && searchContacts()}
              className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
            />
            <button
              onClick={searchContacts}
              className="rounded-lg bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-200"
            >
              検索
            </button>
          </div>

          {contacts.length > 0 && !selectedContact && (
            <div className="mt-3 space-y-2">
              {contacts.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedContact(c)}
                  className="block w-full rounded-lg border border-neutral-200 px-3 py-2 text-left text-sm hover:bg-neutral-50"
                >
                  <span className="font-medium">{c.full_name}</span>
                  <span className="ml-2 text-neutral-500">{c.company_name} / {c.title}</span>
                </button>
              ))}
            </div>
          )}

          {selectedContact && (
            <div className="mt-4 space-y-2 rounded-lg bg-neutral-50 p-4">
              <p className="font-medium text-neutral-900">{selectedContact.full_name}</p>
              <p className="text-sm text-neutral-600">
                {selectedContact.company_name} / {selectedContact.title}
              </p>
              <p className="text-sm text-neutral-600">{selectedContact.address}</p>
              <button
                onClick={() => setSelectedContact(null)}
                className="text-sm text-neutral-900 hover:underline"
              >
                変更する
              </button>
            </div>
          )}

          {selectedContact && (
            <div className="mt-4">
              <h3 className="text-sm font-medium text-neutral-700">企業の直近情報</h3>
              <button
                onClick={collectInfo}
                disabled={collectingInfo}
                className="mt-2 rounded-lg bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-200 disabled:opacity-50"
              >
                {collectingInfo ? '収集中...' : 'AI情報収集'}
              </button>
              {collectedContext && (
                <textarea
                  value={collectedContext}
                  onChange={(e) => setCollectedContext(e.target.value)}
                  rows={4}
                  className="mt-2 block w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
                />
              )}
            </div>
          )}
        </div>

        {/* STEP 2: 設計 */}
        <div className="rounded-lg border border-neutral-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-neutral-900">STEP 2: 設計</h2>
          <div className="mt-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700">クライアント</label>
              <select
                value={selectedClient}
                onChange={(e) => setSelectedClient(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.product_name ? `/ ${c.product_name}` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700">Why Youの切り口</label>
              <div className="mt-2 flex flex-wrap gap-2">
                {WHY_YOU_ANGLES.map((a) => (
                  <button
                    key={a}
                    onClick={() => setWhyYouAngle(a)}
                    className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-all ${
                      whyYouAngle === a
                        ? 'border-neutral-900 bg-neutral-900 text-white'
                        : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50'
                    }`}
                  >
                    {a}
                  </button>
                ))}
              </div>
              {whyYouAngle === 'その他' && (
                <input
                  type="text"
                  value={customAngle}
                  onChange={(e) => setCustomAngle(e.target.value)}
                  placeholder="切り口を入力"
                  className="mt-2 block w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
                />
              )}
            </div>

            <div className="rounded-lg bg-neutral-50 p-3">
              <p className="text-xs text-neutral-500">
                ナレッジに登録された事例情報・プロダクト情報・営業資料を自動的に活用して手紙を生成します。
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* STEP 3: 生成・確認 */}
      <div className="mt-6 rounded-lg border border-neutral-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-neutral-900">STEP 3: 生成・確認</h2>

        {!generating && (
          <button
            onClick={generateLetter}
            disabled={!selectedContact || !selectedClient}
            className="mt-4 rounded-lg bg-neutral-900 px-6 py-3 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            手紙を生成する
          </button>
        )}

        {generating && (
          <div className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 p-6">
            <div className="flex items-center gap-3">
              <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-neutral-900" />
              <p className="text-sm font-medium text-neutral-700">{generatingPhase}</p>
            </div>
            <div className="mt-4 flex items-center justify-between text-xs text-neutral-500">
              <span>{generatingProgress}%</span>
              <span>
                {generatingProgress < 30 ? '残り約30秒' :
                 generatingProgress < 60 ? '残り約20秒' :
                 generatingProgress < 85 ? '残り約10秒' : 'もうすぐ完了'}
              </span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-neutral-200">
              <div
                className="h-full rounded-full bg-neutral-900 transition-all duration-500 ease-out"
                style={{ width: `${generatingProgress}%` }}
              />
            </div>
            <p className="mt-3 text-xs text-neutral-400">Opusモデルで高品質な手紙を生成しています。30〜40秒ほどかかります。</p>
          </div>
        )}

        {generatedLetter && (
          <div className="mt-6">
            <textarea
              value={generatedLetter}
              onChange={(e) => setGeneratedLetter(e.target.value)}
              rows={20}
              className="block w-full rounded-lg border border-neutral-300 px-4 py-3 font-serif text-sm leading-relaxed text-neutral-900"
            />
            <div className="mt-4 flex items-center gap-4">
              <p className="text-sm text-neutral-500">文字数: {generatedLetter.length}文字</p>
              <button
                onClick={saveLetter}
                disabled={saved}
                className="rounded-lg bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-200 disabled:opacity-50"
              >
                {saved ? '保存済み' : '保存する'}
              </button>
              <button
                onClick={downloadDocx}
                className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
              >
                docxで出力
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
