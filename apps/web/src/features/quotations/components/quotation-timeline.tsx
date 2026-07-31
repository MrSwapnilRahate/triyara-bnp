'use client'

import { Badge, EmptyState, Skeleton, StatusBadge } from '@triyara/ui'
import { CheckCircle2, FileEdit, History, Send, ThumbsUp } from 'lucide-react'
import type { ReactNode } from 'react'

import { InlineQueryError } from '@/components/data/query-boundary'

import { useApprovals, useRevisions } from '../api/quotations'
import { formatMoney, formatPercent, type Quotation } from '../types'
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
 * Three real sources merged and sorted: approval decisions, line revisions, and
 * the sent/accepted timestamps on the quotation itself. Every entry is backed by
 * a timestamp that exists - an entry with none is left out rather than given an
 * invented one, because a fabricated step sitting above real audit data reads as
 * evidence when it is decoration.
 *
 * An approval row carries the threshold and margin AT DECISION TIME, which is
 * what lets an auditor see why approval was required. `marginPercent` is null
 * for a caller who cannot `manage Account`; that absence is rendered as absence.
 */
export function QuotationTimeline({ quotation }: { quotation: Quotation }) {
  const approvals = useApprovals(quotation.id)
  const revisions = useRevisions(quotation.id)

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
      detail: (
        <>
          {approval.comments ? <span className="block">{approval.comments}</span> : null}
          {approval.thresholdAmount ? (
            <span className="block text-2xs text-content-subtle">
              Threshold at decision: {formatMoney(approval.thresholdAmount, quotation.currency)}
              {approval.marginPercent ? ` · margin ${formatPercent(approval.marginPercent)}` : ''}
            </span>
          ) : null}
        </>
      ),
    })
  }

  for (const revision of revisions.data ?? []) {
    entries.push({
      key: `revision-${revision.id}`,
      at: new Date(revision.changedAt).getTime(),
      icon: <FileEdit className="h-4 w-4" />,
      title: (
        <>
          Revision {revision.toRevision}
          {revision.fromRevision ? (
            <span className="text-content-subtle"> from {revision.fromRevision}</span>
          ) : null}
        </>
      ),
      ...(revision.reason ? { detail: revision.reason } : {}),
    })
  }

  if (quotation.sentAt) {
    entries.push({
      key: 'sent',
      at: new Date(quotation.sentAt).getTime(),
      icon: <Send className="h-4 w-4" />,
      title: <>Sent to the buyer</>,
      detail: 'Pricing froze at this point.',
    })
  }
  if (quotation.acceptedAt) {
    entries.push({
      key: 'accepted',
      at: new Date(quotation.acceptedAt).getTime(),
      icon: <ThumbsUp className="h-4 w-4" />,
      title: <>Accepted by the buyer</>,
    })
  }
  if (quotation.supersededAt) {
    entries.push({
      key: 'superseded',
      at: new Date(quotation.supersededAt).getTime(),
      icon: <FileEdit className="h-4 w-4" />,
      title: (
        <>
          Superseded by a later revision{' '}
          <Badge tone="neutral" size="sm">
            Superseded
          </Badge>
        </>
      ),
    })
  }

  if (entries.length === 0)
    return (
      <EmptyState
        size="sm"
        icon={<History />}
        title="Nothing has happened yet"
        description="Decisions, revisions and delivery milestones appear here as they occur."
      />
    )

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
              <div className="mt-gap-xs text-sm text-content-muted">{entry.detail}</div>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  )
}
