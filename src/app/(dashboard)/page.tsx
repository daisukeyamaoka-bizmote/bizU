import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  // Just read cookies to make this truly dynamic - no Supabase
  const cookieStore = await cookies()
  const cookieCount = cookieStore.getAll().length

  return (
    <div>
      <h1 className="text-2xl font-bold text-neutral-900">ダッシュボード</h1>
      <p className="mt-4 text-neutral-600">Build: v6 - async dynamic test</p>
      <p className="mt-2 text-neutral-400">Cookies: {String(cookieCount)}</p>
    </div>
  )
}
