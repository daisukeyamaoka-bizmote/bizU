'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

type CheckType = 'fact' | 'tone' | 'typo' | 'why_you' | 'overall'
type CheckStatus = 'pass' | 'caution' | 'fail'

type CheckRow = {
  id: string
  letter_id: string
  check_type: CheckType
  status: CheckStatus
  score: number | null
  summary: string | null
  findings: string[] | null
  suggestion: string | null
  performed_by: string
  performed_by_name: string | null
  performed_at: string
  // joined
  contact_name: string
  company_name: string
  why_you_angle: string
  is_approved: boolean
  approved_by: string | null
  approved_at: string | null
}

const CHECK_TYPE_LABELS: Record<CheckType, string> = {
  fact: '事実検証',
  tone: 'トーン',
  typo: '誤字脱字',
  why_you: 'Why You訴求',
  overall: '総合',
}

const STATUS_COLORS: Record<CheckStatus, string> = {
  pass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  caution: 'bg-amber-50 text-amber-700 border-amber-200',
  fail: 'bg-red-50 text-red-700 border-red-200',
}

const STATUS_LABELS: Record<CheckStatus, string> = {
  pass: '問題なし',
  caution: '要確認',
  fail: '要修正',
}

export default function ChecksPage() {
  const [checks, setChecks] = useState<CheckRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filterType, setFilterType] = useState<string>('overall')
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [filterPerformer, setFilterPerformer] = useState<string>('')
  const [filterApproval, setFilterApproval] = useState<string>('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    loadChecks()
  }, [])

  async function loadChecks() {
    const supabase = createClient()

    const { data, error } = await supabase
      .from('letter_checks')
      .select(`
        id, letter_id, check_type, status, score, summary, findings, suggestion,
        performed_by, performed_by_name, performed_at,
        letters(
          is_approved, approved_by, approved_at, why_you_angle,
          contacts(full_name, target_companies(name))
        )
      `)
      .order('performed_at', { ascending: false })
      .limit(500)

    if (error) {
      console.error('[checks] Query error:', error.message)
      setLoading(false)
      return
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mapped: CheckRow[] = (data ?? []).map((c: any) => {
      const letter = Array.isArray(c.letters) ? c.letters[0] : c.letters
      const contact = letter?.contacts
        ? (Array.isArray(letter.contacts) ? letter.contacts[0] : letter.contacts)
        : null
      const company = contact?.target_companies
        ? (Array.isArray(contact.target_companies) ? contact.target_companies[0] : contact.target_companies)
        : null

      return {
        id: c.id,
        letter_id: c.letter_id,
        check_type: c.check_type,
        status: c.status,
        score: c.score,
        summary: c.summary,
        findings: c.findings,
        suggestion: c.suggestion,
        performed_by: c.performed_by,
        performed_by_name: c.performed_by_name,
        performed_at: c.performed_at,
        contact_name: contact?.full_name ?? '-',
        company_name: company?.name ?? '-',
        why_you_angle: letter?.why_you_angle ?? '',
        is_approved: letter?.is_approved ?? false,
        approved_by: letter?.approved_by ?? null,
        approved_at: letter?.approved_at ?? null,
      }
    })

    setChecks(mapped)
    setLoading(false)
  }

  const filtered = checks.filter(c => {
    if (filterType && c.check_type !== filterType) return false
    if (filterStatus && c.status !== filterStatus) return false
    if (filterPerformer === 'ai' && c.performed_by !== 'ai') return false
    if (filterPerformer === 'human' && c.performed_by === 'ai') return false
    if (filterApproval === 'approved' && !c.is_approved) return false
    if (filterApproval === 'unapproved' && c.is_approved) return false
    return true
  })

  // サマリー (全件対象、フィルタ無視)
  const totalChecks = checks.length
  const overallChecks = checks.filter(c => c.check_type === 'overall')
  const passCount = overallChecks.filter(c => c.status === 'pass').length
  const cautionCount = overallChecks.filter(c => c.status === 'caution').length
  const failCount = overallChecks.filter(c => c.status === 'fail').length
  const approvedLetterIds = new Set(checks.filter(c => c.is_approved).map(c => c.letter_id))
  const uniqueLettersChecked = new Set(checks.map(c => c.letter_id)).size

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">チェック履歴</h1>
          <p className="mt-1 text-sm text-neutral-500">
            AI自動ダブルチェックと人間の承認履歴を一覧表示します
          </p>
        </div>
      </div>

      {/* サマリー */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-lg border border-neutral-200 bg-white p-3">
          <p className="text-xs text-neutral-500">チェック総数</p>
          <p className="mt-1 text-xl font-bold text-neutral-900">{totalChecks}</p>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-3">
          <p className="text-xs text-neutral-500">チェック済レター</p>
          <p className="mt-1 text-xl font-bold text-neutral-900">{uniqueLettersChecked}</p>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-xs text-emerald-700">総合: 問題なし</p>
          <p className="mt-1 text-xl font-bold text-emerald-700">{passCount}</p>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs text-amber-700">総合: 要確認</p>
          <p className="mt-1 text-xl font-bold text-amber-700">{cautionCount}</p>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="text-xs text-red-700">総合: 要修正</p>
          <p className="mt-1 text-xl font-bold text-red-700">{failCount}</p>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-3">
          <p className="text-xs text-neutral-500">人間承認済</p>
          <p className="mt-1 text-xl font-bold text-neutral-900">{approvedLetterIds.size}</p>
        </div>
      </div>

      {/* フィルター */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-900"
        >
          <option value="">種別: すべて</option>
          <option value="overall">総合</option>
          <option value="fact">事実検証</option>
          <option value="tone">トーン</option>
          <option value="typo">誤字脱字</option>
          <option value="why_you">Why You訴求</option>
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-900"
        >
          <option value="">判定: すべて</option>
          <option value="pass">問題なし</option>
          <option value="caution">要確認</option>
          <option value="fail">要修正</option>
        </select>
        <select
          value={filterPerformer}
          onChange={(e) => setFilterPerformer(e.target.value)}
          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-900"
        >
          <option value="">実行者: すべて</option>
          <option value="ai">AI</option>
          <option value="human">人間</option>
        </select>
        <select
          value={filterApproval}
          onChange={(e) => setFilterApproval(e.target.value)}
          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-900"
        >
          <option value="">承認状態: すべて</option>
          <option value="approved">人間承認済</option>
          <option value="unapproved">未承認</option>
        </select>
        {(filterType || filterStatus || filterPerformer || filterApproval) && (
          <button
            onClick={() => {
              setFilterType(''); setFilterStatus(''); setFilterPerformer(''); setFilterApproval('')
            }}
            className="text-xs text-neutral-500 hover:text-neutral-700 hover:underline"
          >
            フィルター解除
          </button>
        )}
        <span className="text-xs text-neutral-400">{filtered.length}件表示</span>
      </div>

      {/* テーブル */}
      <div className="mt-4 overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="min-w-full divide-y divide-neutral-200">
          <thead className="bg-neutral-50">
            <tr>
              <th className="whitespace-nowrap px-3 py-3 text-left text-xs font-medium uppercase text-neutral-500">実行日時</th>
              <th className="whitespace-nowrap px-3 py-3 text-left text-xs font-medium uppercase text-neutral-500">企業名</th>
              <th className="whitespace-nowrap px-3 py-3 text-left text-xs font-medium uppercase text-neutral-500">担当名</th>
              <th className="whitespace-nowrap px-3 py-3 text-left text-xs font-medium uppercase text-neutral-500">種別</th>
              <th className="whitespace-nowrap px-3 py-3 text-left text-xs font-medium uppercase text-neutral-500">判定</th>
              <th className="whitespace-nowrap px-3 py-3 text-left text-xs font-medium uppercase text-neutral-500">スコア</th>
              <th className="whitespace-nowrap px-3 py-3 text-left text-xs font-medium uppercase text-neutral-500">要約</th>
              <th className="whitespace-nowrap px-3 py-3 text-left text-xs font-medium uppercase text-neutral-500">実行者</th>
              <th className="whitespace-nowrap px-3 py-3 text-left text-xs font-medium uppercase text-neutral-500">人間承認</th>
              <th className="whitespace-nowrap px-3 py-3 text-left text-xs font-medium uppercase text-neutral-500">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {loading ? (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-sm text-neutral-500">読み込み中...</td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-sm text-neutral-500">
                  チェック履歴がありません
                </td>
              </tr>
            ) : (
              filtered.map((c) => {
                const dt = new Date(c.performed_at)
                const dtStr = `${dt.getFullYear()}/${String(dt.getMonth() + 1).padStart(2, '0')}/${String(dt.getDate()).padStart(2, '0')} ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`
                const isExpanded = expandedId === c.id
                const hasDetail = (c.findings && c.findings.length > 0) || !!c.suggestion

                return (
                  <>
                    <tr key={c.id} className={`hover:bg-neutral-50 ${isExpanded ? 'bg-neutral-50' : ''}`}>
                      <td className="whitespace-nowrap px-3 py-3 text-xs text-neutral-600">{dtStr}</td>
                      <td className="px-3 py-3 text-sm font-medium">
                        <Link href={`/letters/${c.letter_id}`} className="text-neutral-900 hover:text-blue-700 hover:underline">
                          {c.company_name}
                        </Link>
                      </td>
                      <td className="px-3 py-3 text-sm text-neutral-900">{c.contact_name}</td>
                      <td className="px-3 py-3 text-sm">
                        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700">
                          {CHECK_TYPE_LABELS[c.check_type]}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-sm">
                        <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[c.status]}`}>
                          {STATUS_LABELS[c.status]}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-sm font-medium text-neutral-900">
                        {c.score != null ? `${c.score}` : '-'}
                      </td>
                      <td className="max-w-[220px] truncate px-3 py-3 text-xs text-neutral-600" title={c.summary ?? ''}>
                        {c.summary ?? '-'}
                      </td>
                      <td className="px-3 py-3 text-xs text-neutral-600">
                        {c.performed_by === 'ai' ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 font-medium text-blue-700">
                            <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" />
                            </svg>
                            AI
                          </span>
                        ) : (
                          <span>{c.performed_by_name ?? c.performed_by}</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-xs">
                        {c.is_approved ? (
                          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700">
                            ダブルチェック済 ✓
                          </span>
                        ) : (
                          <span className="text-neutral-400">未承認</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-sm">
                        {hasDetail && (
                          <button
                            onClick={() => setExpandedId(isExpanded ? null : c.id)}
                            className="text-xs text-neutral-500 hover:text-neutral-700 hover:underline"
                          >
                            {isExpanded ? '閉じる' : '詳細'}
                          </button>
                        )}
                      </td>
                    </tr>
                    {isExpanded && hasDetail && (
                      <tr key={`${c.id}-detail`}>
                        <td colSpan={10} className="border-b border-neutral-200 bg-neutral-50 px-6 py-4">
                          {c.findings && c.findings.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-neutral-500">指摘事項</p>
                              <ul className="mt-1 list-inside list-disc space-y-0.5 text-sm text-neutral-800">
                                {c.findings.map((f, i) => <li key={i}>{f}</li>)}
                              </ul>
                            </div>
                          )}
                          {c.suggestion && (
                            <div className="mt-3">
                              <p className="text-xs font-medium text-neutral-500">改善提案</p>
                              <p className="mt-1 text-sm text-neutral-800">{c.suggestion}</p>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
