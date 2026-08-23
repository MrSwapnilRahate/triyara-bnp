import { ForbiddenError, UnauthenticatedError } from '@triyara/lib'

import { type Action, type AppAbility, buildAbilityFor, type Subject } from './abilities'
import type { Role } from './roles'
import type { AuthUser, SessionLike } from './session'

export interface AuthContext {
  readonly user: AuthUser
  readonly organizationId: string
  readonly ability: AppAbility
  /**
   * Lifted from `user` for the same reason `organizationId` is: the scope a
   * query is narrowed by should be reachable without unwrapping the identity.
   * Null for internal staff, and not consulted by `assertAbility` - external
   * record scoping arrives in a later batch.
   *
   * Optional for the same reason as `AuthUser.accountId`. `resolveContext`
   * always sets it, so anything built the normal way has it.
   */
  readonly accountId?: string | null
}

// Resolve a full auth context from a session, or throw UnauthenticatedError.
export function resolveContext(session: SessionLike | null | undefined): AuthContext {
  const user = session?.user
  if (!user) throw new UnauthenticatedError()
  return {
    user,
    organizationId: user.organizationId,
    accountId: user.accountId ?? null,
    ability: buildAbilityFor(user.roles),
  }
}

export function assertRole(ctx: AuthContext, ...roles: Role[]): AuthContext {
  const ok = roles.some((r) => ctx.user.roles.includes(r))
  if (!ok) throw new ForbiddenError(`Requires one of: ${roles.join(', ')}`)
  return ctx
}

export function assertAbility(ctx: AuthContext, action: Action, subject: Subject): AuthContext {
  if (!ctx.ability.can(action, subject)) {
    throw new ForbiddenError(`Not permitted: ${action} ${subject}`)
  }
  return ctx
}
