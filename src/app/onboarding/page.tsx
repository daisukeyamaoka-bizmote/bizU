'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState<1 | 2>(1)
  const [companyName, setCompanyName] = useState('')
  const [productName, setProductName] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSetup() {
    if (!companyName.trim()) return
    setSaving(true)
    const supabase = createClient()
    await supabase.from('clients').insert({
      name: companyName.trim(),
      product_name: productName.trim() || null,
      status: 'active',
    })
    setSaving(false)
    setStep(2)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900">bizU</h1>
          <p className="mt-1 text-sm text-neutral-500">ABMインテリジェンスプラットフォーム</p>
        </div>

        {/* Step indicator */}
        <div className="mt-8 flex gap-1">
          <div className={`h-1 flex-1 rounded-full ${step >= 1 ? 'bg-neutral-900' : 'bg-neutral-200'}`} />
          <div className={`h-1 flex-1 rounded-full ${step >= 2 ? 'bg-neutral-900' : 'bg-neutral-200'}`} />
        </div>

        {/* Step 1: Company Setup */}
        {step === 1 && (
          <div className="mt-6 rounded-xl border border-neutral-200 bg-white p-8">
            <h2 className="text-lg font-semibold text-neutral-900">はじめに、あなたの会社を登録しましょう</h2>
            <p className="mt-1 text-sm text-neutral-500">手紙作成に必要な基本情報です。あとから変更できます。</p>

            <div className="mt-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700">会社名 *</label>
                <input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="株式会社ビズモート"
                  className="mt-1 block w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700">主力プロダクト名</label>
                <input
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder="例: bizU, HR Cloud 等"
                  className="mt-1 block w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500"
                />
                <p className="mt-1 text-xs text-neutral-400">手紙の差出人情報に使用されます</p>
              </div>
            </div>

            <button
              onClick={handleSetup}
              disabled={!companyName.trim() || saving}
              className="mt-6 w-full rounded-lg bg-neutral-900 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              {saving ? '登録中...' : '登録して次へ'}
            </button>
          </div>
        )}

        {/* Step 2: Getting Started Guide */}
        {step === 2 && (
          <div className="mt-6 rounded-xl border border-neutral-200 bg-white p-8">
            <div className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50">
                <svg className="h-6 w-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="mt-3 text-lg font-semibold text-neutral-900">セットアップ完了!</h2>
              <p className="mt-1 text-sm text-neutral-500">以下の手順で手紙の送付を始められます</p>
            </div>

            <div className="mt-6 space-y-3">
              <GuideStep
                number={1}
                title="ナレッジを登録する"
                description="自社のプロダクト資料や事例をアップロードすると、AIがより精度の高い手紙を作成します"
                href="/knowledge"
              />
              <GuideStep
                number={2}
                title="プロジェクトを作る"
                description="「製造業向けコスト削減」のようなキャンペーン単位でプロジェクトを作成します"
                href="/projects"
              />
              <GuideStep
                number={3}
                title="リストをインポートする"
                description="Excel/CSVから送付先リストを取り込みます。プロジェクトに自動紐付けされます"
                href="/contacts/import"
              />
              <GuideStep
                number={4}
                title="手紙を生成 → 送付 → フォローコール"
                description="AIが個社別の手紙を生成。承認後に印刷・送付し、反応をログに記録します"
                href="/projects"
              />
            </div>

            <button
              onClick={() => router.push('/')}
              className="mt-6 w-full rounded-lg bg-neutral-900 py-2.5 text-sm font-medium text-white hover:bg-neutral-800"
            >
              ダッシュボードへ
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function GuideStep({
  number,
  title,
  description,
  href,
}: {
  number: number
  title: string
  description: string
  href: string
}) {
  return (
    <a
      href={href}
      className="flex gap-4 rounded-lg border border-neutral-100 p-4 transition-colors hover:border-neutral-300 hover:bg-neutral-50"
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-sm font-bold text-white">
        {number}
      </div>
      <div>
        <p className="text-sm font-semibold text-neutral-900">{title}</p>
        <p className="mt-0.5 text-xs text-neutral-500">{description}</p>
      </div>
    </a>
  )
}
