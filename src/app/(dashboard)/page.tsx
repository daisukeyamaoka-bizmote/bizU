import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  let status = 'not started'

  try {
    const supabase = await createClient()
    status = 'client created'

    // Just a simple query to test
    const { data, error } = await supabase
      .from('accounts')
      .select('id')
      .limit(1)

    if (error) {
      status = 'query error: ' + String(error.message)
    } else {
      status = 'query ok, rows: ' + String(data?.length ?? 0)
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    status = 'catch: ' + msg
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-neutral-900">ダッシュボード</h1>
      <p className="mt-4 text-neutral-600">Build: v7 - supabase test</p>
      <p className="mt-2 text-neutral-400">Status: {String(status)}</p>
    </div>
  )
}
