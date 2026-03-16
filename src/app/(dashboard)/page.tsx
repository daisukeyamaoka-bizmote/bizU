import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  let sent = 0
  let reactions = 0
  let deals = 0
  let totalCompanies = 0
  let errorMsg = ''

  try {
    const supabase = await createClient()
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

    const { count: sentCount } = await supabase
      .from('letters')
      .select('*', { count: 'exact', head: true })
      .gte('sent_at', startOfMonth)

    const { count: reactionCount } = await supabase
      .from('reactions')
      .select('*', { count: 'exact', head: true })
      .gte('reacted_at', startOfMonth)

    const { count: dealCount } = await supabase
      .from('reactions')
      .select('*', { count: 'exact', head: true })
      .eq('reaction_type', '商談化')
      .gte('reacted_at', startOfMonth)

    const { count: totalCompanyCount } = await supabase
      .from('target_companies')
      .select('*', { count: 'exact', head: true })

    sent = sentCount ?? 0
    reactions = reactionCount ?? 0
    deals = dealCount ?? 0
    totalCompanies = totalCompanyCount ?? 0
  } catch (e) {
    errorMsg = e instanceof Error ? e.message : String(e)
  }

  const reactionRate = sent > 0 ? ((reactions / sent) * 100).toFixed(1) : '0.0'

  return (
    <div>
      <h1 className="text-2xl font-bold text-neutral-900">ダッシュボード</h1>

      {errorMsg && (
        <div className="mt-4 rounded-lg bg-red-50 p-4 text-sm text-red-700">
          DB Error: {errorMsg}
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-neutral-200 bg-white p-6">
          <p className="text-sm font-medium text-neutral-500">送付数</p>
          <p className="mt-2 text-3xl font-bold text-neutral-900">{String(sent)}通</p>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-6">
          <p className="text-sm font-medium text-neutral-500">反応数</p>
          <p className="mt-2 text-3xl font-bold text-neutral-900">{String(reactions)}件</p>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-6">
          <p className="text-sm font-medium text-neutral-500">反応率</p>
          <p className="mt-2 text-3xl font-bold text-neutral-900">{reactionRate}%</p>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-6">
          <p className="text-sm font-medium text-neutral-500">商談化</p>
          <p className="mt-2 text-3xl font-bold text-neutral-900">{String(deals)}件</p>
        </div>
      </div>

      <div className="mt-8">
        <h2 className="text-lg font-semibold text-neutral-900">データ資産</h2>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div className="rounded-lg border border-neutral-200 bg-white p-4 text-center">
            <p className="text-2xl font-bold text-neutral-900">{String(totalCompanies)}社</p>
            <p className="mt-1 text-xs text-neutral-500">取引先数</p>
          </div>
        </div>
      </div>

      <div className="mt-8">
        <h2 className="text-lg font-semibold text-neutral-900">CSVエクスポート</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <a href="/api/export?type=contacts" target="_blank" rel="noopener noreferrer"
             className="rounded-lg border border-neutral-200 bg-white px-4 py-3 text-sm hover:bg-neutral-50">
            コンタクトリスト
          </a>
          <a href="/api/export?type=letters" target="_blank" rel="noopener noreferrer"
             className="rounded-lg border border-neutral-200 bg-white px-4 py-3 text-sm hover:bg-neutral-50">
            手紙履歴
          </a>
          <a href="/api/export?type=reactions" target="_blank" rel="noopener noreferrer"
             className="rounded-lg border border-neutral-200 bg-white px-4 py-3 text-sm hover:bg-neutral-50">
            反応記録
          </a>
        </div>
      </div>
    </div>
  )
}
