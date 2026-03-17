'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Sidebar from './Sidebar'
import { useCurrentClient } from '@/lib/useCurrentClient'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { loading, hasClient } = useCurrentClient()
  const router = useRouter()
  const pathname = usePathname()
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    if (loading) return
    if (!hasClient && pathname !== '/onboarding') {
      router.replace('/onboarding')
    } else {
      setChecked(true)
    }
  }, [loading, hasClient, pathname, router])

  if (loading || !checked) {
    return (
      <div className="flex h-screen items-center justify-center bg-neutral-50">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-900" />
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-neutral-50">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-6xl px-8 py-8">
          {children}
        </div>
      </main>
    </div>
  )
}
