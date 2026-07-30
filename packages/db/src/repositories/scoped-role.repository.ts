import { Prisma, type RoleName, type RoleScopeType } from '@prisma/client'

import { writeAudit } from '../audit'
import { prisma } from '../client'
import { decodeCursor, encodeCursor, type MutationCtx } from './account.repository'

// Scoped role assignments (TRY-BNP-AUTH-02). Stores WHO holds WHICH existing
// role on WHICH resource, and until when. It stores no permission logic: what a
// role may do is decided by CASL in @triyara/auth, which stays authoritative.

const assignmentSelect = {
  id: true,
  organizationId: true,
  userId: true,
  roleId: true,
  scopeType: true,
  scopeId: true,
  grantedById: true,
  grantedAt: true,
  expiresAt: true,
  revokedAt: true,
  revokedById: true,
  reason: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  role: { select: { id: true, name: true } },
} satisfies Prisma.ScopedRoleAssignmentSelect

export type ScopedRoleRecord = Prisma.ScopedRoleAssignmentGetPayload<{
  select: typeof assignmentSelect
}>

export interface GrantScopedRoleData {
  userId: string
  roleId: string
  scopeType: RoleScopeType
  scopeId: string
  expiresAt?: Date
  reason?: string
}

export interface ListScopedRolesParams {
  organizationId: string
  userId?: string
  roleName?: RoleName
  scopeType?: RoleScopeType
  scopeId?: string
  activeOnly?: boolean
  limit: number
  cursor?: string
}

export interface ScopedRoleListResult {
  items: ScopedRoleRecord[]
  nextCursor: string | null
}

/** A grant is live when it is not revoked and has not expired. */
function activeWhere(): Prisma.ScopedRoleAssignmentWhereInput {
  return {
    revokedAt: null,
    OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
  }
}

export const scopedRoleRepository = {
  async grant(ctx: MutationCtx, data: GrantScopedRoleData): Promise<ScopedRoleRecord> {
    try {
      return await prisma.$transaction(async (tx) => {
        const assignment = await tx.scopedRoleAssignment.create({
          data: {
            organizationId: ctx.organizationId,
            userId: data.userId,
            roleId: data.roleId,
            scopeType: data.scopeType,
            scopeId: data.scopeId,
            expiresAt: data.expiresAt,
            reason: data.reason,
            grantedById: ctx.actorId,
          },
          select: assignmentSelect,
        })

        await writeAudit(tx, {
          organizationId: ctx.organizationId,
          actorId: ctx.actorId,
          requestId: ctx.requestId,
          entityType: 'ScopedRoleAssignment',
          entityId: assignment.id,
          action: 'role.granted',
          after: {
            userId: data.userId,
            role: assignment.role.name,
            scopeType: data.scopeType,
            scopeId: data.scopeId,
            expiresAt: data.expiresAt ?? null,
          },
        })

        return assignment
      })
    } catch (error) {
      // Partial unique index ScopedRoleAssignment_unique_active_grant.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new Prisma.PrismaClientKnownRequestError(
          'This user already holds that role on that scope.',
          { code: 'P2002', clientVersion: error.clientVersion },
        )
      }
      throw error
    }
  },

  findById(organizationId: string, id: string): Promise<ScopedRoleRecord | null> {
    return prisma.scopedRoleAssignment.findFirst({
      where: { id, organizationId },
      select: assignmentSelect,
    })
  },

  async list(params: ListScopedRolesParams): Promise<ScopedRoleListResult> {
    const where: Prisma.ScopedRoleAssignmentWhereInput = {
      organizationId: params.organizationId,
      ...(params.userId ? { userId: params.userId } : {}),
      ...(params.roleName ? { role: { name: params.roleName } } : {}),
      ...(params.scopeType ? { scopeType: params.scopeType } : {}),
      ...(params.scopeId ? { scopeId: params.scopeId } : {}),
      ...(params.activeOnly ? activeWhere() : {}),
    }

    const rows = await prisma.scopedRoleAssignment.findMany({
      where,
      select: assignmentSelect,
      orderBy: [{ grantedAt: 'desc' }, { id: 'desc' }],
      take: params.limit + 1,
      ...(params.cursor ? { cursor: { id: decodeCursor(params.cursor) }, skip: 1 } : {}),
    })

    const items = rows.slice(0, params.limit)
    const nextCursor = rows.length > params.limit ? encodeCursor(items[items.length - 1]!.id) : null
    return { items, nextCursor }
  },

  /** Live grants for one user, used to resolve effective scoped access. */
  findActiveForUser(organizationId: string, userId: string): Promise<ScopedRoleRecord[]> {
    return prisma.scopedRoleAssignment.findMany({
      where: { organizationId, userId, ...activeWhere() },
      select: assignmentSelect,
      orderBy: { grantedAt: 'desc' },
    })
  },

  /** Live grants a user holds on one specific resource. */
  findActiveForScope(
    organizationId: string,
    userId: string,
    scopeType: RoleScopeType,
    scopeId: string,
  ): Promise<ScopedRoleRecord[]> {
    return prisma.scopedRoleAssignment.findMany({
      where: { organizationId, userId, scopeType, scopeId, ...activeWhere() },
      select: assignmentSelect,
    })
  },

  async revoke(ctx: MutationCtx, id: string, reason?: string): Promise<ScopedRoleRecord> {
    return prisma.$transaction(async (tx) => {
      const before = await tx.scopedRoleAssignment.findFirstOrThrow({
        where: { id, organizationId: ctx.organizationId },
        select: assignmentSelect,
      })

      const assignment = await tx.scopedRoleAssignment.update({
        where: { id },
        data: {
          revokedAt: new Date(),
          revokedById: ctx.actorId,
          reason: reason ?? before.reason,
          version: { increment: 1 },
        },
        select: assignmentSelect,
      })

      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.actorId,
        requestId: ctx.requestId,
        entityType: 'ScopedRoleAssignment',
        entityId: assignment.id,
        action: 'role.revoked',
        before: { revokedAt: before.revokedAt },
        after: {
          userId: assignment.userId,
          role: assignment.role.name,
          scopeType: assignment.scopeType,
          scopeId: assignment.scopeId,
          reason: reason ?? null,
        },
      })

      return assignment
    })
  },
}

export type ScopedRoleRepository = typeof scopedRoleRepository
