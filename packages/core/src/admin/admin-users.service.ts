import { assertAbility, type AuthContext } from '@triyara/auth'
import type { AdminUserRecord, UserRepository } from '@triyara/db'
import type { ListAdminUsersQuery } from '@triyara/validation'

/**
 * User administration (TRY-BNP-ADMIN-02).
 *
 * A service of its own rather than another method on AdminService. That one
 * answers "what happened and how is this tenant configured" - audit, settings,
 * dashboard, the caller's own profile. This one answers "who are the people in
 * this tenant", which is a different subject with a stricter gate, and mixing
 * them would put the tenant's roster behind the same door as its date format.
 *
 * Authorization is `manage User`. That reuses the frozen CASL subject and
 * introduces nothing new: ADMIN holds `manage all`, and every other role holds
 * only `read all`, so `manage User` is ADMIN and no one else. Gating on
 * `read User` would have opened the roster - with status and last sign-in - to
 * every signed-in role, which is precisely what the narrow directory endpoint
 * exists to avoid.
 */

export type AdminUsersServiceCtx = AuthContext & { requestId?: string }

export interface AdminUsersServiceDeps {
  users: UserRepository
}

export interface AdminUserListItem {
  id: string
  name: string
  email: string
  avatarUrl: string | null
  status: string
  roles: string[]
  lastLoginAt: Date | null
  createdAt: Date
}

export interface AdminUserListResponse {
  items: AdminUserListItem[]
  nextCursor: string | null
}

/**
 * Flattens the role join into the array the API promises. Done here rather than
 * in the repository so the repository keeps returning what Prisma gave it, and
 * done here rather than in the route so the route keeps returning what the
 * service gave it.
 */
function toListItem(row: AdminUserRecord): AdminUserListItem {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    avatarUrl: row.avatarUrl,
    status: row.status,
    roles: row.roles.map((r) => r.role.name),
    lastLoginAt: row.lastLoginAt,
    createdAt: row.createdAt,
  }
}

export function createAdminUsersService({ users }: AdminUsersServiceDeps) {
  return {
    /**
     * The tenant's people, newest first by default.
     *
     * Scoped to `ctx.organizationId` in the repository query itself, not
     * filtered afterwards: a caller cannot widen it by any combination of
     * parameters, because the organization is never one of them.
     */
    async list(
      ctx: AdminUsersServiceCtx,
      query: ListAdminUsersQuery,
    ): Promise<AdminUserListResponse> {
      assertAbility(ctx, 'manage', 'User')

      const result = await users.listForAdmin(ctx.organizationId, {
        limit: query.limit,
        ...(query.cursor ? { cursor: query.cursor } : {}),
        ...(query.q ? { q: query.q } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.role ? { role: query.role } : {}),
        ...(query.sort ? { sort: query.sort } : {}),
      })

      return { items: result.items.map(toListItem), nextCursor: result.nextCursor }
    },
  }
}

export type AdminUsersService = ReturnType<typeof createAdminUsersService>
