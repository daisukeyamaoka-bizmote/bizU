'use client'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-6">
      <h2 className="text-lg font-semibold text-red-800">エラーが発生しました</h2>
      <p className="mt-2 text-sm text-red-600">{String(error.message)}</p>
      <button
        onClick={reset}
        className="mt-4 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800"
      >
        再試行
      </button>
    </div>
  )
}
