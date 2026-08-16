import type { Role } from '@triyara/auth'
import { describe, expect, it } from 'vitest'

import { authConfig } from './config'

/**
 * Which routes need a session, and which need ADMIN.
 *
 * Written for /verify-email, whose placement is a decision rather than an
 * accident. ADR-0011 records it: confirming a token runs against an
 * authenticated session, so the verify page sits inside the protected area and
 * a signed-out visitor is sent to /login first. Putting it in PUBLIC_PATHS
 * would produce a page that loads and then cannot do the one thing it exists
 * for.
 *
 * It is equally important that it is not administrative. Verifying your own
 * address is not an admin act, so the page must not sit under /admin, where the
 * callback below would refuse every role but one.
 */

const authorized = authConfig.callbacks?.authorized

/** The shape the callback reads: a session, or nothing. */
function ask(pathname: string, roles: Role[] | null) {
  const auth = roles ? { user: { roles } } : null
  return authorized?.({
    auth,
    request: { nextUrl: { pathname } },
  } as never)
}

describe('/verify-email is protected, but not administrative', () => {
  it('sends a signed-out visitor to sign in first', () => {
    // Not in PUBLIC_PATHS, deliberately: the confirm endpoint needs a session.
    expect(ask('/verify-email', null)).toBe(false)
  })

  it.each(['ADMIN', 'EXPORT_MANAGER', 'VERIFIER', 'READ_ONLY'] as Role[])(
    'lets a signed-in %s reach it',
    (role) => {
      // Every role verifies their own address, so every role reaches the page
      // the link lands on. READ_ONLY included - that is the whole point.
      expect(ask('/verify-email', [role])).toBe(true)
    },
  )

  it('is not behind the admin gate', () => {
    // The contrast: /admin refuses the same session the verify page accepts.
    expect(ask('/admin/users', ['READ_ONLY'])).toBe(false)
    expect(ask('/admin/users', ['ADMIN'])).toBe(true)
  })

  it('leaves the profile screen reachable by every signed-in role', () => {
    // Where the "send verification email" control lives.
    for (const role of ['ADMIN', 'EXPORT_MANAGER', 'VERIFIER', 'READ_ONLY'] as Role[]) {
      expect(ask('/settings/profile', [role]), role).toBe(true)
    }
  })
})
