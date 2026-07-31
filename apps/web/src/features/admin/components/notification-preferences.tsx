'use client'

import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  PageHeader,
  Skeleton,
  Switch,
  useToast,
} from '@triyara/ui'
import { NOTIFICATION_TYPES } from '@triyara/validation'
import { useState } from 'react'

import { InlineQueryError } from '@/components/data/query-boundary'
import { useDirtyGuard } from '@/features/quotations/components/use-dirty-guard'
import { describeApiError } from '@/lib/api-error'

import {
  type NotificationPreference,
  useNotificationPreferences,
  useUpdateNotificationPreferences,
} from '../api/admin'

/**
 * The categories the platform actually emits. Taken from NOTIFICATION_TYPES in
 * @triyara/validation rather than restated, so this screen cannot offer a
 * category the API would reject.
 */
const CATEGORY_LABELS: Record<string, { title: string; description: string }> = {
  ACCOUNT: {
    title: 'Accounts',
    description: 'Ownership changes, status moves and assignment on buyer and supplier accounts.',
  },
  SUPPLIER: {
    title: 'Suppliers',
    description: 'Onboarding progress, certification expiry and supplier record changes.',
  },
  DOCUMENT: {
    title: 'Documents',
    description: 'Uploads, new versions and requests for a document.',
  },
  VERIFICATION: {
    title: 'Verifications',
    description: 'Review outcomes, requests for more documents and reopened cases.',
  },
  SYSTEM: {
    title: 'System',
    description: 'Platform notices that are not tied to one record.',
  },
}

const CHANNELS = [
  { id: 'IN_APP', label: 'In-app' },
  { id: 'EMAIL', label: 'Email' },
]

/**
 * Notification preferences (§9).
 *
 * One row per category the backend emits, with a channel toggle each. Save
 * sends every row, because the API replaces the set rather than patching it -
 * sending only what changed would silently clear the rest.
 *
 * Reset restores the last saved state without a request; there is nothing to
 * undo on the server until Save is pressed.
 */
export function NotificationPreferences() {
  const toast = useToast()
  const stored = useNotificationPreferences()
  const update = useUpdateNotificationPreferences()

  const [draft, setDraft] = useState<NotificationPreference[] | null>(null)

  const saved: NotificationPreference[] = NOTIFICATION_TYPES.map((type) => {
    const existing = stored.data?.find((p) => p.type === type)
    return {
      type,
      enabled: existing?.enabled ?? true,
      muted: existing?.muted ?? false,
      digest: existing?.digest ?? false,
      channels: existing?.channels ?? ['IN_APP'],
    }
  })
  const rows = draft ?? saved
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(saved)

  useDirtyGuard(dirty && !update.isPending)

  if (stored.isPending)
    return (
      <div className="p-gutter" aria-busy="true">
        <Skeleton variant="text" className="h-6 w-64" />
        <Skeleton className="mt-gap-lg h-64 w-full max-w-3xl" />
      </div>
    )

  if (stored.isError)
    return (
      <div className="p-gutter">
        <InlineQueryError error={stored.error} onRetry={() => void stored.refetch()} />
      </div>
    )

  const setRow = (type: string, patch: Partial<NotificationPreference>) =>
    setDraft(rows.map((r) => (r.type === type ? { ...r, ...patch } : r)))

  const toggleChannel = (type: string, channel: string, on: boolean) => {
    const row = rows.find((r) => r.type === type)
    if (!row) return
    const channels = on
      ? [...new Set([...row.channels, channel])]
      : row.channels.filter((c) => c !== channel)
    setRow(type, { channels })
  }

  async function onSave() {
    try {
      // Every row, not just the changed ones: the endpoint replaces the set.
      await update.mutateAsync(rows)
      setDraft(null)
      toast.success('Notification preferences saved')
    } catch (error) {
      const described = describeApiError(error)
      toast.error(described.title, {
        ...(described.description ? { description: described.description } : {}),
        ...(described.requestId ? { requestId: described.requestId } : {}),
      })
    }
  }

  return (
    <>
      <PageHeader
        title="Notifications"
        description="What this platform tells you about, and where it reaches you."
        actions={
          <>
            <Button
              variant="ghost"
              disabled={!dirty || update.isPending}
              onClick={() => setDraft(null)}
            >
              Reset
            </Button>
            <Button
              variant="primary"
              loading={update.isPending}
              disabled={!dirty}
              onClick={() => void onSave()}
            >
              Save
            </Button>
          </>
        }
      />

      <div className="p-gutter">
        <div className="mx-auto grid max-w-3xl gap-gutter">
          {dirty && !update.isPending ? (
            <p className="text-xs text-content-subtle" role="status">
              Unsaved changes. Leaving this page will discard them.
            </p>
          ) : null}

          {/* The categories the brief named - approvals, RFQs, quotations,
              marketing - are not what this platform emits. Saying so is better
              than showing toggles that quietly control nothing. */}
          <Alert tone="info" title="These are the categories this platform emits">
            RFQ and quotation workflow events are delivered inside those modules and through the
            activity feed rather than as notification categories.
          </Alert>

          <Card>
            <CardHeader>
              <CardTitle as="h2">Categories</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y divide-line">
                {rows.map((row) => {
                  const meta = CATEGORY_LABELS[row.type]
                  return (
                    <li key={row.type} className="px-gutter py-gap-lg">
                      <div className="flex items-start justify-between gap-gap-lg">
                        <div className="min-w-0">
                          <p className="text-base font-medium text-content">
                            {meta?.title ?? row.type}
                          </p>
                          <p className="mt-gap-xs text-xs text-content-muted">
                            {meta?.description}
                          </p>
                        </div>
                        <Switch
                          checked={row.enabled}
                          onCheckedChange={(on) => setRow(row.type, { enabled: on })}
                          aria-label={`Enable ${meta?.title ?? row.type} notifications`}
                        />
                      </div>

                      <div className="mt-gap-lg flex flex-wrap items-center gap-section">
                        {CHANNELS.map((channel) => (
                          <label
                            key={channel.id}
                            className="flex items-center gap-gap text-xs text-content-muted"
                          >
                            <input
                              type="checkbox"
                              className="focus-ring"
                              checked={row.channels.includes(channel.id)}
                              disabled={!row.enabled}
                              onChange={(e) =>
                                toggleChannel(row.type, channel.id, e.target.checked)
                              }
                              aria-label={`${channel.label} for ${meta?.title ?? row.type}`}
                            />
                            {channel.label}
                          </label>
                        ))}

                        <label className="flex items-center gap-gap text-xs text-content-muted">
                          <input
                            type="checkbox"
                            className="focus-ring"
                            checked={row.digest}
                            disabled={!row.enabled}
                            onChange={(e) => setRow(row.type, { digest: e.target.checked })}
                            aria-label={`Daily digest for ${meta?.title ?? row.type}`}
                          />
                          Daily digest instead of each event
                        </label>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
