import { mapEventToActivity } from '@triyara/core'
import { activityRepository } from '@triyara/db'
import { createLoggingEventBus, type DomainEvent, type EventBus } from '@triyara/events'
import { logger } from '@triyara/lib'

// Composition-root event bus. It preserves the existing logging behaviour and attaches
// the Activity subscriber (TRY-BNP-ACTIVITY-01) - the sanctioned "subscriber" mechanism
// of the event model. It changes NO module logic, event names or contracts; it only
// listens. Ingestion is best-effort: a failure is logged and never breaks the mutation.
const logging = createLoggingEventBus(logger)

export const eventBus: EventBus = {
  async emit(event) {
    await logging.emit(event)
    try {
      await activityRepository.create(mapEventToActivity(event as DomainEvent))
    } catch (err) {
      logger.error({ err: String(err), event: event.type }, 'activity.ingest_failed')
    }
  },
}
