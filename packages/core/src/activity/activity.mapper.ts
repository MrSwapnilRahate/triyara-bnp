import type { ActivityType, NewActivity } from '@triyara/db'
import type { DomainEvent } from '@triyara/events'

const ENTITY_BY_PREFIX: Record<string, string> = {
  account: 'Account',
  supplier: 'SupplierProfile',
  document: 'Document',
  verification: 'Verification',
}

const ACTIVITY_TYPE_BY_ACTION: Record<string, ActivityType> = {
  created: 'CREATED',
  updated: 'UPDATED',
  deleted: 'DELETED',
  restored: 'RESTORED',
  assigned: 'ASSIGNED',
  uploaded: 'UPLOADED',
  version_created: 'UPLOADED',
  approved: 'APPROVED',
  rejected: 'REJECTED',
  documents_requested: 'REQUESTED',
  status_changed: 'STATUS_CHANGED',
  submitted: 'STATUS_CHANGED',
  suspended: 'STATUS_CHANGED',
  reopened: 'STATUS_CHANGED',
  expired: 'STATUS_CHANGED',
  capability_changed: 'UPDATED',
  note_added: 'UPDATED',
  document_reviewed: 'UPDATED',
}

function pickEntityId(data: Record<string, unknown>): string | null {
  for (const key of ['verificationId', 'documentId', 'supplierProfileId', 'accountId']) {
    if (typeof data[key] === 'string') return data[key] as string
  }
  return null
}

function describe(entity: string, action: string, data: Record<string, unknown>): string {
  const nice = action.replace(/_/g, ' ')
  const suffix = typeof data.type === 'string' ? ` (${data.type})` : ''
  switch (entity) {
    case 'Document':
      return `Document ${nice}${suffix}`
    case 'Verification':
      return `Verification ${nice}`
    case 'SupplierProfile':
      return `Supplier profile ${nice}`
    case 'Account':
      return `Account ${nice}`
    default:
      return `${entity} ${nice}`
  }
}

// Pure mapping from a consumed domain event to an Activity row. New event families are
// picked up automatically (unknown prefixes map to a generic activity).
export function mapEventToActivity(event: DomainEvent): NewActivity {
  const [prefix, ...rest] = event.type.split('.')
  const action = rest.join('.')
  const entityType =
    ENTITY_BY_PREFIX[prefix ?? ''] ??
    (prefix ? prefix[0]!.toUpperCase() + prefix.slice(1) : 'Unknown')
  const data = (event.data ?? {}) as Record<string, unknown>

  return {
    organizationId: event.organizationId,
    accountId: typeof data.accountId === 'string' ? data.accountId : null,
    actorId: event.actor.id,
    actorType: event.actor.type,
    entityType,
    entityId: pickEntityId(data),
    eventName: event.type,
    activityType: ACTIVITY_TYPE_BY_ACTION[action] ?? 'OTHER',
    description: describe(entityType, action, data),
    metadata: data,
  }
}
