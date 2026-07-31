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
