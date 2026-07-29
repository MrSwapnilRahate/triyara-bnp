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

// Mirrors the frozen RoleName enum in @triyara/db.
export const ASSIGNABLE_ROLES = ['ADMIN', 'EXPORT_MANAGER', 'VERIFIER', 'READ_ONLY'] as const
export const assignableRoleSchema = z.enum(ASSIGNABLE_ROLES)

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
  role: assignableRoleSchema,
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
