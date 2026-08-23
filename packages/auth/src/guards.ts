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

/**
 * An external party's own account, proven present.
 *
 * `accountId` is `string` here, never `string | null | undefined`. That is the
 * entire point of the type: it is what a query may be narrowed by.
 */
export interface ExternalAccountContext {
  readonly accountId: string
}

/**
 * Narrows a request to the account an external party may act within, or refuses.
 *
 * `AuthUser.accountId` is optional, and every production path fills it in - but
 * the type still admits `undefined`, and `undefined` is the dangerous one.
 * Prisma OMITS a `where` key whose value is `undefined`, so
 * `where: { accountId: ctx.accountId }` silently becomes an unscoped query that
 * returns every account's rows. `null` is safe by comparison: it compiles to
 * `IS NULL` and matches nothing. Undefined fails open; null fails closed.
 *
 * So this is the sanctioned way to reach an account scope, and it returns a
 * `string` or throws. Nothing external should read `ctx.accountId` directly.
 *
 * The role is checked as well as the value. An internal user may hold no
 * account, but they also must not be handed one: staff act across the tenant
 * through CASL, and a member of staff arriving here means a route or service
 * meant for external parties has been reached by someone it was not written
 * for. That is worth refusing rather than interpreting.
 */
export function requireExternalAccountContext(ctx: AuthContext): ExternalAccountContext {
  if (!ctx.user.roles.includes('EXTERNAL_PARTY')) {
    throw new ForbiddenError('Not an external party.')
  }

  const accountId = ctx.accountId
  // Covers null, undefined and '' in one condition, deliberately: an empty
  // string is not a real identifier either, and `where: { accountId: '' }`
  // would be a query that quietly matches nothing while looking scoped.
  if (typeof accountId !== 'string' || accountId.length === 0) {
    throw new ForbiddenError('No account is linked to this login.')
  }

  return { accountId }
}
