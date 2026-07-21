import { z } from 'zod'

import { paginationQuerySchema } from './pagination'

// Canonical relationship-status values. MUST stay in sync with the Prisma
// RelationshipStatus enum in @triyara/db (schema is the DB source of truth).
export const RELATIONSHIP_STATUSES = [
  'PROSPECT',
  'ACTIVE',
  'PREFERRED',
  'DORMANT',
  'BLACKLISTED',
] as const
export const relationshipStatusSchema = z.enum(RELATIONSHIP_STATUSES)
export type RelationshipStatus = z.infer<typeof relationshipStatusSchema>

const id = z.string().min(1).max(40)
const legalName = z.string().trim().min(2).max(120)
const country = z
  .string()
  .regex(/^[A-Za-z]{2}$/, 'Must be a 2-letter ISO country code')
  .transform((s) => s.toUpperCase())

export const createAccountSchema = z.object({
  legalName,
  displayName: z.string().trim().max(160).optional(),
  country: country.optional(),
  relationshipStatus: relationshipStatusSchema.optional(),
  source: z.string().trim().max(120).optional(),
  ownerId: id.optional(),
})
export type CreateAccountDto = z.infer<typeof createAccountSchema>

export const updateAccountSchema = z
  .object({
    legalName: legalName.optional(),
    displayName: z.string().trim().max(160).nullish(),
    country: country.nullish(),
    source: z.string().trim().max(120).nullish(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' })
export type UpdateAccountDto = z.infer<typeof updateAccountSchema>

export const assignOwnerSchema = z.object({ ownerId: id.nullable() })
export type AssignOwnerDto = z.infer<typeof assignOwnerSchema>

export const changeStatusSchema = z.object({ relationshipStatus: relationshipStatusSchema })
export type ChangeStatusDto = z.infer<typeof changeStatusSchema>

export const ACCOUNT_SORT_FIELDS = [
  'createdAt',
  'legalName',
  'updatedAt',
  'relationshipStatus',
] as const

export const listAccountsQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(120).optional(),
  country: z
    .string()
    .regex(/^[A-Za-z]{2}$/)
    .transform((s) => s.toUpperCase())
    .optional(),
  relationshipStatus: relationshipStatusSchema.optional(),
  ownerId: id.optional(),
  createdFrom: z.coerce.date().optional(),
  createdTo: z.coerce.date().optional(),
  includeDeleted: z.coerce.boolean().optional(),
})
export type ListAccountsQuery = z.infer<typeof listAccountsQuerySchema>

const bulkIds = z.array(id).min(1).max(500)
export const bulkAccountSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('assign_owner'),
    ids: bulkIds,
    payload: z.object({ ownerId: id.nullable() }),
  }),
  z.object({
    action: z.literal('set_status'),
    ids: bulkIds,
    payload: z.object({ relationshipStatus: relationshipStatusSchema }),
  }),
])
export type BulkAccountDto = z.infer<typeof bulkAccountSchema>
