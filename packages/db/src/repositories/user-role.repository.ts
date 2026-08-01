import { Prisma, type RoleName } from '@prisma/client'

import { writeAudit } from '../audit'
import { prisma } from '../client'
import type { MutationCtx } from './account.repository'

/**
 * Base role membership (TRY-BNP-AUTH-03).
 *
 * `UserRole` is the join the session is built from: `auth/index.ts` reads it
 * into the JWT and CASL builds the ability from those names. So this is the
 * table that decides what a person may do, which is why every write here is
 * audited and why the last-administrator guard below is a database-level lock
 * rather than a check in a service.
 *
 * The table carries no `organizationId` of its own - isolation comes from the
 * `User` row it points at, and every query below joins through it rather than
 * trusting a caller-supplied id.
 *
 * It also carries no `version`, and none is added here. A membership is a set
 * element, not a mutable document: there is no intermediate state for two
 * writers to overwrite, and the composite primary key already makes a duplicate
 * grant impossible. The hazard worth guarding is not a lost update but a lost
 * administrator, and that is handled by locking, below.
 */

export interface UserRoleRecord {
  roleId: string
  name: RoleName
  description: string | null
}

/** Raw row shape for the locking read. */
interface AdminIdRow {
  userId: string
}

export const userRoleRepository = {
  /**
   * The roles a user holds, scoped by organization.
   *
   * `RoleName` is a PostgreSQL enum, so ordering by it is declaration order -
   * ADMIN, EXPORT_MANAGER, VERIFIER, READ_ONLY - not alphabetical. That reads
   * as roughly descending privilege, which is the useful order here, and every
   * caller gets the same one.
   */
  async listForUser(organizationId: string, userId: string): Promise<UserRoleRecord[]> {
    const rows = await prisma.userRole.findMany({
      where: { userId, user: { organizationId } },
      select: { roleId: true, role: { select: { name: true, description: true } } },
      orderBy: { role: { name: 'asc' } },
    })
    return rows.map((r) => ({
      roleId: r.roleId,
      name: r.role.name,
      description: r.role.description,
    }))
  },

  /** Does this user hold this role? Used to keep assign idempotent-by-conflict. */
  async has(organizationId: string, userId: string, roleId: string): Promise<boolean> {
    const row = await prisma.userRole.findFirst({
      where: { userId, roleId, user: { organizationId } },
      select: { roleId: true },
    })
    return row !== null
  },

  /**
   * Grants a base role and records it. Returns the user's roles afterwards, so
   * a caller never has to re-read to know the resulting state.
   *
   * A duplicate grant surfaces as P2002 from the composite primary key; the
   * service translates it. Checking first and inserting second would be a race.
   */
  async assign(
    ctx: MutationCtx,
    userId: string,
    role: { id: string; name: RoleName },
    before: RoleName[],
  ): Promise<UserRoleRecord[]> {
    return prisma.$transaction(async (tx) => {
      await tx.userRole.create({ data: { userId, roleId: role.id } })

      // Read the result back before auditing, so `after` records the set that
      // actually exists rather than one predicted by appending to `before`.
      // The two would disagree on ordering, and an audit trail that reorders
      // the same set between rows is one nobody can diff.
      const rows = await tx.userRole.findMany({
        where: { userId },
        select: { roleId: true, role: { select: { name: true, description: true } } },
        orderBy: { role: { name: 'asc' } },
      })

      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.actorId,
        requestId: ctx.requestId,
        entityType: 'UserRole',
        // The user is the subject of the change: this is what an investigator
        // searches for, and the join row has no id of its own to search by.
        entityId: userId,
        action: 'user.role_assigned',
        before: { roles: before },
        after: { roles: rows.map((r) => r.role.name) },
      })

      return rows.map((r) => ({
        roleId: r.roleId,
        name: r.role.name,
        description: r.role.description,
      }))
    })
  },

  /**
   * Revokes a base role, refusing to remove the organization's last ADMIN.
   *
   * The guard is a `SELECT ... FOR UPDATE` over the tenant's ADMIN memberships
   * taken before the delete, so two administrators revoking each other at the
   * same moment serialize instead of both observing "one other admin remains"
   * and leaving the tenant with none. A count outside a lock cannot promise
   * that under READ COMMITTED, which is what PostgreSQL gives us by default.
   *
   * Returns null when the membership does not exist, so the service can answer
   * 404 without a second query.
   */
  async revoke(
    ctx: MutationCtx,
    userId: string,
    role: { id: string; name: RoleName },
    before: RoleName[],
  ): Promise<{ roles: UserRoleRecord[]; lastAdmin: boolean } | null> {
    return prisma.$transaction(async (tx) => {
      if (role.name === 'ADMIN') {
        // Lock every ADMIN membership in this tenant for the rest of the
        // transaction. Joining through User is what scopes it; UserRole has no
        // organization of its own.
        const holders = await tx.$queryRaw<AdminIdRow[]>`
          SELECT ur."userId"
          FROM "UserRole" ur
          JOIN "User" u ON u.id = ur."userId"
          WHERE ur."roleId" = ${role.id} AND u."organizationId" = ${ctx.organizationId}
          FOR UPDATE
        `
        if (!holders.some((h) => h.userId === userId)) return null
        if (holders.length <= 1) return { roles: [], lastAdmin: true }
      }

      const deleted = await tx.userRole.deleteMany({ where: { userId, roleId: role.id } })
      if (deleted.count === 0) return null

      const rows = await tx.userRole.findMany({
        where: { userId },
        select: { roleId: true, role: { select: { name: true, description: true } } },
        orderBy: { role: { name: 'asc' } },
      })

      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.actorId,
        requestId: ctx.requestId,
        entityType: 'UserRole',
        entityId: userId,
        action: 'user.role_revoked',
        before: { roles: before },
        after: { roles: rows.map((r) => r.role.name) },
      })

      return {
        roles: rows.map((r) => ({
          roleId: r.roleId,
          name: r.role.name,
          description: r.role.description,
        })),
        lastAdmin: false,
      }
    })
  },
}

export type UserRoleRepository = typeof userRoleRepository

/** Re-exported so services can narrow a caught Prisma error without importing Prisma. */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}
