import { z } from 'zod'

export const NOTIFICATION_TYPES = [
  'ACCOUNT',
  'SUPPLIER',
  'DOCUMENT',
  'VERIFICATION',
  'SYSTEM',
] as const
export const notificationTypeSchema = z.enum(NOTIFICATION_TYPES)
export type NotificationTypeName = z.infer<typeof notificationTypeSchema>

export const NOTIFICATION_CHANNELS = ['IN_APP', 'EMAIL', 'WEBHOOK', 'PUSH'] as const
export const notificationChannelSchema = z.enum(NOTIFICATION_CHANNELS)

export const NOTIFICATION_FILTERS = ['all', 'unread', 'read', 'archived'] as const

export const listNotificationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().optional(),
  q: z.string().trim().optional(),
  type: notificationTypeSchema.optional(),
  filter: z.enum(NOTIFICATION_FILTERS).default('all'),
})
export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>

export const updatePreferencesSchema = z.object({
  preferences: z
    .array(
      z.object({
        type: notificationTypeSchema,
        enabled: z.boolean().optional(),
        muted: z.boolean().optional(),
        digest: z.boolean().optional(),
        channels: z.array(notificationChannelSchema).max(4).optional(),
      }),
    )
    .min(1)
    .max(20),
})
export type UpdatePreferencesDto = z.infer<typeof updatePreferencesSchema>
