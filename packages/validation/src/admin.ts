import { z } from 'zod'

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

export const updateOrganizationSchema = z.object({
  name: z.string().trim().min(1).max(200),
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
  name: z.string().trim().min(1).max(120),
})
export type UpdateProfileDto = z.infer<typeof updateProfileSchema>
