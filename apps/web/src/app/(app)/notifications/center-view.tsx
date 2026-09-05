'use client'

import type { NotificationFeedItem, PreferenceRecord } from '@triyara/db'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Input,
  PageHeader,
  Spinner,
  Switch,
} from '@triyara/ui'
import { NOTIFICATION_FILTERS, NOTIFICATION_TYPES } from '@triyara/validation'
import { BellOff } from 'lucide-react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useId, useRef, useState } from 'react'

import { FilterSelect } from '@/components/data/filter-select'

/**
 * Priority tones. Only HIGH and URGENT are shown at all - NORMAL and LOW carry
 * no badge, so the ones that do stand out instead of becoming wallpaper.
 */
const PRIORITY_TONE: Record<string, 'warning' | 'danger'> = { HIGH: 'warning', URGENT: 'danger' }

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
  const prefsPanelId = useId()

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

  const activeFilter = sp.get('filter') ?? 'all'

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Everything the platform has raised for your organization, newest first."
        actions={
          <>
            <Button
              variant="ghost"
              onClick={() => setShowPrefs((v) => !v)}
              aria-expanded={showPrefs}
              aria-controls={prefsPanelId}
            >
              Preferences
            </Button>
            <Button
              variant="secondary"
              onClick={() => void act(() => patch('/api/v1/notifications/read-all'))}
            >
              Mark all read
            </Button>
          </>
        }
      />

      <div className="p-gutter">
        <div className="mx-auto max-w-3xl">
          {showPrefs ? (
            <PreferencesPanel
              id={prefsPanelId}
              preferences={preferences}
              onSaved={() => router.refresh()}
            />
          ) : null}

          <div className="mt-gap-lg flex flex-wrap items-center gap-gap">
            <div
              role="group"
              aria-label="Filter by read state"
              className="inline-flex rounded-sm border border-line bg-surface p-0.5"
            >
              {NOTIFICATION_FILTERS.map((fl) => {
                const active = activeFilter === fl
                return (
                  <button
                    key={fl}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setParam('filter', fl === 'all' ? '' : fl)}
                    className={
                      active
                        ? 'focus-ring rounded-xs bg-accent px-2.5 py-1 text-xs font-medium capitalize text-accent-fg'
                        : 'focus-ring rounded-xs px-2.5 py-1 text-xs capitalize text-content-muted hover:bg-surface-sunken hover:text-content'
                    }
                  >
                    {fl}
                  </button>
                )
              })}
            </div>

            <FilterSelect
              label="Type"
              allLabel="All types"
              value={sp.get('type') ?? undefined}
              onChange={(value) => setParam('type', value ?? '')}
              options={NOTIFICATION_TYPES.map((t) => ({ value: t, label: t }))}
              className="w-40"
            />

            <Input
              type="search"
              size="sm"
              aria-label="Search notifications"
              placeholder="Search…"
              defaultValue={sp.get('q') ?? ''}
              className="max-w-[14rem]"
              onKeyDown={(e) => {
                if (e.key === 'Enter') setParam('q', (e.target as HTMLInputElement).value)
              }}
            />
          </div>

          {items.length === 0 ? (
            <div className="mt-gap-lg rounded-md border border-line bg-surface">
              <EmptyState
                icon={<BellOff />}
                title="No notifications"
                description="Notifications appear here as things happen across the platform."
              />
            </div>
          ) : (
            [...groups.entries()].map(([bucket, group]) => (
              <section key={bucket} className="mt-section">
                <h2 className="mb-gap text-2xs font-medium uppercase tracking-wide text-content-subtle">
                  {bucket}
                </h2>
                <ul className="space-y-gap-xs">
                  {group.map((it) => {
                    const n = it.notification
                    const href = linkFor(n)
                    const unread = !it.readAt

                    return (
                      <li key={it.id}>
                        {/* `relative` anchors the stretched link below. Actions are
                            siblings of the link rather than children of it: a button
                            inside an anchor is invalid markup and unreachable by
                            keyboard in the order a user expects. */}
                        <div
                          className={
                            unread
                              ? 'relative flex items-start gap-gap rounded-md border border-line bg-accent-subtle px-gap-lg py-gap'
                              : 'relative flex items-start gap-gap rounded-md border border-line bg-surface px-gap-lg py-gap'
                          }
                        >
                          <span
                            aria-hidden="true"
                            className={
                              unread
                                ? 'mt-1.5 size-2 shrink-0 rounded-full bg-accent'
                                : 'mt-1.5 size-2 shrink-0'
                            }
                          />
                          <div className="min-w-0 flex-1">
                            <p className="flex flex-wrap items-center gap-gap">
                              {href ? (
                                <Link
                                  href={href}
                                  className="focus-ring text-base font-medium text-content after:absolute after:inset-0"
                                >
                                  {n.title}
                                </Link>
                              ) : (
                                <span className="text-base font-medium text-content">
                                  {n.title}
                                </span>
                              )}
                              {unread ? <span className="sr-only">Unread</span> : null}
                              {PRIORITY_TONE[n.priority] ? (
                                <Badge tone={PRIORITY_TONE[n.priority]} size="sm">
                                  {n.priority}
                                </Badge>
                              ) : null}
                            </p>
                            <p className="mt-0.5 text-xs text-content-muted">{n.body}</p>
                            <p className="mt-0.5 text-xs text-content-subtle">
                              <time dateTime={new Date(it.createdAt).toISOString()}>
                                {relTime(it.createdAt)}
                              </time>{' '}
                              &middot; <span className="font-mono">{n.eventName}</span>
                            </p>
                          </div>
                          {/* Above the stretched link so these stay clickable. */}
                          <div className="relative z-raised flex shrink-0 gap-gap-xs">
                            {unread ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  void act(() => patch(`/api/v1/notifications/${it.id}/read`))
                                }
                              >
                                Read
                              </Button>
                            ) : null}
                            {!it.archivedAt ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  void act(() => patch(`/api/v1/notifications/${it.id}/archive`))
                                }
                              >
                                Archive
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))
          )}

          <div ref={sentinel} className="h-8" />
          {loading ? (
            <p className="flex items-center justify-center gap-gap py-gap text-xs text-content-subtle">
              <Spinner size="xs" label={null} />
              Loading more…
            </p>
          ) : null}
        </div>
      </div>
    </>
  )
}

function PreferencesPanel({
  id,
  preferences,
  onSaved,
}: {
  id: string
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
    <Card id={id}>
      <CardHeader>
        <CardTitle as="h2">Preferences</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-line">
          {prefs.map((p) => (
            <li
              key={p.type}
              className="flex flex-wrap items-center justify-between gap-gap-lg py-gap"
            >
              <span className="text-base text-content">{p.type}</span>
              <span className="flex items-center gap-gutter">
                <label className="flex items-center gap-gap text-xs text-content-muted">
                  <Switch checked={p.enabled} onCheckedChange={() => toggle(p.type, 'enabled')} />
                  Enabled
                </label>
                <label className="flex items-center gap-gap text-xs text-content-muted">
                  <Switch checked={p.muted} onCheckedChange={() => toggle(p.type, 'muted')} />
                  Muted
                </label>
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-gap-lg flex">
          <Button variant="primary" loading={saving} disabled={saving} onClick={() => void save()}>
            {saving ? 'Saving…' : 'Save preferences'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
