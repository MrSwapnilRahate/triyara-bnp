import type { NotificationPriority, NotificationType } from '@triyara/db'
import type { DomainEvent } from '@triyara/events'

const TYPE_BY_PREFIX: Record<string, NotificationType> = {
  account: 'ACCOUNT',
  supplier: 'SUPPLIER',
  document: 'DOCUMENT',
  verification: 'VERIFICATION',
}
const ENTITY_BY_PREFIX: Record<string, string> = {
  account: 'Account',
  supplier: 'SupplierProfile',
  document: 'Document',
  verification: 'Verification',
}
const HIGH_ACTIONS = new Set([
  'approved',
  'rejected',
  'documents_requested',
  'suspended',
  'expired',
])

export interface MappedNotification {
  type: NotificationType
  priority: NotificationPriority
  title: string
  body: string
  entityType: string | null
  entityId: string | null
  accountId: string | null
}

function pickEntityId(data: Record<string, unknown>): string | null {
  for (const key of ['verificationId', 'documentId', 'supplierProfileId', 'accountId']) {
    if (typeof data[key] === 'string') return data[key] as string
  }
  return null
}

// Notification-specific projection (distinct from the Activity mapper): produces a
// user-facing title/body/priority + type. Unknown prefixes become SYSTEM notifications.
export function mapEventToNotification(event: DomainEvent): MappedNotification {
  const [prefix, ...rest] = event.type.split('.')
  const action = rest.join('.')
  const nice = action.replace(/_/g, ' ')
  const type = TYPE_BY_PREFIX[prefix ?? ''] ?? 'SYSTEM'
  const entityType = ENTITY_BY_PREFIX[prefix ?? ''] ?? null
  const data = (event.data ?? {}) as Record<string, unknown>
  const subject =
    type === 'VERIFICATION'
      ? 'Verification'
      : type === 'DOCUMENT'
        ? 'Document'
        : type === 'SUPPLIER'
          ? 'Supplier profile'
          : type === 'ACCOUNT'
            ? 'Account'
            : 'System'

  const suffix = typeof data.type === 'string' ? ` (${data.type})` : ''
  return {
    type,
    priority: HIGH_ACTIONS.has(action) ? 'HIGH' : 'NORMAL',
    title: `${subject} ${nice}`.trim(),
    body: `${subject} ${nice}${suffix}.`,
    entityType,
    entityId: pickEntityId(data),
    accountId: typeof data.accountId === 'string' ? data.accountId : null,
  }
}
