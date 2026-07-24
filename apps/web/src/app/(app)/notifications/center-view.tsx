'use client'

import type { NotificationFeedItem, PreferenceRecord } from '@triyara/db'
import { NOTIFICATION_FILTERS, NOTIFICATION_TYPES } from '@triyara/validation'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

const field =
  'rounded-lg border border-white/15 bg-navy/50 px-3 py-2 text-sm text-white focus:border-gold/60 focus:outline-none'
const ghost = 'rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/70 hover:text-white'

const PRIORITY: Record<string, string> = { HIGH: 'text-amber-400', URGENT: 'text-red-400' }

async function patch(url: string): Promise<void> {
  await fetch(url, { method: 'PATCH', credentials: 'include' })
}

function relTime(iso: string | Date): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return new Date(iso).toLocaleDateString()
}
function dayBucket(iso: string | Date): string {
  const d = new Date(iso)
  const today = new Date()
  const yest = new Date(Date.now() - 86400000)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === yest.toDateString()) return 'Yesterday'
  return 'Earlier'
}
function linkFor(n: NotificationFeedItem['notification']): string | null {
  if (n.entityType === 'Verification' && n.entityId) return `/verifications/${n.entityId}`
  if (n.entityType === 'Document') return '/documents'
  if (n.entityType === 'SupplierProfile' && n.accountId) return `/accounts/${n.accountId}/supplier`
  if (n.entityType === 'Account') return '/accounts'
  return null
}

