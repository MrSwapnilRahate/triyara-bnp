'use client'

import { Badge, EmptyState, Skeleton, StatusBadge } from '@triyara/ui'
import { CheckCircle2, FileEdit, History, Send, UserPlus } from 'lucide-react'
import type { ReactNode } from 'react'

import { InlineQueryError } from '@/components/data/query-boundary'

import { useRfqApprovals, useRfqRevisions } from '../api/rfqs'
import type { Rfq } from '../types'
import { humanise } from './humanise'

interface TimelineEntry {
  key: string
  at: number
  icon: ReactNode
  title: ReactNode
  detail?: ReactNode
}

/**
 * The workflow timeline (§9).
 *
 * Three real sources, merged and sorted by time: approval decisions, line-item
 * revisions, and supplier participation. Nothing here is inferred - an entry
 * appears because a timestamp exists for it. That matters because a fabricated
 * "Created" step sitting above real audit data reads as evidence when it is
 * decoration.
 */
export function RfqTimeline({ rfq }: { rfq: Rfq }) {
  const approvals = useRfqApprovals(rfq.id)
  const revisions = useRfqRevisions(rfq.id)

  if (approvals.isPending || revisions.isPending) {
    return (
      <div className="space-y-gap-lg" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex gap-gap-lg">
            <Skeleton className="h-8 w-8 rounded-full" />
            <div className="flex-1 space-y-gap-xs">
              <Skeleton variant="text" className="w-48" />
              <Skeleton variant="text" className="w-32" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (approvals.isError)
    return <InlineQueryError error={approvals.error} onRetry={() => void approvals.refetch()} />
  if (revisions.isError)
    return <InlineQueryError error={revisions.error} onRetry={() => void revisions.refetch()} />

  const entries: TimelineEntry[] = []

  for (const approval of approvals.data ?? []) {
    if (!approval.decidedAt) continue
    entries.push({
      key: `approval-${approval.id}`,
      at: new Date(approval.decidedAt).getTime(),
      icon: <CheckCircle2 className="h-4 w-4" />,
      title: (
        <>
          Moved to <StatusBadge status={approval.toStatus} size="sm" />
          {approval.fromStatus ? (
            <span className="text-content-subtle"> from {humanise(approval.fromStatus)}</span>
          ) : null}
        </>
      ),
      ...(approval.comments ? { detail: approval.comments } : {}),
    })
  }

  for (const revision of revisions.data ?? []) {
    entries.push({
      key: `revision-${revision.id}`,
      at: new Date(revision.changedAt).getTime(),
      icon: <FileEdit className="h-4 w-4" />,
      title: <>Revision {revision.revisionNumber}</>,
      ...(revision.reason ? { detail: revision.reason } : {}),
    })
  }

  for (const participation of rfq.suppliers) {
    const name = participation.supplier?.companyName ?? 'A supplier'
    if (participation.invitedAt) {
      entries.push({
        key: `invited-${participation.id}`,
        at: new Date(participation.invitedAt).getTime(),
        icon: <UserPlus className="h-4 w-4" />,
        title: <>{name} invited</>,
      })
    }
    if (participation.submittedAt) {
      entries.push({
        key: `submitted-${participation.id}`,
        at: new Date(participation.submittedAt).getTime(),
        icon: <Send className="h-4 w-4" />,
        title: (
          <>
            {name} submitted a bid
            {participation.isLate ? (
              <Badge tone="warning" size="sm" className="ml-gap">
                Late
              </Badge>
            ) : null}
          </>
        ),
      })
    } else if (participation.respondedAt) {
      entries.push({
        key: `responded-${participation.id}`,
        at: new Date(participation.respondedAt).getTime(),
        icon: <Send className="h-4 w-4" />,
        title: (
          <>
            {name} responded <StatusBadge status={participation.status} size="sm" />
          </>
        ),
      })
    }
  }

  if (entries.length === 0)
    return (
      <EmptyState
        size="sm"
        icon={<History />}
        title="Nothing has happened yet"
        description="Decisions, revisions and supplier activity appear here as they occur."
      />
    )

  // Newest first: the current state of play is what a sourcing desk opens this
  // panel to see.
  entries.sort((a, b) => b.at - a.at)

  return (
    <ol className="relative space-y-gap-lg">
      {entries.map((entry, index) => (
        <li key={entry.key} className="relative flex gap-gap-lg">
          <div className="relative flex flex-col items-center">
            <span
              aria-hidden="true"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-content-muted"
            >
              {entry.icon}
            </span>
            {index < entries.length - 1 ? (
              <span aria-hidden="true" className="mt-gap-xs w-px flex-1 bg-line" />
            ) : null}
          </div>
          <div className="min-w-0 flex-1 pb-gap-lg">
            <p className="flex flex-wrap items-center gap-gap text-base text-content">
              {entry.title}
            </p>
            <p className="mt-gap-xs text-xs text-content-subtle">
              <time dateTime={new Date(entry.at).toISOString()}>
                {new Date(entry.at).toLocaleString()}
              </time>
            </p>
            {entry.detail ? (
              <p className="mt-gap-xs text-sm text-content-muted">{entry.detail}</p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  )
}
