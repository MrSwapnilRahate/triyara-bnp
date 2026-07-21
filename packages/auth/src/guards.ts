import { ForbiddenError, UnauthenticatedError } from '@triyara/lib'

import { type Action, type AppAbility, buildAbilityFor, type Subject } from './abilities'
import type { Role } from './roles'
import type { AuthUser, SessionLike } from './session'

export interface AuthContext {
  readonly user: AuthUser
  readonly organizationId: string
  readonly ability: AppAbility
}

// Resolve a full auth context from a session, or throw UnauthenticatedError.
export function resolveContext(session: SessionLike | null | undefined): AuthContext {
  const user = session?.user
  if (!user) throw new UnauthenticatedError()
  return { user, organizationId: user.organizationId, ability: buildAbilityFor(user.roles) }
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
