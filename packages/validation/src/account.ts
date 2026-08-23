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

/**
 * Provisioning a portal login for an external party (TRY-BNP-EXT-PROVISION).
 *
 * The email is supplied by the administrator, deliberately, and is never derived
 * from the account's contact records. `BuyerContact.email` is nullable and not
 * unique, `isPrimary` is an index rather than a constraint, and both
 * registration forms accept a contact reachable only by phone or WhatsApp - so
 * an approved account may legitimately carry no email at all, or several. A
 * guess would be wrong quietly, and the thing being handed out is a credential.
 *
 * There is no `role` field. The only role this endpoint can produce is
 * EXTERNAL_PARTY, and a caller-supplied one would be a second way to choose a
 * role - which is exactly what ASSIGNABLE_ROLES and GRANTABLE_ROLES exist to
 * prevent.
 */
export const provisionAccountLoginSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email().max(254),
})
export type ProvisionAccountLoginDto = z.infer<typeof provisionAccountLoginSchema>

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
