import {
  type Action,
  assertAbility,
  assertRole,
  type AuthContext,
  type AuthUser,
  resolveContext,
  type Role,
  type Subject,
} from '@triyara/auth'
import { SESSION_NO_LONGER_VALID } from '@triyara/core'
import { type Organization, organizationRepository } from '@triyara/db'
import { UnauthenticatedError } from '@triyara/lib'

import { sessionService } from '@/lib/auth-extension-service'

import { auth } from './index'

/**
 * The identity behind this request, refused if its session has been withdrawn.
 *
 * Every authenticated path in the application arrives here - 135 of the 143 API
 * routes, every page that reads data, `requireRole` and `requireAbility` - which
 * is why the revocation check lives here and not in the routes. Middleware could
 * not do it: it is excluded from `/api` entirely and runs on the edge, where
 * there is no database.
 *
 * The order matters. The session is checked before the context is built, so a
 * revoked token never reaches CASL and never produces an ability set. And `sid`
 * is read from the session rather than folded into `AuthUser`, because that type
 * is shared by twenty-odd service fixtures that have nothing to say about
 * sessions.
 */
async function loadContext(): Promise<AuthContext> {
  const authStartedAt = Date.now()

  const sessionStartedAt = Date.now()
  const session = await auth()
  const authJsMs = Date.now() - sessionStartedAt

  if (!session?.user) throw new UnauthenticatedError()

  const u = session.user

  if (!u.sid) throw new UnauthenticatedError(SESSION_NO_LONGER_VALID)

  const liveStartedAt = Date.now()
  await sessionService.assertLive(u.organizationId, u.sid)
  const sessionLiveMs = Date.now() - liveStartedAt

  const authUser: AuthUser = {
    id: u.id,
    organizationId: u.organizationId,
    email: u.email ?? '',
    name: u.name ?? '',
    roles: u.roles,
    accountId: u.accountId ?? null,
  }

  const contextStartedAt = Date.now()
  const context = resolveContext({ user: authUser })
  const contextMs = Date.now() - contextStartedAt

  const totalAuthMs = Date.now() - authStartedAt

  if (Math.random() < 0.01) {
    console.log('[AUTH-PROFILE]', {
      authJsMs,
      sessionLiveMs,
      contextMs,
      totalAuthMs,
    })
  }

  return context
}
export function requireAuth(): Promise<AuthContext> {
  return loadContext()
}

export async function requireRole(...roles: Role[]): Promise<AuthContext> {
  return assertRole(await loadContext(), ...roles)
}

export async function requireAbility(action: Action, subject: Subject): Promise<AuthContext> {
  return assertAbility(await loadContext(), action, subject)
}

export async function currentUser(): Promise<AuthUser | null> {
  const session = await auth()
  if (!session?.user) return null
  const u = session.user
  return {
    id: u.id,
    organizationId: u.organizationId,
    email: u.email ?? '',
    name: u.name ?? '',
    roles: u.roles,
    accountId: u.accountId ?? null,
  }
}

export async function currentOrganization(): Promise<Organization | null> {
  const user = await currentUser()
  if (!user) return null
  return organizationRepository.findById(user.organizationId)
}
