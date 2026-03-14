import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export default async function DashboardPage() {
  const supabase = await createClient()

  // 今月の送付数
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const { count: sentCount } = await supabase
    .from('letters')
    .select('*', { count: 'exact', head: true })
    .gte('sent_at', startOfMonth)

  // 今月の反応数
  const { count: reactionCount } = await supabase
    .from('reactions')
    .select('*', { count: 'exact', head: true })
    .gte('reacted_at', startOfMonth)

  // 商談化数
  const { count: dealCount } = await supabase
    .from('reactions')
    .select('*', { count: 'exact', head: true })
    .eq('reaction_type', '商談化')
    .gte('reacted_at', startOfMonth)

  // コンタクト数
  const { count: contactCount } = await supabase
    .from('contacts')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true)

  // ナレッジ数
  const { count: knowledgeCount } = await supabase
    .from('knowledge_items')
    .select('*', { count: 'exact', head: true })

  // プロジェクト数
  const { count: projectCount } = await supabase
    .from('projects')
    .select('*', { count: 'exact', head: true })
    .in('status', ['draft', 'active'])

  const sent = sentCount ?? 0
  const reactions = reactionCount ?? 0
  const deals = dealCount ?? 0
  const reactionRate = sent > 0 ? ((reactions / sent) * 100).toFixed(1) : '0.0'

  return (
    <div>
      <h1 className="text-2xl font-bold text-neutral-900">ダッシュボード</h1>

      {/* KPIカード */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard label="送付数" value={`${sent}通`} />
        <KPICard label="反応数" value={`${reactions}件`} />
        <KPICard label="反応率" value={`${reactionRate}%`} />
        <KPICard label="商談化" value={`${deals}件`} />
      </div>

      {/* 3ステップガイド */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-neutral-900">手紙作成の流れ</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <StepCard
            step={1}
            title="対象リストを登録"
            description="CSVで企業名・担当者情報をインポート。リストさえあればすぐに始められます。"
            href="/contacts/import"
            cta="リストをインポート"
            count={contactCount ?? 0}
            countLabel="件のコンタクト"
          />
          <StepCard
            step={2}
            title="ナレッジを追加"
            description="対象サービスの資料・URL・PDFを登録。プロダクトの優位性をAIが学習します。"
            href="/knowledge"
            cta="ナレッジを管理"
            count={knowledgeCount ?? 0}
            countLabel="件のナレッジ"
          />
          <StepCard
            step={3}
            title="手紙を作成"
            description="5社ずつ優先順位をつけて作成。企業IR・中計・人事異動を自動リサーチし、個別化された手紙を生成。"
            href="/projects"
            cta="プロジェクトへ"
            count={projectCount ?? 0}
            countLabel="件のプロジェクト"
          />
        </div>
      </div>

      {/* 要アクション */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-neutral-900">要アクション</h2>
        <div className="mt-4 space-y-3">
          <AlertCard text="送付から14日以上経過・反応記録なしの手紙を確認してください" />
          <AlertCard text="情報取得から6ヶ月超のコンタクトを更新してください" />
          <AlertCard text="次回アクション期日超過の案件を確認してください" />
        </div>
      </div>
    </div>
  )
}

function KPICard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-6">
      <p className="text-sm font-medium text-neutral-500">{label}</p>
      <p className="mt-2 text-3xl font-bold text-neutral-900">{value}</p>
    </div>
  )
}

function StepCard({
  step,
  title,
  description,
  href,
  cta,
  count,
  countLabel,
}: {
  step: number
  title: string
  description: string
  href: string
  cta: string
  count: number
  countLabel: string
}) {
  return (
    <div className="flex flex-col rounded-lg border border-neutral-200 bg-white p-6">
      <div className="flex items-center gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-900 text-sm font-bold text-white">
          {step}
        </span>
        <h3 className="text-base font-semibold text-neutral-900">{title}</h3>
      </div>
      <p className="mt-3 flex-1 text-sm leading-relaxed text-neutral-600">{description}</p>
      <div className="mt-4 flex items-center justify-between">
        <span className="text-sm text-neutral-500">{count}{countLabel}</span>
        <Link
          href={href}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
        >
          {cta}
        </Link>
      </div>
    </div>
  )
}

function AlertCard({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700">
      {text}
    </div>
  )
}
