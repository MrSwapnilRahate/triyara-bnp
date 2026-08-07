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
  sort?: string
  limit: number
  cursor?: string
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
