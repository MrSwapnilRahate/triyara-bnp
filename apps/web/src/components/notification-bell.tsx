'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

export function NotificationBell() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const res = await fetch('/api/v1/notifications/unread-count', { credentials: 'include' })
        const body = await res.json()
        if (alive && body.success) setCount(body.data.count as number)
      } catch {
        /* ignore */
      }
    }
    void load()
    const timer = setInterval(load, 30000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [])

  return (
    <Link
      href="/notifications"
      aria-label="Notifications"
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-white/70 hover:bg-white/5 hover:text-white"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        className="h-5 w-5"
      >
        <path
          d="M18 8A6 6 0 1 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M13.7 21a2 2 0 0 1-3.4 0" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {count > 0 ? (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold px-1 text-[10px] font-bold text-navy">
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
    </Link>
  )
}
