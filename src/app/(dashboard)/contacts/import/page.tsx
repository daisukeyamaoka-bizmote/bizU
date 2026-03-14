'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ROLE_LEVELS, INDUSTRIES } from '@/lib/constants'
import * as XLSX from 'xlsx'
import Link from 'next/link'

type ParsedRow = Record<string, string>
type MappingField = 'company_name' | 'full_name' | 'department' | 'title' | 'role_level' | 'postal_code' | 'address' | 'industry' | 'info_source' | null

type DuplicateItem = {
  rowIndex: number
  level: 'exact' | 'update' | 'company'
  existingContact: { id: string; full_name: string; company_name: string; title: string | null; department: string | null; address: string | null }
  newData: { full_name: string; company_name: string; title: string; department: string; address: string }
  diffs: string[]
  action: 'skip' | 'update' | 'add'
}

type ErrorRow = {
  rowIndex: number
  data: ParsedRow
  reason: string
}

const FIELD_OPTIONS: { value: MappingField | 'skip'; label: string }[] = [
  { value: 'company_name', label: '会社名' },
  { value: 'full_name', label: '氏名' },
  { value: 'department', label: '部署' },
  { value: 'title', label: '役職' },
  { value: 'role_level', label: '役職レベル' },
  { value: 'postal_code', label: '郵便番号' },
  { value: 'address', label: '住所' },
  { value: 'industry', label: '業種' },
  { value: 'info_source', label: '情報ソース' },
  { value: 'skip', label: 'スキップ' },
]

