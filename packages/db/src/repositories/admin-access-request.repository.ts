import type { AdminAccessRequestStatus, Prisma } from '@prisma/client'
import { ConflictError, NotFoundError, PreconditionFailedError } from '@triyara/lib'

import { writeAudit } from '../audit'
import { prisma } from '../client'
import { decodeCursor, encodeCursor, type MutationCtx } from './account.repository'

// Admin access requests (TRY-BNP-SUPERADMIN-01).

const requestSelect = {
  id: true,
  organizationId: true,
  userId: true,
  requesterName: true,
  requesterEmail: true,
  currentRole: true,
  reason: true,
  status: true,
  decidedById: true,
  decidedAt: true,
  decisionReason: true,
  revokedById: true,
  revokedAt: true,
  revocationReason: true,
  version: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.AdminAccessRequestSelect

export type AdminAccessRequestRecord = Prisma.AdminAccessRequestGetPayload<{
  select: typeof requestSelect
}>

export interface CreateAdminAccessRequestData {
  userId: string
  requesterName: string
  requesterEmail: string
  currentRole: string
  reason: string
}

export interface ListAdminAccessRequestsParams {
  organizationId: string
  status?: AdminAccessRequestStatus
  q?: string
  /** Inclusive lower bound on when the request was made. */
  from?: Date
  /** Inclusive upper bound. */
  to?: Date
  sort?: string
  limit: number
  cursor?: string
}

/** How many requests sit in each state. Drives the dashboard tiles. */
export interface AdminAccessRequestCounts {
  pending: number
  approved: number
  rejected: number
  revoked: number
  total: number
}

export interface AdminAccessRequestListResult {
  items: AdminAccessRequestRecord[]
  nextCursor: string | null
}

/**
 * Whether this is the partial unique index refusing a second pending request.
 *
 * Prisma reports P2002 with `meta.target` naming the *columns*, not the index —
 * `["userId"]` here, verified against the running database rather than assumed.
 * `userId` carries no other unique constraint on this table, so that is
 * unambiguous.
 */
function isDuplicatePending(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  if ((error as { code?: string }).code !== 'P2002') return false
  const target = (error as { meta?: { target?: unknown } }).meta?.target
  return Array.isArray(target) ? target.includes('userId') : String(target ?? '').includes('userId')
}

export const adminAccessRequestRepository = {
  /**
   * Records a request.
   *
   * "One pending request per person" is enforced by a partial unique index, not
   * by reading first: two submissions racing would both pass a read and both
   * insert. The database is the arbiter, and the duplicate surfaces as a 409.
   */
  async create(
    ctx: MutationCtx,
    data: CreateAdminAccessRequestData,
  ): Promise<AdminAccessRequestRecord> {
    try {
      return await prisma.$transaction(async (tx) => {
        const request = await tx.adminAccessRequest.create({
          data: { organizationId: ctx.organizationId, ...data },
          select: requestSelect,
        })

        await writeAudit(tx, {
          organizationId: ctx.organizationId,
          actorId: ctx.actorId,
          requestId: ctx.requestId,
          entityType: 'AdminAccessRequest',
          entityId: request.id,
          action: 'admin_access_request.submitted',
          after: {
            requesterEmail: request.requesterEmail,
            currentRole: request.currentRole,
            status: request.status,
          },
        })

        return request
      })
    } catch (error) {
      if (isDuplicatePending(error)) {
        throw new ConflictError('You already have a pending admin access request.')
      }
      throw error
    }
  },

  findById(organizationId: string, id: string): Promise<AdminAccessRequestRecord | null> {
    return prisma.adminAccessRequest.findFirst({
      where: { id, organizationId },
      select: requestSelect,
    })
  },

  findPendingForUser(userId: string): Promise<AdminAccessRequestRecord | null> {
    return prisma.adminAccessRequest.findFirst({
      where: { userId, status: 'PENDING' },
      select: requestSelect,
    })
  },

  async list(params: ListAdminAccessRequestsParams): Promise<AdminAccessRequestListResult> {
    const where: Prisma.AdminAccessRequestWhereInput = {
      organizationId: params.organizationId,
      ...(params.status ? { status: params.status } : {}),
      ...(params.q
        ? {
            OR: [
              { requesterName: { contains: params.q, mode: 'insensitive' } },
              { requesterEmail: { contains: params.q, mode: 'insensitive' } },
              { reason: { contains: params.q, mode: 'insensitive' } },
            ],
          }
        : {}),
      // Both bounds are inclusive; `to` is pushed to the end of that day so a
      // single-day range returns that day rather than nothing.
      ...(params.from || params.to
        ? {
            createdAt: {
              ...(params.from ? { gte: params.from } : {}),
              ...(params.to ? { lte: params.to } : {}),
            },
          }
        : {}),
    }

    const raw = params.sort ?? '-createdAt'
    const dir: Prisma.SortOrder = raw.startsWith('-') ? 'desc' : 'asc'
    const field = raw.replace(/^-/, '') as 'createdAt' | 'requesterName' | 'status'

    const rows = await prisma.adminAccessRequest.findMany({
      where,
      select: requestSelect,
      // `id` tiebreaks in the same direction, so rows sharing a timestamp
      // cannot repeat or vanish across a page boundary.
      orderBy: [{ [field]: dir }, { id: dir }],
      take: params.limit + 1,
      ...(params.cursor ? { cursor: { id: decodeCursor(params.cursor) }, skip: 1 } : {}),
    })

    const items = rows.slice(0, params.limit)
    const nextCursor = rows.length > params.limit ? encodeCursor(items[items.length - 1]!.id) : null
    return { items, nextCursor }
  },

  /**
   * Approves a request and grants ADMIN, in one transaction.
   *
   * Both or neither. A request marked APPROVED whose role grant failed leaves
   * someone believing they are an administrator and unable to act; a role
   * granted against a request that stayed PENDING leaves an administrator with
   * no record of who authorised them. The version is checked in the WHERE
   * clause, so two decisions racing cannot both win — the second gets a 412.
   */
  async approve(
    ctx: MutationCtx,
    id: string,
    expectedVersion: number,
  ): Promise<AdminAccessRequestRecord> {
    return prisma.$transaction(async (tx) => {
      const before = await tx.adminAccessRequest.findFirst({
        where: { id, organizationId: ctx.organizationId },
        select: { status: true, userId: true, requesterEmail: true },
      })
      if (!before) throw new NotFoundError('Request not found.')
      if (before.status !== 'PENDING') {
        throw new ConflictError(`This request has already been ${before.status.toLowerCase()}.`)
      }

      const updated = await tx.adminAccessRequest.updateMany({
        where: {
          id,
          organizationId: ctx.organizationId,
          status: 'PENDING',
          version: expectedVersion,
        },
        data: {
          status: 'APPROVED',
          decidedById: ctx.actorId,
          decidedAt: new Date(),
          version: { increment: 1 },
        },
      })
      if (updated.count === 0) throw new PreconditionFailedError()

      const adminRole = await tx.role.findFirstOrThrow({
        where: { name: 'ADMIN' },
        select: { id: true },
      })
      // The grant may already exist if the role was assigned by some other
      // route; the request is still the authorising record, so this is not an
      // error. `createMany` with skipDuplicates says that without a read.
      await tx.userRole.createMany({
        data: [{ userId: before.userId, roleId: adminRole.id }],
        skipDuplicates: true,
      })

      const after = await tx.adminAccessRequest.findUniqueOrThrow({
        where: { id },
        select: requestSelect,
      })
      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.actorId,
        requestId: ctx.requestId,
        entityType: 'AdminAccessRequest',
        entityId: id,
        action: 'admin_access_request.approved',
        before: { status: before.status },
        after: {
          status: after.status,
          grantedTo: before.requesterEmail,
          grantedRole: 'ADMIN',
        },
      })
      return after
    })
  },

  /**
   * Revokes access granted by an approved request.
   *
   * Removes the ADMIN role and marks the request REVOKED in one transaction:
   * a role removed without the record leaves an audit that still says the
   * person is an administrator, and a record without the removal leaves them
   * one. The approval fields are left intact - who granted the access and who
   * withdrew it are different facts.
   */
  async revoke(
    ctx: MutationCtx,
    id: string,
    expectedVersion: number,
    reason: string,
  ): Promise<AdminAccessRequestRecord> {
    return prisma.$transaction(async (tx) => {
      const before = await tx.adminAccessRequest.findFirst({
        where: { id, organizationId: ctx.organizationId },
        select: { status: true, userId: true, requesterEmail: true },
      })
      if (!before) throw new NotFoundError('Request not found.')
      if (before.status !== 'APPROVED') {
        throw new ConflictError(
          `Only approved access can be revoked. This request is ${before.status.toLowerCase()}.`,
        )
      }

      const updated = await tx.adminAccessRequest.updateMany({
        where: {
          id,
          organizationId: ctx.organizationId,
          status: 'APPROVED',
          version: expectedVersion,
        },
        data: {
          status: 'REVOKED',
          revokedById: ctx.actorId,
          revokedAt: new Date(),
          revocationReason: reason,
          version: { increment: 1 },
        },
      })
      if (updated.count === 0) throw new PreconditionFailedError()

      const adminRole = await tx.role.findFirstOrThrow({
        where: { name: 'ADMIN' },
        select: { id: true },
      })
      // deleteMany rather than delete: the grant may already be gone, and the
      // request still needs marking so the history is complete.
      await tx.userRole.deleteMany({ where: { userId: before.userId, roleId: adminRole.id } })

      const after = await tx.adminAccessRequest.findUniqueOrThrow({
        where: { id },
        select: requestSelect,
      })
      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.actorId,
        requestId: ctx.requestId,
        entityType: 'AdminAccessRequest',
        entityId: id,
        action: 'admin_access_request.revoked',
        before: { status: before.status },
        after: { status: after.status, revokedFrom: before.requesterEmail, reason },
      })
      return after
    })
  },

  /**
   * How many requests sit in each state.
   *
   * One grouped query rather than five counts: the tiles are read together and
   * five round trips would let them disagree with each other.
   */
  async counts(organizationId: string): Promise<AdminAccessRequestCounts> {
    const rows = await prisma.adminAccessRequest.groupBy({
      by: ['status'],
      where: { organizationId },
      _count: { _all: true },
    })
    const by = new Map(rows.map((row) => [row.status, row._count._all]))
    const pending = by.get('PENDING') ?? 0
    const approved = by.get('APPROVED') ?? 0
    const rejected = by.get('REJECTED') ?? 0
    const revoked = by.get('REVOKED') ?? 0
    return { pending, approved, rejected, revoked, total: pending + approved + rejected + revoked }
  },

  /**
   * Every request, oldest first, for export.
   *
   * Deliberately uncapped and unpaged - an export that silently stopped at a
   * page boundary would be worse than none, because nothing on the file says
   * it is partial.
   */
  listAllForExport(organizationId: string): Promise<AdminAccessRequestRecord[]> {
    return prisma.adminAccessRequest.findMany({
      where: { organizationId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: requestSelect,
    })
  },

  /** The person's most recent request, whatever its state. Drives the UI. */
  findLatestForUser(userId: string): Promise<AdminAccessRequestRecord | null> {
    return prisma.adminAccessRequest.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: requestSelect,
    })
  },

  /** Rejects a request. The reason is required by the service, stored here. */
  async reject(
    ctx: MutationCtx,
    id: string,
    expectedVersion: number,
    reason: string,
  ): Promise<AdminAccessRequestRecord> {
    return prisma.$transaction(async (tx) => {
      const before = await tx.adminAccessRequest.findFirst({
        where: { id, organizationId: ctx.organizationId },
        select: { status: true, requesterEmail: true },
      })
      if (!before) throw new NotFoundError('Request not found.')
      if (before.status !== 'PENDING') {
        throw new ConflictError(`This request has already been ${before.status.toLowerCase()}.`)
      }

      const updated = await tx.adminAccessRequest.updateMany({
        where: {
          id,
          organizationId: ctx.organizationId,
          status: 'PENDING',
          version: expectedVersion,
        },
        data: {
          status: 'REJECTED',
          decidedById: ctx.actorId,
          decidedAt: new Date(),
          decisionReason: reason,
          version: { increment: 1 },
        },
      })
      if (updated.count === 0) throw new PreconditionFailedError()

      const after = await tx.adminAccessRequest.findUniqueOrThrow({
        where: { id },
        select: requestSelect,
      })
      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.actorId,
        requestId: ctx.requestId,
        entityType: 'AdminAccessRequest',
        entityId: id,
        action: 'admin_access_request.rejected',
        before: { status: before.status },
        after: { status: after.status, reason },
      })
      return after
    })
  },
}

export type AdminAccessRequestRepository = typeof adminAccessRequestRepository
