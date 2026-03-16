'use client'

import Sidebar from './Sidebar'
import HelpOverlay from './HelpOverlay'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen" style={{ background: 'var(--background)' }}>
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-8 py-8">
          {children}
        </div>
      </main>
      <HelpOverlay />
    </div>
  )
}