export default function SmartImportPage() {
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1)
  const [fileName, setFileName] = useState('')
  const [parsedData, setParsedData] = useState<ParsedRow[]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [mapping, setMapping] = useState<Record<string, MappingField | 'skip'>>({})
  const [mappingStatus, setMappingStatus] = useState<Record<string, 'auto' | 'manual' | 'skip'>>({})
  const [aiMapping, setAiMapping] = useState(false)

  // Options
  const [excludeSentDays, setExcludeSentDays] = useState(90)
  const [excludeSentEnabled, setExcludeSentEnabled] = useState(true)
  const [defaultIndustry, setDefaultIndustry] = useState('その他')

  // Duplicate check
  const [duplicates, setDuplicates] = useState<DuplicateItem[]>([])
  const [checkingDuplicates, setCheckingDuplicates] = useState(false)

  // Import
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{ added: number; updated: number; skipped: number; errors: number } | null>(null)
  const [errorRows, setErrorRows] = useState<ErrorRow[]>([])

  // Progress tracking
  const [progress, setProgress] = useState({ current: 0, total: 0, phase: '' })
  const [estimatedSeconds, setEstimatedSeconds] = useState<number | null>(null)

  // ===== STEP 1: File Upload =====
  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)

    const buffer = await file.arrayBuffer()
    let workbook: XLSX.WorkBook

    try {
      // SheetJS handles Excel and CSV, auto-detects encoding
      workbook = XLSX.read(buffer, { type: 'array', codepage: 932 }) // 932 = Shift-JIS fallback
    } catch {
      // Retry as UTF-8 text
      const text = new TextDecoder('utf-8').decode(buffer)
      workbook = XLSX.read(text, { type: 'string' })
    }

    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const jsonData = XLSX.utils.sheet_to_json<ParsedRow>(sheet, { defval: '' })

    if (jsonData.length === 0) return

    const hdrs = Object.keys(jsonData[0])
    setHeaders(hdrs)
    setParsedData(jsonData)

    // AI column mapping
    setAiMapping(true)
    try {
      const res = await fetch('/api/import-mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headers: hdrs }),
      })
      const data = await res.json()
      const aiMap = data.mapping ?? {}

      const newMapping: Record<string, MappingField | 'skip'> = {}
      const newStatus: Record<string, 'auto' | 'manual' | 'skip'> = {}

      for (const h of hdrs) {
        const mapped = aiMap[h]
        if (mapped && mapped !== null && FIELD_OPTIONS.some(f => f.value === mapped)) {
          newMapping[h] = mapped as MappingField
          newStatus[h] = 'auto'
        } else {
          newMapping[h] = 'skip'
          newStatus[h] = 'skip'
        }
      }

      setMapping(newMapping)
      setMappingStatus(newStatus)
    } catch {
      // Fallback: simple keyword matching
      const newMapping: Record<string, MappingField | 'skip'> = {}
      const newStatus: Record<string, 'auto' | 'manual' | 'skip'> = {}
      for (const h of hdrs) {
        if (h.includes('会社') || h.includes('企業')) { newMapping[h] = 'company_name'; newStatus[h] = 'auto' }
        else if (h.includes('氏名') || h.includes('名前')) { newMapping[h] = 'full_name'; newStatus[h] = 'auto' }
        else if (h.includes('部署') || h.includes('所属')) { newMapping[h] = 'department'; newStatus[h] = 'auto' }
        else if (h.includes('役職') || h.includes('職位')) { newMapping[h] = 'title'; newStatus[h] = 'auto' }
        else if (h.includes('郵便')) { newMapping[h] = 'postal_code'; newStatus[h] = 'auto' }
        else if (h.includes('住所')) { newMapping[h] = 'address'; newStatus[h] = 'auto' }
        else if (h.includes('業種')) { newMapping[h] = 'industry'; newStatus[h] = 'auto' }
        else { newMapping[h] = 'skip'; newStatus[h] = 'skip' }
      }
      setMapping(newMapping)
      setMappingStatus(newStatus)
    }
    setAiMapping(false)
    setStep(2)
  }, [])

  // ===== STEP 2 → 3: Run Duplicate Check =====
  async function runDuplicateCheck() {
    setCheckingDuplicates(true)
    setProgress({ current: 0, total: parsedData.length, phase: 'データベースから既存コンタクトを取得中...' })
    const supabase = createClient()

    const getValue = (row: ParsedRow, field: MappingField): string => {
      const header = Object.entries(mapping).find(([, v]) => v === field)?.[0]
      return header ? (row[header] ?? '').trim() : ''
    }

    // Fetch all existing contacts
    const { data: existingContacts } = await supabase
      .from('contacts')
      .select('id, full_name, department, title, address, company_id, target_companies(name)')
      .eq('is_active', true)

    // Build lookup maps for O(1) matching instead of O(n*m)
    const contactsByNormalizedCompany = new Map<string, typeof existingContacts>()
    for (const ec of existingContacts ?? []) {
      const company = Array.isArray(ec.target_companies) ? ec.target_companies[0] : ec.target_companies
      const normalizedName = normalizeCompanyName(company?.name ?? '')
      if (!contactsByNormalizedCompany.has(normalizedName)) {
        contactsByNormalizedCompany.set(normalizedName, [])
      }
      contactsByNormalizedCompany.get(normalizedName)!.push(ec)
    }

    // Fetch sent letters for exclusion
    let sentContactIds = new Set<string>()
    if (excludeSentEnabled) {
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - excludeSentDays)
      const { data: recentLetters } = await supabase
        .from('letters')
        .select('contact_id')
        .gte('sent_at', cutoffDate.toISOString().split('T')[0])
      sentContactIds = new Set((recentLetters ?? []).map(l => l.contact_id))
    }

    setProgress({ current: 0, total: parsedData.length, phase: '重複チェック中...' })

    const dupes: DuplicateItem[] = []

    for (let i = 0; i < parsedData.length; i++) {
      if (i % 50 === 0) {
        setProgress({ current: i, total: parsedData.length, phase: '重複チェック中...' })
        // Yield to UI thread
        await new Promise(r => setTimeout(r, 0))
      }

      const row = parsedData[i]
      const companyName = getValue(row, 'company_name')
      const fullName = getValue(row, 'full_name')
      if (!companyName || !fullName) continue

      const normalizedCompany = normalizeCompanyName(companyName)

      // O(1) lookup instead of iterating all contacts
      const matchingContacts = contactsByNormalizedCompany.get(normalizedCompany) ?? []

      for (const ec of matchingContacts) {
        const company = Array.isArray(ec.target_companies) ? ec.target_companies[0] : ec.target_companies
        const existingCompanyName = company?.name ?? ''

        if (ec.full_name === fullName) {
          const newTitle = getValue(row, 'title')
          const newDept = getValue(row, 'department')
          const newAddress = getValue(row, 'address')
          const diffs: string[] = []

          if (newTitle && newTitle !== (ec.title ?? '') && ec.title) diffs.push(`役職: 「${ec.title}」→「${newTitle}」`)
          if (newDept && newDept !== (ec.department ?? '') && ec.department) diffs.push(`部署: 「${ec.department}」→「${newDept}」`)
          if (newAddress && newAddress !== (ec.address ?? '') && ec.address) diffs.push(`住所: 変更あり`)

          if (sentContactIds.has(ec.id)) {
            diffs.push(`直近${excludeSentDays}日以内に送付済み`)
          }

          dupes.push({
            rowIndex: i,
            level: diffs.length > 0 ? 'update' : 'exact',
            existingContact: {
              id: ec.id,
              full_name: ec.full_name,
              company_name: existingCompanyName,
              title: ec.title,
              department: ec.department,
              address: ec.address,
            },
            newData: {
              full_name: fullName,
              company_name: companyName,
              title: newTitle,
              department: newDept,
              address: newAddress,
            },
            diffs,
            action: diffs.length > 0 ? 'update' : 'skip',
          })
          break
        } else if (ec.full_name !== fullName) {
          if (!dupes.some(d => d.rowIndex === i)) {
            dupes.push({
              rowIndex: i,
              level: 'company',
              existingContact: {
                id: ec.id,
                full_name: ec.full_name,
                company_name: existingCompanyName,
                title: ec.title,
                department: ec.department,
                address: ec.address,
              },
              newData: {
                full_name: fullName,
                company_name: companyName,
                title: getValue(row, 'title'),
                department: getValue(row, 'department'),
                address: getValue(row, 'address'),
              },
              diffs: [`同じ会社に${ec.full_name}（${ec.title ?? ''}）への送付履歴あり`],
              action: 'add',
            })
          }
          break
        }
      }
    }

    setDuplicates(dupes)
    setCheckingDuplicates(false)
    setProgress({ current: 0, total: 0, phase: '' })
    setStep(3)
  }

  function updateDuplicateAction(rowIndex: number, action: 'skip' | 'update' | 'add') {
    setDuplicates(prev => prev.map(d => d.rowIndex === rowIndex ? { ...d, action } : d))
  }

  // ===== STEP 4: Execute Import =====
  async function executeImport() {
    setImporting(true)
    const startTime = Date.now()
    setProgress({ current: 0, total: parsedData.length, phase: 'インポート準備中...' })
    setEstimatedSeconds(null)
    const supabase = createClient()

    const getValue = (row: ParsedRow, field: MappingField): string => {
      const header = Object.entries(mapping).find(([, v]) => v === field)?.[0]
      return header ? (row[header] ?? '').trim() : ''
    }

    // Create import log
    const { data: importLog } = await supabase.from('import_logs').insert({
      file_name: fileName,
      total_rows: parsedData.length,
    }).select('id').single()

    const importLogId = importLog?.id ?? null

    // Pre-fetch all companies for batch lookup
    setProgress({ current: 0, total: parsedData.length, phase: '企業データを一括取得中...' })
    const { data: allCompanies } = await supabase.from('target_companies').select('id, name')
    const companyCache = new Map<string, string>()
    for (const c of allCompanies ?? []) {
      companyCache.set(c.name, c.id)
    }

    let added = 0
    let updated = 0
    let skipped = 0
    const errors: ErrorRow[] = []

    const dupeMap = new Map(duplicates.map(d => [d.rowIndex, d]))

    setProgress({ current: 0, total: parsedData.length, phase: 'インポート中...' })

    for (let i = 0; i < parsedData.length; i++) {
      // Update progress and estimated time every 5 rows
      if (i % 5 === 0 || i === parsedData.length - 1) {
        setProgress({ current: i + 1, total: parsedData.length, phase: 'インポート中...' })
        const elapsed = (Date.now() - startTime) / 1000
        if (i > 0) {
          const perRow = elapsed / i
          const remaining = Math.ceil(perRow * (parsedData.length - i))
          setEstimatedSeconds(remaining)
        }
        // Yield to UI
        await new Promise(r => setTimeout(r, 0))
      }

      const row = parsedData[i]
      const companyName = getValue(row, 'company_name')
      const fullName = getValue(row, 'full_name')
      const excelRow = i + 2 // Excel row (1-indexed header + 1-indexed data)

      if (!companyName) {
        errors.push({ rowIndex: i, data: row, reason: `${excelRow}行目: 会社名が空です` })
        continue
      }
      if (!fullName) {
        errors.push({ rowIndex: i, data: row, reason: `${excelRow}行目: 氏名が空です` })
        continue
      }

      const dupe = dupeMap.get(i)

      // Handle duplicates based on user's action choice
      if (dupe) {
        if (dupe.action === 'skip') {
          skipped++
          continue
        }

        if (dupe.action === 'update' && (dupe.level === 'exact' || dupe.level === 'update')) {
          const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }
          const newTitle = getValue(row, 'title')
          const newDept = getValue(row, 'department')
          const newAddress = getValue(row, 'address')
          const newPostal = getValue(row, 'postal_code')
          if (newTitle) updateData.title = newTitle
          if (newDept) updateData.department = newDept
          if (newAddress) updateData.address = newAddress
          if (newPostal) updateData.postal_code = newPostal
          if (importLogId) updateData.import_log_id = importLogId

          const { error } = await supabase
            .from('contacts')
            .update(updateData)
            .eq('id', dupe.existingContact.id)

          if (error) {
            errors.push({ rowIndex: i, data: row, reason: `${excelRow}行目: 更新エラー - ${error.message}` })
          } else {
            updated++
          }
          continue
        }
      }

      // Company lookup with cache
      const industry = getValue(row, 'industry') || defaultIndustry
      let companyId = companyCache.get(companyName)

      if (!companyId) {
        const { data: newCompany, error: companyError } = await supabase
          .from('target_companies')
          .insert({
            name: companyName,
            industry: INDUSTRIES.includes(industry as typeof INDUSTRIES[number]) ? industry : 'その他',
          })
          .select('id')
          .single()

        if (newCompany) {
          companyId = newCompany.id
          companyCache.set(companyName, companyId!)
        } else {
          errors.push({ rowIndex: i, data: row, reason: `${excelRow}行目: 企業「${companyName}」の作成に失敗しました${companyError ? ' - ' + companyError.message : ''}` })
          continue
        }
      }

      // Check exact duplicate for non-flagged rows
      if (!dupe) {
        const { data: existing } = await supabase
          .from('contacts')
          .select('id')
          .eq('company_id', companyId)
          .eq('full_name', fullName)
          .single()

        if (existing) {
          skipped++
          continue
        }
      }

      const roleLevel = getValue(row, 'role_level')
      const { error } = await supabase.from('contacts').insert({
        company_id: companyId,
        full_name: fullName,
        department: getValue(row, 'department') || null,
        title: getValue(row, 'title') || null,
        role_level: ROLE_LEVELS.includes(roleLevel as typeof ROLE_LEVELS[number]) ? roleLevel : 'その他',
        postal_code: getValue(row, 'postal_code') || null,
        address: getValue(row, 'address') || null,
        info_source: getValue(row, 'info_source') || 'その他',
        info_acquired_at: new Date().toISOString().split('T')[0],
        import_log_id: importLogId,
      })

      if (error) {
        if (error.code === '23505') {
          skipped++
        } else {
          errors.push({ rowIndex: i, data: row, reason: `${excelRow}行目: ${error.message}` })
        }
      } else {
        added++
      }
    }

    // Update import log
    if (importLogId) {
      await supabase.from('import_logs').update({
        added_rows: added,
        updated_rows: updated,
        skipped_rows: skipped,
        error_rows: errors.length,
        error_details: errors.length > 0 ? errors.map(e => ({ row: e.rowIndex + 2, reason: e.reason })) : null,
      }).eq('id', importLogId)
    }

    setResult({ added, updated, skipped, errors: errors.length })
    setErrorRows(errors)
    setEstimatedSeconds(null)
    setProgress({ current: 0, total: 0, phase: '' })
    setStep(5)
    setImporting(false)
  }

  // Download error rows as Excel
  function downloadErrors() {
    if (errorRows.length === 0) return

    const rows = errorRows.map(e => {
      const row: Record<string, string> = { ...e.data, 'エラー理由': e.reason }
      return row
    })

    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'エラー行')
    XLSX.writeFile(wb, `bizU_import_errors_${fileName}`)
  }

  // Missing required fields
  const missingFields: string[] = []
  const mappedFields = new Set(Object.values(mapping).filter(v => v !== 'skip'))
  if (!mappedFields.has('company_name')) missingFields.push('会社名')
  if (!mappedFields.has('full_name')) missingFields.push('氏名')

  const exactDupes = duplicates.filter(d => d.level === 'exact')
  const updateDupes = duplicates.filter(d => d.level === 'update')
  const companyDupes = duplicates.filter(d => d.level === 'company')

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-neutral-900">リストインポート</h1>
        <a
          href="/api/import-template"
          className="rounded-lg bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-200"
        >
          テンプレートをダウンロード
        </a>
      </div>

      {/* Progress bar */}
      <div className="mt-4 flex gap-1">
        {[1, 2, 3, 4, 5].map((s) => (
          <div
            key={s}
            className={`h-1 flex-1 rounded-full ${s <= step ? 'bg-neutral-900' : 'bg-neutral-200'}`}
          />
        ))}
      </div>

      {/* ===== STEP 1: Upload ===== */}
      {step === 1 && (
        <div className="mt-6">
          <h2 className="text-lg font-semibold text-neutral-900">STEP 1: ファイルをアップロード</h2>
          <div className="mt-4 flex items-center justify-center rounded-lg border-2 border-dashed border-neutral-300 bg-white p-12">
            <div className="text-center">
              <p className="text-sm text-neutral-600">Excel・CSVをドラッグ&ドロップ</p>
              <p className="mt-1 text-xs text-neutral-400">対応形式: .xlsx / .xls / .csv（Shift-JIS / UTF-8 自動判定）</p>
              <label className="mt-4 inline-flex cursor-pointer items-center rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800">
                ファイルを選択
                <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFileUpload} />
              </label>
            </div>
          </div>

          {/* AI Mapping Loading */}
          {aiMapping && (
            <div className="mt-4 rounded-lg border border-neutral-200 bg-white p-4">
              <div className="flex items-center gap-3">
                <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-neutral-900" />
                <p className="text-sm font-medium text-neutral-700">ファイルを読み込み中... AIが列を自動マッピングしています</p>
              </div>
              <p className="mt-2 text-xs text-neutral-400">数秒お待ちください</p>
            </div>
          )}

          {/* Options */}
          <div className="mt-4 rounded-lg border border-neutral-200 bg-white p-4">
            <h3 className="text-sm font-medium text-neutral-700">オプション</h3>
            <label className="mt-3 flex items-center gap-2">
              <input
                type="checkbox"
                checked={excludeSentEnabled}
                onChange={(e) => setExcludeSentEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-neutral-300"
              />
              <span className="text-sm text-neutral-700">直近</span>
              <select
                value={excludeSentDays}
                onChange={(e) => setExcludeSentDays(Number(e.target.value))}
                className="rounded border border-neutral-300 px-2 py-1 text-sm text-neutral-900"
              >
                <option value={30}>30日</option>
                <option value={60}>60日</option>
                <option value={90}>90日</option>
                <option value={180}>180日</option>
              </select>
              <span className="text-sm text-neutral-700">以内に送付済みのコンタクトを除外</span>
            </label>
          </div>
        </div>
      )}

      {/* ===== STEP 2: Column Mapping ===== */}
      {step === 2 && (
        <div className="mt-6">
          <h2 className="text-lg font-semibold text-neutral-900">
            STEP 2: {aiMapping ? 'AIが列を自動マッピング中...' : 'AIが列を自動マッピングしました'}
          </h2>

          <div className="mt-4 rounded-lg border border-neutral-200 bg-white p-6">
            <div className="space-y-2">
              {headers.map((header) => {
                const status = mappingStatus[header]
                return (
                  <div key={header} className="flex items-center gap-4">
                    <span className="w-48 text-sm text-neutral-700">{header}</span>
                    <span className="text-neutral-400">&rarr;</span>
                    <select
                      value={mapping[header] ?? 'skip'}
                      onChange={(e) => {
                        setMapping(prev => ({ ...prev, [header]: e.target.value as MappingField | 'skip' }))
                        setMappingStatus(prev => ({ ...prev, [header]: 'manual' }))
                      }}
                      className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-900"
                    >
                      {FIELD_OPTIONS.map((opt) => (
                        <option key={opt.value ?? 'skip'} value={opt.value ?? 'skip'}>{opt.label}</option>
                      ))}
                    </select>
                    <span className={`text-xs ${status === 'auto' ? 'text-emerald-600' : status === 'skip' ? 'text-neutral-400' : 'text-blue-600'}`}>
                      {status === 'auto' ? '自動' : status === 'skip' ? 'スキップ' : '手動'}
                    </span>
                  </div>
                )
              })}
            </div>

            {/* Missing fields warning */}
            {missingFields.length > 0 && (
              <div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
                必須項目がマッピングされていません: {missingFields.join(', ')}
              </div>
            )}

            {/* Default industry */}
            {!Object.values(mapping).includes('industry') && (
              <div className="mt-4 flex items-center gap-2">
                <span className="text-sm text-neutral-500">業種のデフォルト値:</span>
                <select
                  value={defaultIndustry}
                  onChange={(e) => setDefaultIndustry(e.target.value)}
                  className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-900"
                >
                  {INDUSTRIES.map((ind) => (
                    <option key={ind} value={ind}>{ind}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <p className="mt-3 text-sm text-neutral-600">データ件数: {parsedData.length}件</p>

          {checkingDuplicates && progress.total > 0 && (
            <div className="mt-4 rounded-lg border border-neutral-200 bg-white p-4">
              <div className="flex items-center justify-between text-sm text-neutral-600">
                <span>{progress.phase}</span>
                <span>{progress.current} / {progress.total}件</span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-neutral-100">
                <div
                  className="h-full rounded-full bg-neutral-900 transition-all duration-300"
                  style={{ width: `${Math.round((progress.current / progress.total) * 100)}%` }}
                />
              </div>
            </div>
          )}

          <div className="mt-4 flex gap-3">
            <button
              onClick={runDuplicateCheck}
              disabled={missingFields.length > 0 || checkingDuplicates}
              className="rounded-lg bg-neutral-900 px-6 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              {checkingDuplicates ? '重複チェック中...' : '次へ: 重複チェック'}
            </button>
            <button onClick={() => setStep(1)} className="text-sm text-neutral-500 hover:underline">
              戻る
            </button>
          </div>
        </div>
      )}

      {/* ===== STEP 3: Duplicate Check ===== */}
      {step === 3 && (
        <div className="mt-6">
          <h2 className="text-lg font-semibold text-neutral-900">STEP 3: 重複チェック結果</h2>

          <div className="mt-4 flex gap-6 text-sm">
            <span className="text-neutral-700">新規: <strong>{parsedData.length - duplicates.length}件</strong></span>
            <span className="text-neutral-700">要確認: <strong>{updateDupes.length}件</strong></span>
            <span className="text-neutral-700">完全重複: <strong>{exactDupes.length}件</strong></span>
            <span className="text-neutral-700">企業重複（別担当）: <strong>{companyDupes.length}件</strong></span>
          </div>

          {/* Exact duplicates */}
          {exactDupes.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-semibold text-red-600">完全重複（{exactDupes.length}件）デフォルト: スキップ</h3>
              <div className="mt-2 space-y-2">
                {exactDupes.map((d) => (
                  <DuplicateCard key={d.rowIndex} item={d} onAction={(a) => updateDuplicateAction(d.rowIndex, a)} />
                ))}
              </div>
            </div>
          )}

          {/* Update candidates */}
          {updateDupes.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-semibold text-amber-600">差分あり（{updateDupes.length}件）デフォルト: 上書き更新</h3>
              <div className="mt-2 space-y-2">
                {updateDupes.map((d) => (
                  <DuplicateCard key={d.rowIndex} item={d} onAction={(a) => updateDuplicateAction(d.rowIndex, a)} />
                ))}
              </div>
            </div>
          )}

          {/* Company duplicates */}
          {companyDupes.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-semibold text-blue-600">企業重複・別担当（{companyDupes.length}件）デフォルト: 追加</h3>
              <div className="mt-2 space-y-2">
                {companyDupes.map((d) => (
                  <DuplicateCard key={d.rowIndex} item={d} onAction={(a) => updateDuplicateAction(d.rowIndex, a)} />
                ))}
              </div>
            </div>
          )}

          {duplicates.length === 0 && (
            <p className="mt-4 text-sm text-emerald-600">重複なし。全{parsedData.length}件が新規追加されます。</p>
          )}

          {/* Preview */}
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-neutral-700">プレビュー（先頭3件）</h3>
            <div className="mt-2 space-y-1">
              {parsedData.slice(0, 3).map((row, i) => {
                const getVal = (field: MappingField) => {
                  const header = Object.entries(mapping).find(([, v]) => v === field)?.[0]
                  return header ? (row[header] ?? '') : ''
                }
                return (
                  <p key={i} className="text-sm text-neutral-600">
                    {getVal('full_name')} / {getVal('company_name')} / {getVal('title')} / {getVal('department')}
                  </p>
                )
              })}
            </div>
          </div>

          <div className="mt-6 flex gap-3">
            <button
              onClick={() => { setStep(4); executeImport() }}
              disabled={importing}
              className="rounded-lg bg-neutral-900 px-6 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              インポート実行
            </button>
            <button onClick={() => setStep(2)} className="text-sm text-neutral-500 hover:underline">
              戻る
            </button>
          </div>
        </div>
      )}

      {/* ===== STEP 4: Importing ===== */}
      {step === 4 && (
        <div className="mt-6">
          <h2 className="text-lg font-semibold text-neutral-900">STEP 4: インポート実行中...</h2>
          <div className="mt-4 rounded-lg border border-neutral-200 bg-white p-6">
            <div className="flex items-center gap-3">
              <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-neutral-900" />
              <p className="text-sm font-medium text-neutral-700">{progress.phase || 'インポート準備中...'}</p>
            </div>

            {progress.total > 0 && (
              <>
                <div className="mt-4 flex items-center justify-between text-sm text-neutral-500">
                  <span>{progress.current} / {progress.total}件 処理済み</span>
                  <span>{Math.round((progress.current / progress.total) * 100)}%</span>
                </div>
                <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-neutral-100">
                  <div
                    className="h-full rounded-full bg-neutral-900 transition-all duration-300"
                    style={{ width: `${Math.round((progress.current / progress.total) * 100)}%` }}
                  />
                </div>
                {estimatedSeconds !== null && estimatedSeconds > 0 && (
                  <p className="mt-3 text-xs text-neutral-400">
                    残り約 {estimatedSeconds >= 60
                      ? `${Math.floor(estimatedSeconds / 60)}分${estimatedSeconds % 60}秒`
                      : `${estimatedSeconds}秒`
                    }（目安）
                  </p>
                )}
              </>
            )}

            <p className="mt-4 text-xs text-neutral-400">
              このページを閉じないでください。処理が完了するまでお待ちください。
            </p>
          </div>
        </div>
      )}

      {/* ===== STEP 5: Result ===== */}
      {step === 5 && result && (
        <div className="mt-6">
          <h2 className="text-lg font-semibold text-neutral-900">STEP 5: インポート完了</h2>

          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-center">
              <p className="text-2xl font-bold text-emerald-700">{result.added}</p>
              <p className="text-xs text-emerald-600">新規追加</p>
            </div>
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-center">
              <p className="text-2xl font-bold text-blue-700">{result.updated}</p>
              <p className="text-xs text-blue-600">更新</p>
            </div>
            <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-center">
              <p className="text-2xl font-bold text-neutral-600">{result.skipped}</p>
              <p className="text-xs text-neutral-500">スキップ</p>
            </div>
            <div className={`rounded-lg border p-4 text-center ${result.errors > 0 ? 'border-red-200 bg-red-50' : 'border-neutral-200 bg-neutral-50'}`}>
              <p className={`text-2xl font-bold ${result.errors > 0 ? 'text-red-600' : 'text-neutral-600'}`}>{result.errors}</p>
              <p className={`text-xs ${result.errors > 0 ? 'text-red-500' : 'text-neutral-500'}`}>エラー</p>
            </div>
          </div>

          {result.errors > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-semibold text-red-600">エラー詳細（{errorRows.length}件）</h3>
              <div className="mt-2 max-h-60 overflow-y-auto rounded-lg border border-red-200 bg-red-50">
                {errorRows.map((e, idx) => (
                  <div key={idx} className={`flex items-start gap-3 px-4 py-2.5 text-sm ${idx > 0 ? 'border-t border-red-100' : ''}`}>
                    <span className="shrink-0 rounded bg-red-100 px-1.5 py-0.5 text-xs font-mono font-medium text-red-700">
                      {e.rowIndex + 2}行
                    </span>
                    <div className="min-w-0">
                      <p className="text-red-700">{e.reason}</p>
                      <p className="mt-0.5 truncate text-xs text-red-400">
                        {Object.values(e.data).filter(Boolean).slice(0, 4).join(' / ')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <button
                onClick={downloadErrors}
                className="mt-3 rounded-lg bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-200"
              >
                エラー行をダウンロード（Excel）
              </button>
            </div>
          )}

          <div className="mt-6 flex gap-3">
            <Link
              href="/contacts"
              className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
            >
              コンタクト一覧へ
            </Link>
            <button
              onClick={() => { setStep(1); setParsedData([]); setHeaders([]); setMapping({}); setDuplicates([]); setResult(null); setErrorRows([]) }}
              className="text-sm text-neutral-500 hover:underline"
            >
              続けてインポート
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function DuplicateCard({
  item,
  onAction,
}: {
  item: DuplicateItem
  onAction: (action: 'skip' | 'update' | 'add') => void
}) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-3">
      <p className="text-sm font-medium text-neutral-900">
        {item.newData.full_name} / {item.newData.company_name} / {item.newData.title}
      </p>
      {item.diffs.length > 0 && (
        <div className="mt-1 space-y-0.5">
          {item.diffs.map((d, i) => (
            <p key={i} className="text-xs text-neutral-500">{d}</p>
          ))}
        </div>
      )}
      <div className="mt-2 flex gap-2">
        {item.level === 'exact' && (
          <>
            <ActionBtn label="スキップ" active={item.action === 'skip'} onClick={() => onAction('skip')} />
            <ActionBtn label="追加する" active={item.action === 'add'} onClick={() => onAction('add')} />
          </>
        )}
        {item.level === 'update' && (
          <>
            <ActionBtn label="上書き更新" active={item.action === 'update'} onClick={() => onAction('update')} />
            <ActionBtn label="スキップ" active={item.action === 'skip'} onClick={() => onAction('skip')} />
            <ActionBtn label="新規追加" active={item.action === 'add'} onClick={() => onAction('add')} />
          </>
        )}
        {item.level === 'company' && (
          <>
            <ActionBtn label="追加する" active={item.action === 'add'} onClick={() => onAction('add')} />
            <ActionBtn label="スキップ" active={item.action === 'skip'} onClick={() => onAction('skip')} />
          </>
        )}
      </div>
    </div>
  )
}

function ActionBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded px-3 py-1 text-xs font-medium transition-all ${
        active
          ? 'bg-neutral-900 text-white'
          : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
      }`}
    >
      {label}
    </button>
  )
}

function normalizeCompanyName(name: string): string {
  return name
    .replace(/株式会社|㈱|有限会社|㈲|合同会社/g, '')
    .replace(/　/g, ' ')
    .trim()
}
