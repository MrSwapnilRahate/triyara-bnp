import type {
  NotificationPreferenceRepository,
  NotificationRepository,
  RecipientSpec,
} from '@triyara/db'
import type { DomainEvent } from '@triyara/events'

import { mapEventToNotification } from './notification.mapper'

export interface OrgUserLookup {
  listActiveUserIds(orgId: string): Promise<string[]>
}

export interface NotificationGenDeps {
  notifications: NotificationRepository
  preferences: NotificationPreferenceRepository
  orgUsers: OrgUserLookup
}

// Notification subscriber: fans a consumed event out to org recipients, honouring each
// user's preference (default enabled, in-app). Emits NO events; a failure is the caller's
// concern (best-effort at the bus).
export async function generateNotifications(
  deps: NotificationGenDeps,
  event: DomainEvent,
): Promise<void> {
  const mapped = mapEventToNotification(event)
  const userIds = await deps.orgUsers.listActiveUserIds(event.organizationId)
  if (userIds.length === 0) return

  const prefs = await deps.preferences.getForUsers(event.organizationId, userIds, mapped.type)
  const recipients: RecipientSpec[] = []
  for (const userId of userIds) {
    const pref = prefs.get(userId)
    if (pref && (!pref.enabled || pref.muted)) continue // default: enabled
    recipients.push({ userId, channels: pref?.channels?.length ? pref.channels : ['IN_APP'] })
  }
  if (recipients.length === 0) return

  await deps.notifications.createWithRecipients(
    {
      organizationId: event.organizationId,
      type: mapped.type,
      priority: mapped.priority,
      actorId: event.actor.id,
      entityType: mapped.entityType,
      entityId: mapped.entityId,
      accountId: mapped.accountId,
      eventName: event.type,
      title: mapped.title,
      body: mapped.body,
      metadata: (event.data ?? {}) as Record<string, unknown>,
    },
    recipients,
  )
}
