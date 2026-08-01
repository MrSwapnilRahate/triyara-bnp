import {
  type Action,
  ACTIONS,
  assertAbility,
  type AuthContext,
  buildAbilityFor,
  isRole,
  type Role,
  ROLES,
  type Subject,
  SUBJECTS,
} from '@triyara/auth'
import type { ScopedRoleRepository } from '@triyara/db'

// Effective-permission projection (TRY-BNP-AUTH-02).
//
// Permissions are NOT stored. This service derives the matrix from CASL at read
// time, so @triyara/auth remains the single source of truth and there is no
// second authorization system that can disagree with it.

export type PermissionCtx = AuthContext & { requestId?: string }

// ACTIONS and SUBJECTS come from @triyara/auth, which now declares them as
// runtime arrays with the unions derived from them. They used to be mirrored
// here behind an exhaustiveness check, because the unions were types and had no
// runtime form; that copy is gone, so there is nothing left to drift.

export interface PermissionMatrix {
  userId: string
  roles: Role[]
  /** subject -> the actions this role set permits. */
  permissions: Record<string, Action[]>
}

/** One row of the vocabulary matrix: what a single role may do, everywhere. */
export interface RolePermissions {
  role: Role
  permissions: Record<string, Action[]>
}

/**
 * The whole authorization vocabulary, derived from CASL at read time.
 *
 * `actions` and `subjects` are shipped alongside the rows so a client can draw
 * the axes of the table without keeping its own list of either. That is the
 * point of the endpoint: the portal renders this, it does not restate it.
 */
export interface RoleMatrix {
  actions: readonly Action[]
  subjects: readonly Subject[]
  roles: RolePermissions[]
}

export interface PermissionDeps {
  scopedRoles: ScopedRoleRepository
}

/** Every subject a role set touches, and which actions it permits on each. */
function permissionsFor(roles: Role[]): Record<string, Action[]> {
  const ability = buildAbilityFor(roles)
  const permissions: Record<string, Action[]> = {}

  for (const subject of SUBJECTS) {
    const allowed = ACTIONS.filter((action) => ability.can(action, subject))
    if (allowed.length > 0) permissions[subject] = allowed
  }

  return permissions
}

function matrixFor(userId: string, roles: Role[]): PermissionMatrix {
  return { userId, roles, permissions: permissionsFor(roles) }
}

export function createPermissionService({ scopedRoles }: PermissionDeps) {
  return {
    /** The caller's own effective permissions, from their global roles. */
    mine(ctx: PermissionCtx): PermissionMatrix {
      return matrixFor(ctx.user.id, [...ctx.user.roles])
    },

    /**
     * What every role may do (TRY-BNP-AUTH-03).
     *
     * Derived from `buildAbilityFor` on each role in turn, so this is the same
     * function the guards call - it cannot describe a permission the platform
     * would refuse, or omit one it would allow.
     *
     * Deliberately not gated beyond authentication. It is the published rule
     * book, identical for every caller and carrying no tenant data; a signed-in
     * user learning that a VERIFIER may verify is not a disclosure, and hiding
     * it would only push the portal into keeping its own copy.
     */
    roleMatrix(): RoleMatrix {
      return {
        actions: ACTIONS,
        subjects: SUBJECTS,
        roles: ROLES.map((role) => ({ role, permissions: permissionsFor([role]) })),
      }
    },

    /**
     * Permissions including any live scoped grants. Scoped grants can only add
     * roles a user holds on a resource; they never change what a role means.
     */
    async forScope(
      ctx: PermissionCtx,
      params: {
        userId?: string
        scopeType: Parameters<ScopedRoleRepository['findActiveForScope']>[2]
        scopeId: string
      },
    ): Promise<PermissionMatrix & { scopedRoles: Role[] }> {
      const targetUserId = params.userId ?? ctx.user.id
      if (targetUserId !== ctx.user.id) assertAbility(ctx, 'read', 'User')

      const base: Role[] = targetUserId === ctx.user.id ? [...ctx.user.roles] : []
      const grants = await scopedRoles.findActiveForScope(
        ctx.organizationId,
        targetUserId,
        params.scopeType,
        params.scopeId,
      )
      const scoped = grants.map((g) => g.role.name).filter((n): n is Role => isRole(n))
      const combined = [...new Set([...base, ...scoped])]

      return { ...matrixFor(targetUserId, combined), scopedRoles: scoped }
    },
  }
}

export type PermissionService = ReturnType<typeof createPermissionService>
