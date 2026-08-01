import { assertAbility, type AuthContext, type Role } from '@triyara/auth'
import type { MutationCtx, RoleName, UserRoleRecord, UserRoleRepository } from '@triyara/db'
import { isUniqueViolation } from '@triyara/db'
import { type EventBus, makeEvent } from '@triyara/events'
import { ConflictError, NotFoundError } from '@triyara/lib'

/**
 * Base role membership (TRY-BNP-AUTH-03).
 *
 * The roles this manages are the ones the session carries and CASL builds from,
 * so this is the endpoint that decides what a person may do. Its sibling,
 * ScopedRoleService, grants a role on a single resource; that one widens WHO
 * holds a role, this one changes it outright.
 *
 * Like that sibling, this service assigns EXISTING roles. It never defines what
 * a role means - that stays in `buildAbilityFor`, which remains the only place
 * a permission is written down.
 *
 * Authorization is `manage User`: ADMIN holds `manage all`, every other role
 * holds only `read all`, so all three operations here are ADMIN-only. The read
 * is gated the same as the writes on purpose - a roster of who holds ADMIN is
 * not something every signed-in role should be able to enumerate.
 */

export type UserRoleCtx = AuthContext & { requestId?: string }

export interface UserLookup {
  findById(id: string): Promise<{ id: string; organizationId: string } | null>
}

export interface RoleCatalogue {
  findByName(name: RoleName): Promise<{ id: string; name: RoleName } | null>
}

export interface UserRoleDeps {
  repo: UserRoleRepository
  roles: RoleCatalogue
  users: UserLookup
  events: EventBus
}

function mutationCtx(ctx: UserRoleCtx): MutationCtx {
  return { actorId: ctx.user.id, organizationId: ctx.organizationId, requestId: ctx.requestId }
}

export function createUserRoleService({ repo, roles, users, events }: UserRoleDeps) {
  /**
   * A user in another tenant is reported as not found, never as forbidden - the
   * API must not confirm that an id exists somewhere the caller cannot see.
   */
  async function requireUserInOrg(ctx: UserRoleCtx, userId: string) {
    const target = await users.findById(userId)
    if (!target || target.organizationId !== ctx.organizationId) {
      throw new NotFoundError('User not found.')
    }
    return target
  }

  async function requireRole(roleName: RoleName) {
    const role = await roles.findByName(roleName)
    if (!role) throw new NotFoundError(`Role not found: ${roleName}`)
    return role
  }

  return {
    /** The roles a user currently holds. */
    async list(ctx: UserRoleCtx, userId: string): Promise<UserRoleRecord[]> {
      assertAbility(ctx, 'manage', 'User')
      await requireUserInOrg(ctx, userId)
      return repo.listForUser(ctx.organizationId, userId)
    },

    /** Grants a base role. Re-granting one the user already holds is a 409. */
    async assign(ctx: UserRoleCtx, userId: string, roleName: RoleName): Promise<UserRoleRecord[]> {
      assertAbility(ctx, 'manage', 'User')
      await requireUserInOrg(ctx, userId)
      const role = await requireRole(roleName)

      const before = (await repo.listForUser(ctx.organizationId, userId)).map((r) => r.name)

      try {
        const after = await repo.assign(mutationCtx(ctx), userId, role, before)

        await events.emit(
          makeEvent({
            type: 'user.role_assigned',
            organizationId: ctx.organizationId,
            actorId: ctx.user.id,
            data: { userId, role: roleName },
          }),
        )

        return after
      } catch (error) {
        // The composite primary key is the arbiter, not a prior read: checking
        // first would leave a window for two concurrent grants.
        if (isUniqueViolation(error)) {
          throw new ConflictError('This user already holds that role.')
        }
        throw error
      }
    },

    /**
     * Revokes a base role.
     *
     * Two refusals, both deliberate. An administrator may not remove their own
     * last ADMIN role - locking yourself out of the tenant should take a second
     * person, not a misclick. And the organization may not lose its final
     * administrator, which the repository enforces under a row lock so that two
     * simultaneous revocations cannot each believe the other admin remains.
     */
    async revoke(ctx: UserRoleCtx, userId: string, roleName: RoleName): Promise<UserRoleRecord[]> {
      assertAbility(ctx, 'manage', 'User')
      await requireUserInOrg(ctx, userId)
      const role = await requireRole(roleName)

      // A user holds a role at most once, so revoking your own ADMIN is always
      // removing your last one. Refused outright: locking yourself out of the
      // tenant should take a second person, not a misclick.
      if (roleName === 'ADMIN' && userId === ctx.user.id) {
        throw new ConflictError(
          'You cannot remove your own administrator role. Ask another administrator to do it.',
        )
      }

      const before = (await repo.listForUser(ctx.organizationId, userId)).map((r) => r.name)
      const result = await repo.revoke(mutationCtx(ctx), userId, role, before)
      if (result === null) throw new NotFoundError('This user does not hold that role.')
      if (result.lastAdmin) {
        throw new ConflictError(
          'This is the only administrator in the organization. Grant the role to someone else first.',
        )
      }

      await events.emit(
        makeEvent({
          type: 'user.role_revoked',
          organizationId: ctx.organizationId,
          actorId: ctx.user.id,
          data: { userId, role: roleName },
        }),
      )

      return result.roles
    },
  }
}

export type UserRoleService = ReturnType<typeof createUserRoleService>

/** Narrowing helper for callers that hold role names as the auth package's union. */
export type AssignableRole = Extract<Role, RoleName>
