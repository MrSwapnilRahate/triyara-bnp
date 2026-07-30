import {
  type Action,
  assertAbility,
  type AuthContext,
  buildAbilityFor,
  isRole,
  type Role,
  type Subject,
} from '@triyara/auth'
import type { ScopedRoleRepository } from '@triyara/db'

// Effective-permission projection (TRY-BNP-AUTH-02).
//
// Permissions are NOT stored. This service derives the matrix from CASL at read
// time, so @triyara/auth remains the single source of truth and there is no
// second authorization system that can disagree with it.

export type PermissionCtx = AuthContext & { requestId?: string }

// Mirrors the frozen Action/Subject unions in @triyara/auth, which are types
// and so have no runtime representation. The exhaustiveness checks below fail
// compilation if the frozen unions gain a member that is not mirrored here.
const ACTIONS = ['manage', 'create', 'read', 'update', 'delete', 'verify'] as const
const SUBJECTS = [
  'all',
  'Account',
  'SupplierProfile',
  'BuyerProfile',
  'Contact',
  'Address',
  'Verification',
  'Document',
  'Note',
  'Activity',
  'User',
  'Organization',
  'ReferenceData',
] as const

type MissingAction = Exclude<Action, (typeof ACTIONS)[number]>
type MissingSubject = Exclude<Subject, (typeof SUBJECTS)[number]>
// If either of these errors, a frozen union gained a member - mirror it above.
const _actionsExhaustive: MissingAction extends never ? true : never = true
const _subjectsExhaustive: MissingSubject extends never ? true : never = true
void _actionsExhaustive
void _subjectsExhaustive

export interface PermissionMatrix {
  userId: string
  roles: Role[]
  /** subject -> the actions this role set permits. */
  permissions: Record<string, Action[]>
}

export interface PermissionDeps {
  scopedRoles: ScopedRoleRepository
}

function matrixFor(userId: string, roles: Role[]): PermissionMatrix {
  const ability = buildAbilityFor(roles)
  const permissions: Record<string, Action[]> = {}

  for (const subject of SUBJECTS) {
    const allowed = ACTIONS.filter((action) => ability.can(action, subject))
    if (allowed.length > 0) permissions[subject] = allowed
  }

  return { userId, roles, permissions }
}

export function createPermissionService({ scopedRoles }: PermissionDeps) {
  return {
    /** The caller's own effective permissions, from their global roles. */
    mine(ctx: PermissionCtx): PermissionMatrix {
      return matrixFor(ctx.user.id, [...ctx.user.roles])
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
