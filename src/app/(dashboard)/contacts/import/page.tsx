'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ROLE_LEVELS } from '@/lib/constants'

type CSVRow = Record<string, string>
type MappingField = 'company_name' | 'full_name' | 'department' | 'title' | 'role_level' | 'postal_code' | 'address' | 'skip'

const FIELD_OPTIONS: { value: MappingField; label: string }[] = [
  { value: 'company_name', label: '会社名' },
  { value: 'full_name', label: '氏名' },
  { value: 'department', label: '部署' },
  { value: 'title', label: '役職' },
  { value: 'role_level', label: '役職レベル' },
  { value: 'postal_code', label: '郵便番号' },
  { value: 'address', label: '住所' },
  { value: 'skip', label: 'スキップ' },
]

export default function CSVImportPage() {
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [csvData, setCsvData] = useState<CSVRow[]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [mapping, setMapping] = useState<Record<string, MappingField>>({})
  const [importResult, setImportResult] = useState<{ added: number; skipped: number } | null>(null)
  const [loading, setLoading] = useState(false)

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      const lines = text.split('\n').filter(line => line.trim())
      if (lines.length < 2) return

      const headerLine = lines[0].split(',').map(h => h.trim().replace(/"/g, ''))
      setHeaders(headerLine)

      // Auto-detect mapping
      const autoMapping: Record<string, MappingField> = {}
      headerLine.forEach((h) => {
        if (h.includes('会社') || h.includes('企業')) autoMapping[h] = 'company_name'
        else if (h.includes('氏名') || h.includes('名前')) autoMapping[h] = 'full_name'
        else if (h.includes('部署')) autoMapping[h] = 'department'
        else if (h.includes('役職')) autoMapping[h] = 'title'
        else if (h.includes('郵便')) autoMapping[h] = 'postal_code'
        else if (h.includes('住所')) autoMapping[h] = 'address'
        else autoMapping[h] = 'skip'
      })
      setMapping(autoMapping)

      const rows = lines.slice(1).map((line) => {
        const values = line.split(',').map(v => v.trim().replace(/"/g, ''))
        const row: CSVRow = {}
        headerLine.forEach((h, i) => {
          row[h] = values[i] ?? ''
        })
        return row
      })
      setCsvData(rows)
      setStep(2)
    }
    reader.readAsText(file, 'UTF-8')
  }, [])

  const handleImport = async () => {
    setLoading(true)
    const supabase = createClient()
    let added = 0
    let skipped = 0

    for (const row of csvData) {
      const getValue = (field: MappingField): string => {
        const header = Object.entries(mapping).find(([, v]) => v === field)?.[0]
        return header ? (row[header] ?? '') : ''
      }

      const companyName = getValue('company_name')
      const fullName = getValue('full_name')
      if (!companyName || !fullName) {
        skipped++
        continue
      }

      // Upsert company
      let { data: company } = await supabase
        .from('target_companies')
        .select('id')
        .eq('name', companyName)
        .single()

      if (!company) {
        const { data: newCompany } = await supabase
          .from('target_companies')
          .insert({ name: companyName, industry: 'その他' })
          .select('id')
          .single()
        company = newCompany
      }

      if (!company) {
        skipped++
        continue
      }

      // Check duplicate
      const { data: existing } = await supabase
        .from('contacts')
        .select('id')
        .eq('company_id', company.id)
        .eq('full_name', fullName)
        .single()

      if (existing) {
        skipped++
        continue
      }

      const roleLevel = getValue('role_level')
      const { error } = await supabase.from('contacts').insert({
        company_id: company.id,
        full_name: fullName,
        department: getValue('department') || null,
        title: getValue('title') || null,
        role_level: ROLE_LEVELS.includes(roleLevel as typeof ROLE_LEVELS[number]) ? roleLevel : 'その他',
        postal_code: getValue('postal_code') || null,
        address: getValue('address') || null,
        info_source: 'その他',
        info_acquired_at: new Date().toISOString().split('T')[0],
      })

      if (error) {
        skipped++
      } else {
        added++
      }
    }

    setImportResult({ added, skipped })
    setStep(3)
    setLoading(false)
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">CSVインポート</h1>

      {/* Step 1: Upload */}
      {step === 1 && (
        <div className="mt-6">
          <div className="flex items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-white p-12">
            <div className="text-center">
              <p className="text-sm text-gray-600">CSVファイルをアップロード</p>
              <label className="mt-4 inline-flex cursor-pointer items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                ファイルを選択
                <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Mapping */}
      {step === 2 && (
        <div className="mt-6 space-y-6">
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">列のマッピング確認</h2>
            <div className="mt-4 space-y-3">
              {headers.map((header) => (
                <div key={header} className="flex items-center gap-4">
                  <span className="w-40 text-sm text-gray-700">{header}</span>
                  <span className="text-gray-400">→</span>
                  <select
                    value={mapping[header] ?? 'skip'}
                    onChange={(e) => setMapping(prev => ({ ...prev, [header]: e.target.value as MappingField }))}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900"
                  >
                    {FIELD_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <p className="text-sm text-gray-600">データ件数: {csvData.length}件</p>

          <button
            onClick={handleImport}
            disabled={loading}
            className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'インポート中...' : 'インポート実行'}
          </button>
        </div>
      )}

      {/* Step 3: Result */}
      {step === 3 && importResult && (
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">インポート結果</h2>
          <div className="mt-4 space-y-2 text-sm">
            <p className="text-green-700">新規追加: {importResult.added}件</p>
            <p className="text-gray-600">スキップ（重複等）: {importResult.skipped}件</p>
          </div>
        </div>
      )}
    </div>
  )
}