export function NotificationCenter({
  initialItems,
  initialCursor,
  preferences,
}: {
  initialItems: NotificationFeedItem[]
  initialCursor: string | null
  preferences: PreferenceRecord[]
}) {
  const router = useRouter()
  const sp = useSearchParams()
  const [items, setItems] = useState(initialItems)
  const [cursor, setCursor] = useState(initialCursor)
  const [loading, setLoading] = useState(false)
  const [showPrefs, setShowPrefs] = useState(false)
  const sentinel = useRef<HTMLDivElement>(null)

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
      const res = await fetch(`/api/v1/notifications?${params.toString()}`, {
        credentials: 'include',
      })
      const body = await res.json()
      if (body.success) {
        setItems((prev) => [...prev, ...(body.data as NotificationFeedItem[])])
        setCursor(body.meta?.pagination?.nextCursor ?? null)
      }
    } finally {
      setLoading(false)
    }
  }, [cursor, loading, sp])

  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const io = new IntersectionObserver((e) => {
      if (e[0]?.isIntersecting) void loadMore()
    })
    io.observe(el)
    return () => io.disconnect()
  }, [loadMore])

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(sp.toString())
    if (value) next.set(key, value)
    else next.delete(key)
    next.delete('cursor')
    router.push(`/notifications?${next.toString()}`)
  }

  async function act(fn: () => Promise<void>) {
    await fn()
    router.refresh()
  }

  const groups = new Map<string, NotificationFeedItem[]>()
  for (const it of items) {
    const b = dayBucket(it.createdAt)
    ;(groups.get(b) ?? groups.set(b, []).get(b)!).push(it)
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-gold text-2xl font-bold">Notifications</h1>
        <div className="flex gap-2">
          <button className={ghost} onClick={() => setShowPrefs((v) => !v)}>
            Preferences
          </button>
          <button
            className={ghost}
            onClick={() => void act(() => patch('/api/v1/notifications/read-all'))}
          >
            Mark all read
          </button>
        </div>
      </div>

      {showPrefs ? (
        <PreferencesPanel preferences={preferences} onSaved={() => router.refresh()} />
      ) : null}

      <div className="mt-5 flex flex-wrap gap-2">
        {NOTIFICATION_FILTERS.map((fl) => (
          <button
            key={fl}
            onClick={() => setParam('filter', fl === 'all' ? '' : fl)}
            className={`rounded-lg px-3 py-1.5 text-sm capitalize ${(sp.get('filter') ?? 'all') === fl ? 'bg-gold text-navy' : 'border border-white/15 text-white/60 hover:text-white'}`}
          >
            {fl}
          </button>
        ))}
        <select
          className={field}
          defaultValue={sp.get('type') ?? ''}
          onChange={(e) => setParam('type', e.target.value)}
        >
          <option value="">All types</option>
          {NOTIFICATION_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <input
          className={field}
          placeholder="Search..."
          defaultValue={sp.get('q') ?? ''}
          onKeyDown={(e) => {
            if (e.key === 'Enter') setParam('q', (e.target as HTMLInputElement).value)
          }}
        />
      </div>

      {items.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-white/15 py-16 text-center text-sm text-white/40">
          Nothing here. Notifications appear as things happen across the platform.
        </div>
      ) : (
        [...groups.entries()].map(([bucket, group]) => (
          <section key={bucket} className="mt-6">
            <h2 className="mb-2 text-xs uppercase tracking-widest text-white/40">{bucket}</h2>
            <ul className="space-y-2">
              {group.map((it) => {
                const n = it.notification
                const href = linkFor(n)
                const unread = !it.readAt
                const inner = (
                  <div
                    className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${unread ? 'border-gold/30 bg-gold/[0.04]' : 'border-white/10'}`}
                  >
                    {unread ? (
                      <span className="bg-gold mt-1.5 h-2 w-2 flex-shrink-0 rounded-full" />
                    ) : (
                      <span className="mt-1.5 h-2 w-2 flex-shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-white">
                        {n.title}
                        {n.priority !== 'NORMAL' && n.priority !== 'LOW' ? (
                          <span className={`ml-2 text-xs ${PRIORITY[n.priority] ?? ''}`}>
                            {n.priority}
                          </span>
                        ) : null}
                      </p>
                      <p className="text-xs text-white/50">{n.body}</p>
                      <p className="text-xs text-white/30">
                        {relTime(it.createdAt)} &middot;{' '}
                        <span className="font-mono">{n.eventName}</span>
                      </p>
                    </div>
                    <div className="flex flex-shrink-0 gap-1">
                      {unread ? (
                        <button
                          className={ghost}
                          onClick={(e) => {
                            e.preventDefault()
                            void act(() => patch(`/api/v1/notifications/${it.id}/read`))
                          }}
                        >
                          Read
                        </button>
                      ) : null}
                      {!it.archivedAt ? (
                        <button
                          className={ghost}
                          onClick={(e) => {
                            e.preventDefault()
                            void act(() => patch(`/api/v1/notifications/${it.id}/archive`))
                          }}
                        >
                          Archive
                        </button>
                      ) : null}
                    </div>
                  </div>
                )
                return <li key={it.id}>{href ? <Link href={href}>{inner}</Link> : inner}</li>
              })}
            </ul>
          </section>
        ))
      )}

      <div ref={sentinel} className="h-8" />
      {loading ? <p className="py-2 text-center text-xs text-white/40">Loading...</p> : null}
    </div>
  )
}

function PreferencesPanel({
  preferences,
  onSaved,
}: {
  preferences: PreferenceRecord[]
  onSaved: () => void
}) {
  const [prefs, setPrefs] = useState(preferences)
  const [saving, setSaving] = useState(false)

  function toggle(type: string, key: 'enabled' | 'muted') {
    setPrefs((prev) => prev.map((p) => (p.type === type ? { ...p, [key]: !p[key] } : p)))
  }

  async function save() {
    setSaving(true)
    try {
      await fetch('/api/v1/notification-preferences', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          preferences: prefs.map((p) => ({ type: p.type, enabled: p.enabled, muted: p.muted })),
        }),
      })
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-white/10 p-4">
      <p className="text-xs uppercase tracking-widest text-white/40">Preferences (per type)</p>
      <ul className="mt-3 space-y-2">
        {prefs.map((p) => (
          <li key={p.type} className="flex items-center justify-between text-sm">
            <span className="text-white/80">{p.type}</span>
            <span className="flex gap-4">
              <label className="flex items-center gap-1 text-white/60">
                <input
                  type="checkbox"
                  checked={p.enabled}
                  onChange={() => toggle(p.type, 'enabled')}
                />{' '}
                enabled
              </label>
              <label className="flex items-center gap-1 text-white/60">
                <input type="checkbox" checked={p.muted} onChange={() => toggle(p.type, 'muted')} />{' '}
                muted
              </label>
            </span>
          </li>
        ))}
      </ul>
      <button
        className="bg-gold text-navy hover:bg-gold-light mt-4 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
        disabled={saving}
        onClick={() => void save()}
      >
        {saving ? 'Saving...' : 'Save preferences'}
      </button>
    </div>
  )
}
