import { z } from 'zod'

import { ASSIGNABLE_ROLES, grantableRoleSchema } from './auth'
import { ALLOWED_MIME_TYPES } from './document'

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

// ---- Avatar ----

/**
 * The app-relative form an uploaded avatar is stored as.
 *
 * Constrained to the avatar route rather than "any path". A field that accepted
 * an arbitrary relative path would be a way to point one user's avatar at some
 * other endpoint of this API, which the browser would then fetch with the
 * viewer's cookies attached.
 */
// The `?v=` suffix is the stored object's checksum, written by the confirm step.
// It is what makes a replaced photo a different URL: the path alone never
// changes, so without it a browser holding a cached copy has no way to know the
// bytes behind it did. Optional, so a value written before versioning existed
// stays valid.
const AVATAR_PATH = /^\/api\/v1\/users\/[A-Za-z0-9_-]{1,64}\/avatar(\?v=[A-Za-z0-9]{1,64})?$/

/**
 * Where an avatar image lives: an absolute URL, or this app's avatar path.
 *
 * ADDITIVE ON PURPOSE. Every value written before avatars could be uploaded is
 * an absolute URL, and narrowing this would invalidate stored rows on the next
 * profile save. The path form is what the upload flow writes, and it cannot be
 * expressed by `.url()` at all - a relative reference is not a URL.
 *
 * Worth recording why the path form had to exist: the app serves its own CSP
 * with `img-src 'self'`, so an image on the storage host is refused whether it
 * is linked directly or arrived at through a redirect. Same-origin is the only
 * way an `<img>` renders here, and same-origin cannot be an absolute URL
 * without baking this deployment's hostname into the database.
 */
export const avatarUrlSchema = z
  .string()
  .trim()
  .max(2000)
  .refine((value) => AVATAR_PATH.test(value) || z.string().url().safeParse(value).success, {
    message: 'Must be an absolute URL or this application’s avatar path.',
  })

/** Avatars are displayed at 96px at most, so the cap is generous already. */
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024

/**
 * The image subset of the platform's upload allow-list.
 *
 * Derived from `ALLOWED_MIME_TYPES` rather than retyped, so a format can never
 * be accepted for an avatar that the rest of the platform refuses to store.
 */
export const AVATAR_MIME_TYPES = ALLOWED_MIME_TYPES.filter((mime) =>
  mime.startsWith('image/'),
) as unknown as readonly ['image/png', 'image/jpeg', 'image/webp']

export const avatarMimeSchema = z.enum(AVATAR_MIME_TYPES)
export type AvatarMimeType = z.infer<typeof avatarMimeSchema>

/**
 * What the client may say about the file it is about to upload.
 *
 * Neither field is trusted: the size is re-checked against the stored object on
 * confirmation, because a presigned PUT to S3 or R2 does not enforce one. There
 * is deliberately no user or account id here - both are taken from the session.
 */
export const presignAvatarSchema = z.object({
  mimeType: avatarMimeSchema,
  sizeBytes: z.number().int().positive().max(AVATAR_MAX_BYTES),
})
export type PresignAvatarDto = z.infer<typeof presignAvatarSchema>

/**
 * A user may change their own display name and nothing else. Email is the login
 * identifier and roles are granted by an administrator, so neither is editable
 * here - allowing either would be a privilege-escalation surface on an endpoint
 * that deliberately carries no ability check beyond authentication.
 */
export const updateProfileSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  avatarUrl: avatarUrlSchema.nullish(),
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
  role: grantableRoleSchema,
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
  /** Inclusive bounds on when the request was made. */
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
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

/** Date-range bounds for the admin access queue. Both inclusive. */
export const adminAccessDateRangeSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
})
