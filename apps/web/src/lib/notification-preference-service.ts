import { createNotificationPreferenceService } from '@triyara/core'
import { notificationPreferenceRepository } from '@triyara/db'

export const notificationPreferenceService = createNotificationPreferenceService({
  repo: notificationPreferenceRepository,
})
