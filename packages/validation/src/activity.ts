import { z } from 'zod'

export const ACTIVITY_TYPES = [
  'CREATED',
  'UPDATED',
  'DELETED',
  'RESTORED',
  'ASSIGNED',
  'UPLOADED',
  'APPROVED',
  'REJECTED',
  'REQUESTED',
  'DOWNLOADED',
  'STATUS_CHANGED',
  'OTHER',
] as const
export const activityTypeSchema = z.enum(ACTIVITY_TYPES)
export type ActivityTypeName = z.infer<typeof activityTypeSchema>

export const ACTIVITY_ENTITY_TYPES = [
  'Account',
  'SupplierProfile',
  'Document',
  'Verification',
] as const

export const listActivitiesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().optional(),
  q: z.string().trim().optional(),
  accountId: z.string().optional(),
  actorId: z.string().optional(),
  entityType: z.string().optional(),
  eventName: z.string().optional(),
  activityType: activityTypeSchema.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
})
export type ListActivitiesQuery = z.infer<typeof listActivitiesQuerySchema>
