import { z } from 'zod'

// Auth extension (TRY-BNP-AUTH-02). Contracts for email verification, session
// registry, scoped role assignments and the login-attempt audit.

export const ROLE_SCOPE_TYPES = [
  'ORGANIZATION',
  'ACCOUNT',
  'SUPPLIER_PROFILE',
  'BUYER_PROFILE',
  'PRODUCT',
  'CATEGORY',
] as const
export const roleScopeTypeSchema = z.enum(ROLE_SCOPE_TYPES)
export type RoleScopeTypeName = z.infer<typeof roleScopeTypeSchema>

export const SESSION_END_REASONS = [
  'LOGOUT',
  'EXPIRED',
  'REVOKED_BY_ADMIN',
  'PASSWORD_CHANGED',
  'USER_DEACTIVATED',
] as const
export const sessionEndReasonSchema = z.enum(SESSION_END_REASONS)
export type SessionEndReasonName = z.infer<typeof sessionEndReasonSchema>

export const LOGIN_OUTCOMES = [
  'SUCCESS',
  'INVALID_CREDENTIALS',
  'USER_NOT_FOUND',
  'INACTIVE_USER',
  'LOCKED_OUT',
  'RATE_LIMITED',
] as const
export const loginOutcomeSchema = z.enum(LOGIN_OUTCOMES)
export type LoginOutcomeName = z.infer<typeof loginOutcomeSchema>

// Mirrors the frozen RoleName enum in @triyara/db. This is the full vocabulary:
// what a role may be CALLED. Reading, filtering and revoking all need ADMIN in
// it - you must be able to list the administrators and to take the role away.
export const ASSIGNABLE_ROLES = ['ADMIN', 'EXPORTER', 'VERIFIER', 'READ_ONLY'] as const
export const assignableRoleSchema = z.enum(ASSIGNABLE_ROLES)

/**
 * What a role-granting request body may ask for: everything except ADMIN.
 *
 * ADMIN is granted in exactly one way - a Super Admin approving an admin access
 * request - and the three services that hand out roles each refuse it. Refusing
 * it here too turns a 403 decided deep in a service into a 422 decided at the
 * edge, and stops the endpoint advertising a role it will never grant.
 *
 * A refinement rather than a narrower `z.enum`, deliberately. A narrower enum
 * would also narrow the inferred DTO type, and then `dto.role === 'ADMIN'` in
 * the services becomes a comparison TypeScript calls impossible - so the
 * service-layer refusals would have to be deleted as unreachable. They are the
 * layer that still holds if anything ever calls a service without going through
 * this schema, which is precisely the defence in depth worth keeping. The type
 * stays wide; only the runtime narrows.
 */
export const GRANTABLE_ROLES = ['EXPORTER', 'VERIFIER', 'READ_ONLY'] as const
export const grantableRoleSchema = assignableRoleSchema.refine(
  // Annotated `: boolean` on purpose. Left bare, `role !== 'ADMIN'` is inferred
  // as a type predicate, Zod picks its narrowing `refine` overload, and the DTO
  // type loses ADMIN after all - taking the service-layer guards with it.
  (role): boolean => role !== 'ADMIN',
  { message: 'ADMIN cannot be assigned directly. It requires an approved admin access request.' },
)

// ---- Email verification ----

export const requestEmailVerificationSchema = z.object({
  /** Defaults to the user's current address; supply to verify a new one. */
  email: z.string().trim().email().max(320).optional(),
})
export type RequestEmailVerificationDto = z.infer<typeof requestEmailVerificationSchema>

export const confirmEmailVerificationSchema = z.object({
  token: z.string().trim().min(20).max(200),
})
export type ConfirmEmailVerificationDto = z.infer<typeof confirmEmailVerificationSchema>

// ---- Sessions ----

export const listSessionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().optional(),
  /** Admin only; omitted means "my own sessions". */
  userId: z.string().optional(),
  activeOnly: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((v) => v === true || v === 'true')
    .optional(),
})
export type ListSessionsQuery = z.infer<typeof listSessionsQuerySchema>

export const revokeSessionSchema = z.object({
  reason: sessionEndReasonSchema.default('REVOKED_BY_ADMIN'),
})
export type RevokeSessionDto = z.infer<typeof revokeSessionSchema>

// ---- Scoped role assignments ----

export const grantScopedRoleSchema = z.object({
  userId: z.string().min(1),
  role: grantableRoleSchema,
  scopeType: roleScopeTypeSchema,
  scopeId: z.string().trim().min(1).max(200),
  /** Null/omitted means the grant does not expire. */
  expiresAt: z.coerce.date().optional(),
  reason: z.string().trim().max(500).optional(),
})
export type GrantScopedRoleDto = z.infer<typeof grantScopedRoleSchema>

export const listScopedRolesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().optional(),
  userId: z.string().optional(),
  role: assignableRoleSchema.optional(),
  scopeType: roleScopeTypeSchema.optional(),
  scopeId: z.string().optional(),
  activeOnly: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((v) => v === true || v === 'true')
    .optional(),
})
export type ListScopedRolesQuery = z.infer<typeof listScopedRolesQuerySchema>

export const revokeScopedRoleSchema = z.object({
  reason: z.string().trim().max(500).optional(),
})
export type RevokeScopedRoleDto = z.infer<typeof revokeScopedRoleSchema>

// ---- Login attempts (security audit) ----

export const listLoginAttemptsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().optional(),
  email: z.string().trim().optional(),
  userId: z.string().optional(),
  outcome: loginOutcomeSchema.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
})
export type ListLoginAttemptsQuery = z.infer<typeof listLoginAttemptsQuerySchema>

// ---- Base role membership (TRY-BNP-AUTH-03) ----

/**
 * Assigning a base role. The vocabulary is `GRANTABLE_ROLES`, shared with the
 * scoped-grant schema above rather than restated - both hand out a role, so
 * both stop short of ADMIN. Revoking still parses the wider list, because a
 * role you cannot name is a role you cannot take away.
 */
export const assignBaseRoleSchema = z.object({
  role: grantableRoleSchema,
})
export type AssignBaseRoleDto = z.infer<typeof assignBaseRoleSchema>
