'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import {
  SquaresFour,
  FolderSimple,
  BookOpen,
  Users,
  EnvelopeSimple,
  ChartBar,
  TrendUp,
  ChartLineUp,
  SignOut,
} from '@phosphor-icons/react'

const navItems = [
  { href: '/', label: 'ダッシュボード', icon: SquaresFour },
  { href: '/contacts', label: '1. リスト管理', icon: Users },
  { href: '/knowledge', label: '2. ナレッジ', icon: BookOpen },
  { href: '/projects', label: '3. 手紙作成', icon: FolderSimple },
  { href: '/letters', label: '手紙一覧', icon: EnvelopeSimple },
  { href: '/cases', label: 'ケーススタディ', icon: ChartBar },
  { href: '/reactions', label: '反応記録', icon: TrendUp },
  { href: '/dashboard/intelligence', label: 'インテリジェンス', icon: ChartLineUp },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  return (
    <aside className="flex h-screen w-52 flex-col border-r border-neutral-200 bg-white">
      <div className="flex h-14 items-center px-5">
        <Link href="/" className="text-[17px] font-semibold tracking-tight text-black">
          bizU
        </Link>
      </div>
      <nav className="flex-1 space-y-0.5 px-2 py-3">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
          const IconComponent = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group flex items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13px] font-medium transition-all duration-150 ${
                isActive
                  ? 'bg-neutral-900 text-white'
                  : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900'
              }`}
            >
              <IconComponent
                size={16}
                weight={isActive ? 'fill' : 'regular'}
                className={`flex-shrink-0 ${isActive ? 'text-white' : 'text-neutral-400 group-hover:text-neutral-600'}`}
              />
              {item.label}
            </Link>
          )
        })}
      </nav>
      <div className="border-t border-neutral-200 px-2 py-2">
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13px] font-medium text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
        >
          <SignOut size={16} className="flex-shrink-0" />
          ログアウト
        </button>
      </div>
    </aside>
  )
}
