import { assertAbility, type AuthContext, buildAbilityFor, isRole, type Role } from '@triyara/auth'
import type {
  MutationCtx,
  RoleName,
  RoleScopeType,
  ScopedRoleListResult,
  ScopedRoleRecord,
  ScopedRoleRepository,
} from '@triyara/db'
import { type EventBus, makeEvent } from '@triyara/events'
import { ConflictError, NotFoundError, ValidationError } from '@triyara/lib'
import type { GrantScopedRoleDto, ListScopedRolesQuery } from '@triyara/validation'

// Scoped role assignments (TRY-BNP-AUTH-02).
//
// This service assigns EXISTING roles to users for specific resources. It never
// defines what a role may do - that stays in CASL (buildAbilityFor), which
// remains the single source of truth for authorization.

export type ScopedRoleCtx = AuthContext & { requestId?: string }

export interface RoleLookup {
  findByName(name: RoleName): Promise<{ id: string; name: RoleName } | null>
}

export interface UserExistsLookup {
  findById(id: string): Promise<{ id: string; organizationId: string } | null>
}

export interface ScopedRoleDeps {
  repo: ScopedRoleRepository
  roles: RoleLookup
  users: UserExistsLookup
  events: EventBus
}

function mutationCtx(ctx: ScopedRoleCtx): MutationCtx {
  return { actorId: ctx.user.id, organizationId: ctx.organizationId, requestId: ctx.requestId }
}

export function createScopedRoleService({ repo, roles, users, events }: ScopedRoleDeps) {
  return {
    /**
     * Grants a role on one resource. Administrative: `update User` resolves to
     * ADMIN only under the frozen ability model.
     */
    async grant(ctx: ScopedRoleCtx, dto: GrantScopedRoleDto): Promise<ScopedRoleRecord> {
      assertAbility(ctx, 'update', 'User')

      const target = await users.findById(dto.userId)
      if (!target || target.organizationId !== ctx.organizationId) {
        throw new NotFoundError('User not found.')
      }

      const role = await roles.findByName(dto.role)
      if (!role) throw new NotFoundError(`Role not found: ${dto.role}`)

      if (dto.expiresAt && dto.expiresAt.getTime() <= Date.now()) {
        throw new ValidationError('expiresAt must be in the future.')
      }

      try {
        const assignment = await repo.grant(mutationCtx(ctx), {
          userId: dto.userId,
          roleId: role.id,
          scopeType: dto.scopeType,
          scopeId: dto.scopeId,
          expiresAt: dto.expiresAt,
          reason: dto.reason,
        })

        await events.emit(
          makeEvent({
            type: 'role.granted',
            organizationId: ctx.organizationId,
            actorId: ctx.user.id,
            data: {
              userId: dto.userId,
              role: dto.role,
              scopeType: dto.scopeType,
              scopeId: dto.scopeId,
            },
          }),
        )

        return assignment
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'P2002') {
          throw new ConflictError('This user already holds that role on that scope.')
        }
        throw error
      }
    },

    async list(ctx: ScopedRoleCtx, query: ListScopedRolesQuery): Promise<ScopedRoleListResult> {
      assertAbility(ctx, 'read', 'User')
      return repo.list({
        organizationId: ctx.organizationId,
        userId: query.userId,
        roleName: query.role,
        scopeType: query.scopeType,
        scopeId: query.scopeId,
        activeOnly: query.activeOnly,
        limit: query.limit,
        cursor: query.cursor,
      })
    },

    async revoke(ctx: ScopedRoleCtx, id: string, reason?: string): Promise<ScopedRoleRecord> {
      assertAbility(ctx, 'update', 'User')

      const existing = await repo.findById(ctx.organizationId, id)
      if (!existing) throw new NotFoundError('Role assignment not found.')
      if (existing.revokedAt) throw new ConflictError('This assignment is already revoked.')

      const assignment = await repo.revoke(mutationCtx(ctx), id, reason)
      await events.emit(
        makeEvent({
          type: 'role.revoked',
          organizationId: ctx.organizationId,
          actorId: ctx.user.id,
          data: {
            userId: assignment.userId,
            role: assignment.role.name,
            scopeType: assignment.scopeType,
            scopeId: assignment.scopeId,
          },
        }),
      )
      return assignment
    },

    /**
     * Effective roles a user holds on one resource: their global roles plus any
     * live scoped grants. The returned ability is built by CASL from that role
     * set, so scoping widens WHO holds a role, never WHAT the role means.
     */
    async effectiveAccess(
      ctx: ScopedRoleCtx,
      params: { userId?: string; scopeType: RoleScopeType; scopeId: string },
    ) {
      const targetUserId = params.userId ?? ctx.user.id
      if (targetUserId !== ctx.user.id) assertAbility(ctx, 'read', 'User')

      const globalRoles: Role[] = targetUserId === ctx.user.id ? [...ctx.user.roles] : []

      const grants = await repo.findActiveForScope(
        ctx.organizationId,
        targetUserId,
        params.scopeType,
        params.scopeId,
      )
      const scopedRoles = grants.map((g) => g.role.name).filter((n): n is Role => isRole(n))

      const combined = [...new Set([...globalRoles, ...scopedRoles])]
      const ability = buildAbilityFor(combined)

      return {
        userId: targetUserId,
        scopeType: params.scopeType,
        scopeId: params.scopeId,
        globalRoles,
        scopedRoles,
        effectiveRoles: combined,
        rules: ability.rules,
      }
    },
  }
}

export type ScopedRoleService = ReturnType<typeof createScopedRoleService>
