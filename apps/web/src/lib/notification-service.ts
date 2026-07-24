import { createNotificationService } from '@triyara/core'
import { notificationRepository } from '@triyara/db'

export const notificationService = createNotificationService({ repo: notificationRepository })
