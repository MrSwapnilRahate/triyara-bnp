/** Response shapes for the admin API, from its route handlers. */

export interface DashboardSummary {
  rfqs: { total: number; draft: number; pendingApproval: number; issued: number; awarded: number }
  quotations: {
    total: number
    draft: number
    pendingApproval: number
    sent: number
    accepted: number
    expired: number
  }
  suppliers: { total: number; approved: number; pendingReview: number }
  products: { total: number; active: number }
  pendingApprovals: number
}

export interface MonthlyPoint {
  month: string
  count: number
}

export interface DashboardTrends {
  rfqs: MonthlyPoint[]
  quotations: MonthlyPoint[]
  supplierGrowth: MonthlyPoint[]
  topCountries: Array<{ country: string; suppliers: number }>
  approvalFunnel: {
    rfqs: Array<{ stage: string; count: number }>
    quotations: Array<{ stage: string; count: number }>
  }
  window: { months: number; from: string }
}

export interface AuditEntry {
  id: string
  entityType: string
  entityId: string
  actorId: string
  action: string
  /** Arbitrary JSON snapshots. Rendered, never interpreted. */
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  requestId: string | null
  createdAt: string
}

export interface Organization {
  id: string
  name: string
  slug: string
  logoUrl: string | null
  defaultCurrency: string
  timezone: string
  dateFormat: string
  language: string
  createdAt: string
  updatedAt: string
}

export interface Profile {
  id: string
  email: string
  name: string | null
  avatarUrl: string | null
  preferences: Record<string, unknown> | null
  roles: string[]
  organizationId: string
  lastLoginAt: string | null
}

export interface DirectoryUser {
  id: string
  name: string
  email: string
  avatarUrl: string | null
}

/** A month key like `2026-01-01` as `Jan 26`. */
export function monthLabel(month: string): string {
  const date = new Date(`${month}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return month
  return date.toLocaleDateString(undefined, { month: 'short', year: '2-digit', timeZone: 'UTC' })
}

/** PENDING_APPROVAL -> Pending approval. */
export function humanise(value: string): string {
  const lower = value.toLowerCase().replace(/_/g, ' ')
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

// ---- User administration (TRY-BNP-ADMIN-02, TRY-BNP-AUTH-03) ----

export type UserStatus = 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED'
export type RoleName = 'ADMIN' | 'EXPORT_MANAGER' | 'VERIFIER' | 'READ_ONLY'

/** A row of GET /api/v1/admin/users. */
export interface AdminUser {
  id: string
  name: string
  email: string
  avatarUrl: string | null
  status: UserStatus
  roles: RoleName[]
  lastLoginAt: string | null
  createdAt: string
}

/** A row of GET /api/v1/admin/users/:id/roles. */
export interface BaseRole {
  roleId: string
  name: RoleName
  description: string | null
}

/** A row of GET /api/v1/auth/sessions. */
export interface UserSession {
  id: string
  userId: string
  organizationId: string
  tokenId: string
  ipAddress: string | null
  userAgent: string | null
  createdAt: string
  lastSeenAt: string | null
  expiresAt: string
  endedAt: string | null
  endReason: string | null
}

/** A row of GET /api/v1/auth/login-attempts. */
export interface LoginAttempt {
  id: string
  email: string
  userId: string | null
  organizationId: string | null
  outcome: 'SUCCESS' | 'FAILED_PASSWORD' | 'FAILED_LOCKED' | 'FAILED_UNKNOWN_USER'
  ipAddress: string | null
  userAgent: string | null
  createdAt: string
}

/** A row of GET /api/v1/auth/role-assignments. */
export interface ScopedRoleAssignment {
  id: string
  userId: string
  scopeType: string
  scopeId: string
  grantedById: string
  grantedAt: string
  expiresAt: string | null
  revokedAt: string | null
  reason: string | null
  version: number
  role: { id: string; name: RoleName }
}

/**
 * GET /api/v1/auth/permission-matrix.
 *
 * Rendered verbatim. `actions` and `subjects` are the table's axes and arrive
 * with the response precisely so this app never keeps a permission list of its
 * own - the server derives all of it from `buildAbilityFor`.
 */
export interface PermissionMatrix {
  actions: string[]
  subjects: string[]
  roles: Array<{ role: RoleName; permissions: Record<string, string[]> }>
}
