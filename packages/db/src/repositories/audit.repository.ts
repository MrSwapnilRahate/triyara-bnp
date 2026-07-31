import type { Prisma } from '@prisma/client'

import { prisma } from '../client'
import { decodeCursor, encodeCursor } from './account.repository'

/**
 * Audit trail reads (TRY-BNP-ADMIN-01).
 *
 * Read-only by design. Rows are written by `writeAudit` inside the same
 * transaction as the change they describe; there is no update or delete here,
 * because a trail an operator can rewrite is not a trail.
 *
 * Every query is scoped by organizationId, matched by the
 * `[organizationId, createdAt]` and `[organizationId, entityType, entityId]`
 * indexes the model already carries - so the two access patterns this supports
 * (a chronological feed, and the history of one record) are both indexed.
 */

const auditSelect = {
  id: true,
  entityType: true,
  entityId: true,
  actorId: true,
  action: true,
  before: true,
  after: true,
  requestId: true,
  createdAt: true,
} satisfies Prisma.AuditLogSelect

export type AuditRecord = Prisma.AuditLogGetPayload<{ select: typeof auditSelect }>

export interface ListAuditParams {
  limit: number
  cursor?: string
  entityType?: string
  entityId?: string
  actorId?: string
  action?: string
  q?: string
  requestId?: string
  before?: Date
  after?: Date
}

export interface AuditListResult {
  items: AuditRecord[]
  nextCursor: string | null
}

export const auditRepository = {
  async list(organizationId: string, params: ListAuditParams): Promise<AuditListResult> {
    const where: Prisma.AuditLogWhereInput = {
      organizationId,
      ...(params.entityType ? { entityType: params.entityType } : {}),
      ...(params.entityId ? { entityId: params.entityId } : {}),
      ...(params.actorId ? { actorId: params.actorId } : {}),
      ...(params.action ? { action: params.action } : {}),
      ...(params.requestId ? { requestId: params.requestId } : {}),
      ...(params.after || params.before
        ? {
            createdAt: {
              ...(params.after ? { gte: params.after } : {}),
              ...(params.before ? { lte: params.before } : {}),
            },
          }
        : {}),
      ...(params.q
        ? {
            OR: [
              { action: { contains: params.q, mode: 'insensitive' } },
              { entityType: { contains: params.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    }

    // Keyset, never offset: an audit feed grows without bound, and OFFSET on a
    // large table degrades exactly when the trail is most worth reading.
    // Ordered by id alongside createdAt so ties within the same millisecond -
    // common, since one request writes several rows - cannot repeat or skip.
    const rows = await prisma.auditLog.findMany({
      where,
      take: params.limit + 1,
      ...(params.cursor ? { cursor: { id: decodeCursor(params.cursor) }, skip: 1 } : {}),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: auditSelect,
    })

    const items = rows.slice(0, params.limit)
    const nextCursor = rows.length > params.limit ? encodeCursor(items[items.length - 1]!.id) : null
    return { items, nextCursor }
  },

  /** The trail for one record, oldest first - how a change came to be. */
  forEntity(organizationId: string, entityType: string, entityId: string): Promise<AuditRecord[]> {
    return prisma.auditLog.findMany({
      where: { organizationId, entityType, entityId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: auditSelect,
    })
  },
}

export type AuditRepository = typeof auditRepository
