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

      {/* 要アクション */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-neutral-900">要アクション</h2>
        <div className="mt-4 space-y-3">
          <AlertCard text="送付から14日以上経過・反応記録なしの手紙を確認してください" />
          <AlertCard text="情報取得から6ヶ月超のコンタクトを更新してください" />
          <AlertCard text="次回アクション期日超過の案件を確認してください" />
        </div>
      </div>

      {/* メインCTA */}
      <div className="mt-8">
        <Link
          href="/letters/new"
          className="inline-flex items-center rounded-lg bg-neutral-900 px-6 py-3 text-sm font-medium text-white hover:bg-neutral-800"
        >
          + 手紙を生成する
        </Link>
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

function AlertCard({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-700">
      {text}
    </div>
  )
}
