import { z } from 'zod'

import { ASSIGNABLE_ROLES } from './auth'

// Administration contracts (TRY-BNP-ADMIN-01): the audit trail, organization
// settings and the caller's own profile.

// ---- Audit log ----

/**
 * The audit trail is read-only over HTTP. There is no create, update or delete
 * schema here on purpose: rows are written by the repositories inside the same
 * transaction as the change they describe, and a trail an operator can edit is
 * not a trail.
 */
export const listAuditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
  /** Narrow to one entity kind, e.g. `RFQ`, `Quotation`, `Supplier`. */
  entityType: z.string().trim().max(60).optional(),
  /** Narrow to one record; requires entityType to be meaningful. */
  entityId: z.string().min(1).optional(),
  actorId: z.string().min(1).optional(),
  /** Narrow to one action, e.g. `rfq.issued`. */
  action: z.string().trim().max(80).optional(),
  /** Free text over action and entityType. */
  q: z.string().trim().max(120).optional(),
  requestId: z.string().trim().max(80).optional(),
  before: z.coerce.date().optional(),
  after: z.coerce.date().optional(),
})
export type ListAuditQuery = z.infer<typeof listAuditQuerySchema>

// ---- Organization settings ----

const iso4217 = z
  .string()
  .trim()
  .length(3)
  .regex(/^[A-Z]{3}$/, 'Must be an ISO 4217 code.')

export const DATE_FORMATS = ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD', 'DD MMM YYYY'] as const
export const UI_LANGUAGES = ['en', 'hi', 'ar', 'fr', 'es'] as const

/**
 * Tenant-wide DISPLAY settings. Every field is optional so a caller may change
 * one without restating the rest.
 *
 * `defaultCurrency` governs what a new document is proposed in - it does not
 * restate documents already written. A quotation stores its own currency and a
 * sent one is a commitment, so changing this must never alter what a buyer was
 * quoted.
 */
export const updateOrganizationSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  logoUrl: z.string().trim().url().max(2000).nullish(),
  defaultCurrency: iso4217.optional(),
  timezone: z.string().trim().min(1).max(64).optional(),
  dateFormat: z.enum(DATE_FORMATS).optional(),
  language: z.enum(UI_LANGUAGES).optional(),
})
export type UpdateOrganizationDto = z.infer<typeof updateOrganizationSchema>

// ---- Profile ----

/**
 * A user may change their own display name and nothing else. Email is the login
 * identifier and roles are granted by an administrator, so neither is editable
 * here - allowing either would be a privilege-escalation surface on an endpoint
 * that deliberately carries no ability check beyond authentication.
 */
export const updateProfileSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  avatarUrl: z.string().trim().url().max(2000).nullish(),
  /**
   * UI choices the server stores but never interprets - density, default
   * landing tab, and so on. Free-form so adding one needs no migration;
   * anything the server acts on gets a column instead.
   */
  preferences: z.record(z.string(), z.unknown()).optional(),
})
export type UpdateProfileDto = z.infer<typeof updateProfileSchema>

// ---- Password ----

/**
 * Changing your own password requires proving you know the current one, so a
 * hijacked session cannot lock the real owner out.
 */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Required.'),
  newPassword: z
    .string()
    .min(12, 'Use at least 12 characters.')
    .max(200)
    .regex(/[a-z]/, 'Include a lowercase letter.')
    .regex(/[A-Z]/, 'Include an uppercase letter.')
    .regex(/[0-9]/, 'Include a digit.'),
})
export type ChangePasswordDto = z.infer<typeof changePasswordSchema>

// ---- Directory (global search) ----

export const listUsersQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  q: z.string().trim().max(120).optional(),
})
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>

// ---- User administration ----

/** Mirrors the Prisma `UserStatus` enum. */
export const USER_STATUSES = ['INVITED', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED'] as const

/**
 * Sortable columns, each in both directions with a `-` prefix for descending -
 * the convention the supplier and account lists already use.
 *
 * `lastLoginAt` is deliberately absent. It is nullable, and keyset pagination
 * over a nullable column either drops the rows whose value is NULL or repeats
 * them, depending on where the database puts the nulls. Offering the sort and
 * quietly losing never-signed-in users would be worse than not offering it.
 */
export const ADMIN_USER_SORTS = [
  'createdAt',
  '-createdAt',
  'name',
  '-name',
  'email',
  '-email',
] as const

/**
 * The administrator's view of the tenant's people (TRY-BNP-ADMIN-02).
 *
 * Distinct from `listUsersQuerySchema` above, which backs the directory lookup
 * behind global search. That one is intentionally narrow - active users only,
 * four fields, no paging - and stays exactly as it is. This one is cursor
 * paginated, sees every status, and is gated on `manage User`.
 */
export const listAdminUsersQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().optional(),
  /** Free text over name and email. */
  q: z.string().trim().max(120).optional(),
  status: z.enum(USER_STATUSES).optional(),
  /** Users holding this role. */
  role: z.enum(ASSIGNABLE_ROLES).optional(),
  sort: z.enum(ADMIN_USER_SORTS).optional(),
})
export type ListAdminUsersQuery = z.infer<typeof listAdminUsersQuerySchema>

/**
 * Inviting a colleague.
 *
 * No password field, deliberately: the invitee sets their own through the
 * invitation link. An admin who could choose someone else's password would
 * hold a credential they have no reason to hold.
 */
export const inviteUserSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email().max(254),
  role: z.enum(ASSIGNABLE_ROLES),
})
export type InviteUserDto = z.infer<typeof inviteUserSchema>

// ---- Dashboard trends ----

export const TREND_WINDOWS = ['3m', '6m', '12m'] as const

export const trendsQuerySchema = z.object({
  /** How far back to group by month. */
  window: z.enum(TREND_WINDOWS).default('6m'),
})
export type TrendsQuery = z.infer<typeof trendsQuerySchema>

// ---- Admin access requests (TRY-BNP-SUPERADMIN-01) ----

export const ADMIN_ACCESS_REQUEST_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'REVOKED'] as const
export const adminAccessRequestStatusSchema = z.enum(ADMIN_ACCESS_REQUEST_STATUSES)
export type AdminAccessRequestStatusName = z.infer<typeof adminAccessRequestStatusSchema>

/**
 * Asking for administrator access.
 *
 * A reason is required and has a floor: "please" tells the super administrator
 * nothing, and the whole point of the record is that the decision can be
 * justified later.
 */
export const createAdminAccessRequestSchema = z.object({
  reason: z.string().trim().min(20).max(2000),
})
export type CreateAdminAccessRequestDto = z.infer<typeof createAdminAccessRequestSchema>

/** Rejecting. The reason is mandatory - a refusal with no grounds is unusable. */
export const rejectAdminAccessRequestSchema = z.object({
  reason: z.string().trim().min(10).max(2000),
})
export type RejectAdminAccessRequestDto = z.infer<typeof rejectAdminAccessRequestSchema>

export const listAdminAccessRequestsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().optional(),
  status: adminAccessRequestStatusSchema.optional(),
  /** Free text over requester name, email and reason. */
  q: z.string().trim().max(120).optional(),
  sort: z
    .enum(['createdAt', '-createdAt', 'requesterName', '-requesterName', 'status', '-status'])
    .optional(),
})
export type ListAdminAccessRequestsQuery = z.infer<typeof listAdminAccessRequestsQuerySchema>

/** Revoking. A reason is mandatory - the person is told why they lost access. */
export const revokeAdminAccessSchema = z.object({
  reason: z.string().trim().min(10).max(2000),
})
export type RevokeAdminAccessDto = z.infer<typeof revokeAdminAccessSchema>
