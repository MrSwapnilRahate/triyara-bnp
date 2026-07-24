import { generateNotifications, mapEventToActivity } from '@triyara/core'
import {
  activityRepository,
  notificationPreferenceRepository,
  notificationRepository,
  orgUserRepository,
} from '@triyara/db'
import { createLoggingEventBus, type DomainEvent, type EventBus } from '@triyara/events'
import { logger } from '@triyara/lib'

// Composition-root event bus. Preserves logging, then fans each event out to independent,
// best-effort subscribers (a failure is logged and never breaks the mutation):
//   1. Activity ingestion (TRY-BNP-ACTIVITY-01) - unchanged.
//   2. Notification generation (TRY-BNP-NOTIFICATION-01) - added here.
// No module logic, event names or contracts are changed; no new events are emitted.
const logging = createLoggingEventBus(logger)

const notificationDeps = {
  notifications: notificationRepository,
  preferences: notificationPreferenceRepository,
  orgUsers: orgUserRepository,
}

export const eventBus: EventBus = {
  async emit(event) {
    await logging.emit(event)
    const e = event as DomainEvent

    try {
      await activityRepository.create(mapEventToActivity(e))
    } catch (err) {
      logger.error({ err: String(err), event: e.type }, 'activity.ingest_failed')
    }

    try {
      await generateNotifications(notificationDeps, e)
    } catch (err) {
      logger.error({ err: String(err), event: e.type }, 'notification.ingest_failed')
    }
  },
}
