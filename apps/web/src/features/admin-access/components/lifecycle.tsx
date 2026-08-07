import { Badge } from '@triyara/ui'

import type { AdminAccessRequest } from '../types'

/**
 * The complete life of one request, in order.
 *
 * Every stage that happened is shown with who did it and when; nothing is
 * hidden once a later stage arrives. A revoked request still shows its
 * approval, because "this was granted, then withdrawn" is a different fact
 * from "this was never granted", and an audit that cannot tell them apart is
 * not an audit.
 */

function when(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

interface Stage {
  label: string
  at: string | null
  by: string | null
  note: string | null
  tone: 'neutral' | 'success' | 'danger' | 'warning'
}

export function stagesOf(request: AdminAccessRequest): Stage[] {
  const stages: Stage[] = [
    {
      label: 'Requested',
      at: request.createdAt,
      by: request.requesterName,
      note: request.reason,
      tone: 'neutral',
    },
  ]

  if (request.status === 'REJECTED') {
    stages.push({
      label: 'Rejected',
      at: request.decidedAt,
      by: request.decidedByName ?? request.decidedById,
      note: request.decisionReason,
      tone: 'danger',
    })
    return stages
  }

  if (request.status === 'APPROVED' || request.status === 'REVOKED') {
    stages.push({
      label: 'Approved',
      at: request.decidedAt,
      by: request.decidedByName ?? request.decidedById,
      note: null,
      tone: 'success',
    })
  }

  if (request.status === 'REVOKED') {
    stages.push({
      label: 'Revoked',
      at: request.revokedAt,
      by: request.revokedByName ?? request.revokedById,
      note: request.revocationReason,
      tone: 'warning',
    })
  }

  return stages
}

export function Lifecycle({ request }: { request: AdminAccessRequest }) {
  const stages = stagesOf(request)

  return (
    <ol className="space-y-gap-lg">
      {stages.map((stage, index) => (
        <li key={stage.label} className="flex gap-gap-lg">
          <div className="flex flex-col items-center">
            <Badge tone={stage.tone} size="sm">
              {index + 1}
            </Badge>
            {index < stages.length - 1 ? (
              <span aria-hidden="true" className="mt-gap-xs w-px flex-1 bg-line" />
            ) : null}
          </div>
          <div className="pb-gap-xs">
            <p className="text-sm font-medium text-content">
              {stage.label}
              <span className="ml-gap font-normal text-content-muted">{when(stage.at)}</span>
            </p>
            <p className="text-xs text-content-subtle">by {stage.by ?? 'unknown'}</p>
            {stage.note ? (
              <p className="mt-gap-xs text-xs text-content-muted">{stage.note}</p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  )
}
