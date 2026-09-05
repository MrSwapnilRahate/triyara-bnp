'use client'

import type { ActivityRecord } from '@triyara/db'
import { Button, EmptyState, Input, Spinner } from '@triyara/ui'
import { ACTIVITY_ENTITY_TYPES, ACTIVITY_TYPES } from '@triyara/validation'
import { Activity, FileText, ShieldCheck, Truck, Users } from 'lucide-react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

import { FilterSelect } from '@/components/data/filter-select'

/**
 * What each kind of record is, at a glance.
 *
 * The same icons the sidebar uses for these destinations, so the mark beside an
 * entry means the same thing here as it does in the navigation. This replaces
 * four hand-picked colour pairs whose only job was to be different from one
 * another - the icon carries the meaning, and the shape does not depend on
 * anybody being able to tell teal from violet.
 */
const ENTITY_ICON: Record<string, React.ReactNode> = {
  Account: <Users />,
  SupplierProfile: <Truck />,
  Document: <FileText />,
  Verification: <ShieldCheck />,
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
        <div className="mb-gap-lg flex flex-wrap items-center gap-gap">
          <Input
            type="search"
            size="sm"
            aria-label="Search activity"
            placeholder="Search…"
            defaultValue={sp.get('q') ?? ''}
            className="max-w-[14rem]"
            onKeyDown={(e) => {
              if (e.key === 'Enter') setParam('q', (e.target as HTMLInputElement).value)
            }}
          />
          <FilterSelect
            label="Entity"
            allLabel="All entities"
            value={sp.get('entityType') ?? undefined}
            onChange={(value) => setParam('entityType', value ?? '')}
            options={ACTIVITY_ENTITY_TYPES.map((t) => ({ value: t, label: t }))}
            className="w-44"
          />
          <FilterSelect
            label="Action"
            allLabel="All actions"
            value={sp.get('activityType') ?? undefined}
            onChange={(value) => setParam('activityType', value ?? '')}
            options={ACTIVITY_TYPES.map((t) => ({ value: t, label: t.replace(/_/g, ' ') }))}
            className="w-44"
          />
        </div>
      ) : null}

      {items.length === 0 ? (
        <div className="rounded-md border border-line bg-surface">
          <EmptyState
            icon={<Activity />}
            title="No activity yet"
            description="Actions across accounts, suppliers, documents and verifications will appear here."
          />
        </div>
      ) : (
        <ol className="space-y-gap-xs">
          {items.map((a) => {
            const href = linkFor(a)

            return (
              <li key={a.id}>
                {/* `relative` anchors the stretched link below: the whole row is
                    clickable, while the accessible name stays the description
                    rather than the row's every word run together. */}
                <div className="relative flex items-start gap-gap rounded-md border border-line bg-surface px-gap-lg py-gap transition-colors duration-fast hover:border-line-strong">
                  <span
                    aria-hidden="true"
                    className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-content-subtle [&_svg]:size-3.5"
                  >
                    {ENTITY_ICON[a.entityType] ?? <Activity />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-base text-content">
                      {href ? (
                        <Link
                          href={href}
                          className="focus-ring after:absolute after:inset-0 hover:underline"
                        >
                          {a.description}
                        </Link>
                      ) : (
                        a.description
                      )}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-gap-xs text-xs text-content-subtle">
                      <span>{a.actorType === 'system' ? 'system' : 'a user'}</span>
                      <span aria-hidden="true">&middot;</span>
                      <time dateTime={new Date(a.createdAt).toISOString()}>
                        {relTime(a.createdAt)}
                      </time>
                      <span className="font-mono">{a.eventName}</span>
                    </p>
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      )}

      <div ref={sentinel} className="h-8" />
      {loading ? (
        <p className="flex items-center justify-center gap-gap py-gap text-xs text-content-subtle">
          <Spinner size="xs" label={null} />
          Loading more…
        </p>
      ) : null}
      {cursor && !loading ? (
        <div className="mt-gap-xs flex justify-center">
          <Button variant="secondary" size="sm" onClick={() => void loadMore()}>
            Load more
          </Button>
        </div>
      ) : null}
    </div>
  )
}
