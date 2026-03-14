'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { WHY_YOU_ANGLES, SEND_TRIGGERS } from '@/lib/constants'

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

type CaseStudy = {
  id: string
  company_name: string
  challenge_tags: string[]
  result_summary: string
  recommended: boolean
}

export default function NewLetterPage() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [caseStudies, setCaseStudies] = useState<CaseStudy[]>([])
  const [contactSearch, setContactSearch] = useState('')
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
  const [selectedClient, setSelectedClient] = useState<string>('')
  const [whyYouAngle, setWhyYouAngle] = useState<string>(WHY_YOU_ANGLES[0])
  const [sendTrigger, setSendTrigger] = useState<string>(SEND_TRIGGERS[0])
  const [selectedCaseStudy, setSelectedCaseStudy] = useState<string>('')
  const [collectedContext, setCollectedContext] = useState('')
  const [generatedLetter, setGeneratedLetter] = useState('')
  const [generating, setGenerating] = useState(false)
  const [collectingInfo, setCollectingInfo] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    loadClients()
  }, [])

  useEffect(() => {
    if (selectedClient) loadCaseStudies()
  }, [selectedClient])

  async function loadClients() {
    const supabase = createClient()
    const { data } = await supabase
      .from('clients')
      .select('id, name, product_name')
      .eq('status', 'active')
    setClients(data ?? [])
    if (data?.[0]) setSelectedClient(data[0].id)
  }

  async function loadCaseStudies() {
    const supabase = createClient()
    const { data } = await supabase
      .from('case_studies')
      .select('id, company_name, challenge_tags, result_summary, recommended_roles, recommended_industries')
      .eq('client_id', selectedClient)
      .eq('availability', 'public')

    const mapped: CaseStudy[] = (data ?? []).map((cs) => ({
      id: cs.id,
      company_name: cs.company_name,
      challenge_tags: cs.challenge_tags,
      result_summary: cs.result_summary,
      recommended: false,
    }))
    setCaseStudies(mapped)
    if (mapped[0]) setSelectedCaseStudy(mapped[0].id)
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
    if (!selectedContact || !selectedClient || !selectedCaseStudy) return
    setGenerating(true)

    const caseStudy = caseStudies.find(cs => cs.id === selectedCaseStudy)
    const client = clients.find(c => c.id === selectedClient)

    // ナレッジコンテキストを取得
    const supabase = createClient()
    const { data: knowledge } = await supabase
      .from('knowledge_items')
      .select('category, title, content')
      .eq('client_id', selectedClient)
      .limit(10)
    const knowledgeContext = knowledge ?? []

    try {
      const res = await fetch('/api/generate-letter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact: selectedContact,
          client,
          caseStudy,
          whyYouAngle,
          sendTrigger,
          collectedContext,
          knowledgeContext,
        }),
      })
      const data = await res.json()
      setGeneratedLetter(data.letter ?? '')
    } catch {
      setGeneratedLetter('生成に失敗しました。')
    }
    setGenerating(false)
  }

  async function saveLetter() {
    if (!selectedContact || !generatedLetter) return
    const supabase = createClient()
    await supabase.from('letters').insert({
      client_id: selectedClient,
      contact_id: selectedContact.id,
      case_study_id: selectedCaseStudy,
      why_you_angle: whyYouAngle,
      send_trigger: sendTrigger,
      collected_context: collectedContext,
      body_text: generatedLetter,
    })
    setSaved(true)
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
              <select
                value={whyYouAngle}
                onChange={(e) => setWhyYouAngle(e.target.value)}
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
                value={sendTrigger}
                onChange={(e) => setSendTrigger(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
              >
                {SEND_TRIGGERS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700">使用ケーススタディ</label>
              <div className="mt-2 space-y-2">
                {caseStudies.length === 0 ? (
                  <p className="text-sm text-neutral-500">ケーススタディがありません</p>
                ) : (
                  caseStudies.map((cs) => (
                    <label
                      key={cs.id}
                      className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${
                        selectedCaseStudy === cs.id
                          ? 'border-neutral-300 bg-neutral-50'
                          : 'border-neutral-200 hover:bg-neutral-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="caseStudy"
                        checked={selectedCaseStudy === cs.id}
                        onChange={() => setSelectedCaseStudy(cs.id)}
                        className="mt-1"
                      />
                      <div>
                        <p className="text-sm font-medium text-neutral-900">{cs.company_name}</p>
                        <p className="text-xs text-neutral-500">{cs.challenge_tags.join(', ')}</p>
                        <p className="text-xs text-neutral-500">{cs.result_summary}</p>
                      </div>
                    </label>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* STEP 3: 生成・確認 */}
      <div className="mt-6 rounded-lg border border-neutral-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-neutral-900">STEP 3: 生成・確認</h2>

        <button
          onClick={generateLetter}
          disabled={generating || !selectedContact || !selectedClient}
          className="mt-4 rounded-lg bg-neutral-900 px-6 py-3 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {generating ? '生成中...' : '手紙を生成する'}
        </button>

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
