import { randomUUID } from 'node:crypto'

import { isRole } from '@triyara/auth'
import { userRepository } from '@triyara/db'
import { logger } from '@triyara/lib'
import type { JWT } from 'next-auth/jwt'

import { sessionService } from '@/lib/auth-extension-service'

import { SESSION_MAX_AGE_SECONDS } from './config'

/**
 * Opens a session and returns the identifier the token will carry.
 *
 * One row per sign-in, keyed by a value we mint rather than by anything Auth.js
 * hands us. `jti` is the obvious candidate and the wrong one: Auth.js calls
 * `setJti(randomUUID())` on every re-encode and re-encodes on every request, so
 * a row keyed on it would be orphaned before the user's second page load. `sub`
 * is wrong for the opposite reason - it names the person, so revoking their
 * laptop would sign out their phone.
 *
 * `expiresAt` is housekeeping for the listing and the live-session index. What
 * decides whether this session may still authenticate is `endedAt`; the
 * cookie's own expiry is enforced cryptographically, long before the row is
 * read.
 */
export async function openSession(userId: string, organizationId: string): Promise<string> {
  const sid = randomUUID()
  await sessionService.register({
    userId,
    organizationId,
    tokenId: sid,
    expiresAt: new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000),
  })
  return sid
}

/**
 * Keeps the token's claims honest, and ties it to a revocable session.
 *
 * At sign-in the roles come from the credentials check. Afterwards they are
 * re-read from the database, because a token issued eight hours ago is not
 * evidence of what someone may do now. Without this, revoking an administrator
 * would leave them fully privileged until their session expired - the role row
 * would be gone and every check would still pass.
 *
 * The same reasoning is what `sid` extends to the session itself: re-reading
 * roles never helped against a user whose access should end entirely, because
 * the token still spoke for a session nobody could withdraw.
 *
 * Lives in its own module so it can be called directly by a test. Reaching it
 * through `./index` would construct the whole Auth.js instance, and the thing
 * worth asserting here is thirty lines of branching, not the framework.
 */
export async function jwtCallback({
  token,
  user,
}: {
  token: JWT
  user?: { id?: string; organizationId: string; roles: JWT['roles']; accountId?: string | null }
}): Promise<JWT> {
  if (user) {
    token.organizationId = user.organizationId
    token.roles = user.roles
    token.accountId = user.accountId ?? null
    // `User.id` is optional in the Auth.js type. The credentials provider always
    // returns one, so this is unreachable in practice - but a sign-in carrying
    // no identity is not a session that could be recorded or revoked, and
    // inventing an identifier would be worse than refusing.
    if (!user.id) throw new Error('Sign-in produced no user id.')
    // Not caught. A session that cannot be recorded cannot be revoked either,
    // and issuing a cookie nobody can withdraw is the exact failure this batch
    // exists to remove. The sign-in fails instead.
    token.sid = await openSession(user.id, user.organizationId)
    return token
  }

  if (token.sub) {
    const userLookupStartedAt = Date.now()
    const current = await userRepository.findById(token.sub)
    const userLookupMs = Date.now() - userLookupStartedAt

    if (Math.random() < 0.01) {
      console.log('[JWT-PROFILE]', {
        userLookupMs,
      })
    }
    if (!current) {
      // The account is gone. Strip the claims rather than leaving a token that
      // still asserts them.
      token.roles = []
      token.accountId = null
      return token
    }
    token.organizationId = current.organizationId
    token.roles = current.roles.map((r) => r.role.name).filter(isRole)
    // Refreshed with the rest. Moving someone between accounts, or out of one,
    // must take effect on the next refresh rather than at expiry - the same
    // reason roles are re-read here.
    token.accountId = current.accountId ?? null

    // A cookie issued before sessions were registered. Adopted rather than
    // rejected: every signed-in user would otherwise be thrown out mid-task at
    // deploy, and adopting costs one row while making the session revocable
    // from this request onward. Once only - the claim survives re-encode, so a
    // fresh identifier per request, which would leave a trail of dead rows and
    // a live session nobody could revoke, cannot happen.
    if (!token.sid) {
      try {
        token.sid = await openSession(current.id, current.organizationId)
      } catch (err) {
        // Swallowed deliberately, and deliberately not a grant. Throwing here
        // makes Auth.js discard the session cookie, so one database blip would
        // sign out every user permanently. Leaving `sid` unset denies this
        // request at `loadContext` - closed, but recoverable - and the next
        // request tries again.
        logger.error({ err: String(err), userId: current.id }, 'session.adopt_failed')
      }
    }
  }

  return token
}
