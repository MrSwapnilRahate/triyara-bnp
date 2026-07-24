import Link from 'next/link'
import type { ReactNode } from 'react'

import { NotificationBell } from '@/components/notification-bell'

const NAV = [
  { href: '/accounts', label: 'Accounts' },
  { href: '/documents', label: 'Documents' },
  { href: '/verifications', label: 'Verifications' },
  { href: '/activity', label: 'Activity' },
]

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="bg-navy-deep/90 sticky top-0 z-40 border-b border-white/10 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <nav className="flex items-center gap-5 text-sm">
            <Link href="/dashboard" className="text-gold font-bold">
              Triyara BNP
            </Link>
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="text-white/60 hover:text-white">
                {n.label}
              </Link>
            ))}
          </nav>
          <NotificationBell />
        </div>
      </header>
      {children}
    </div>
  )
}
