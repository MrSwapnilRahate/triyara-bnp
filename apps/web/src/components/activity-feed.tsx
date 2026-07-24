'use client'

import type { ActivityRecord } from '@triyara/db'
import { ACTIVITY_ENTITY_TYPES, ACTIVITY_TYPES } from '@triyara/validation'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

const field =
  'rounded-lg border border-white/15 bg-navy/50 px-3 py-2 text-sm text-white focus:border-gold/60 focus:outline-none'

const ENTITY_STYLE: Record<string, string> = {
  Account: 'bg-blue-500/20 text-blue-300',
  SupplierProfile: 'bg-teal-500/20 text-teal-300',
  Document: 'bg-violet-500/20 text-violet-300',
  Verification: 'bg-amber-500/20 text-amber-300',
}

function relTime(iso: string | Date): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`
  return new Date(iso).toLocaleDateString()
}

function linkFor(a: ActivityRecord): string | null {
  if (a.entityType === 'Verification' && a.entityId) return `/verifications/${a.entityId}`
  if (a.entityType === 'Document') return '/documents'
  if (a.entityType === 'SupplierProfile' && a.accountId) return `/accounts/${a.accountId}/supplier`
  if (a.entityType === 'Account') return '/accounts'
  return null
}

export function ActivityFeed({
  initialItems,
  initialCursor,
  fetchBase,
  showFilters = true,
}: {
  initialItems: ActivityRecord[]
  initialCursor: string | null
  fetchBase: string
  showFilters?: boolean
}) {
  const router = useRouter()
  const sp = useSearchParams()
  const [items, setItems] = useState(initialItems)
  const [cursor, setCursor] = useState(initialCursor)
  const [loading, setLoading] = useState(false)
  const sentinel = useRef<HTMLDivElement>(null)

  // Reset when server re-renders with new filters.
  useEffect(() => {
    setItems(initialItems)
    setCursor(initialCursor)
  }, [initialItems, initialCursor])

  const loadMore = useCallback(async () => {
    if (!cursor || loading) return
    setLoading(true)
    try {
      const params = new URLSearchParams(sp.toString())
      params.set('cursor', cursor)
      const res = await fetch(`${fetchBase}?${params.toString()}`, { credentials: 'include' })
      const body = await res.json()
      if (body.success) {
        setItems((prev) => [...prev, ...(body.data as ActivityRecord[])])
        setCursor(body.meta?.pagination?.nextCursor ?? null)
      }
    } finally {
      setLoading(false)
    }
  }, [cursor, loading, sp, fetchBase])

  // Infinite scroll.
  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) void loadMore()
    })
    io.observe(el)
    return () => io.disconnect()
  }, [loadMore])

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(sp.toString())
    if (value) next.set(key, value)
    else next.delete(key)
    next.delete('cursor')
    router.push(`?${next.toString()}`)
  }

  return (
    <div>
      {showFilters ? (
        <div className="mb-5 flex flex-wrap gap-2">
          <input
            className={field}
            placeholder="Search..."
            defaultValue={sp.get('q') ?? ''}
            onKeyDown={(e) => {
              if (e.key === 'Enter') setParam('q', (e.target as HTMLInputElement).value)
            }}
          />
          <select
            className={field}
            defaultValue={sp.get('entityType') ?? ''}
            onChange={(e) => setParam('entityType', e.target.value)}
          >
            <option value="">All entities</option>
            {ACTIVITY_ENTITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select
            className={field}
            defaultValue={sp.get('activityType') ?? ''}
            onChange={(e) => setParam('activityType', e.target.value)}
          >
            <option value="">All actions</option>
            {ACTIVITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/15 py-16 text-center text-sm text-white/40">
          No activity yet. Actions across accounts, suppliers, documents and verifications will
          appear here.
        </div>
      ) : (
        <ol className="space-y-2">
          {items.map((a) => {
            const href = linkFor(a)
            const card = (
              <div className="flex items-start gap-3 rounded-lg border border-white/10 px-4 py-3 transition-colors hover:border-white/20">
                <span
                  className={`mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${ENTITY_STYLE[a.entityType] ?? 'bg-white/10 text-white/60'}`}
                >
                  {a.entityType.charAt(0)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white">{a.description}</p>
                  <p className="text-xs text-white/40">
                    {a.actorType === 'system' ? 'system' : 'a user'} &middot; {relTime(a.createdAt)}
                    <span className="ml-2 font-mono text-white/25">{a.eventName}</span>
                  </p>
                </div>
              </div>
            )
            return <li key={a.id}>{href ? <Link href={href}>{card}</Link> : card}</li>
          })}
        </ol>
      )}

      <div ref={sentinel} className="h-8" />
      {loading ? <p className="py-2 text-center text-xs text-white/40">Loading...</p> : null}
      {cursor && !loading ? (
        <div className="mt-2 text-center">
          <button onClick={() => void loadMore()} className="hover:text-gold text-sm text-white/60">
            Load more
          </button>
        </div>
      ) : null}
    </div>
  )
}
