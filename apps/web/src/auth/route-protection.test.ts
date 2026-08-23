import type { Role } from '@triyara/auth'
import { describe, expect, it } from 'vitest'

import { authConfig } from './config'

/**
 * Which routes need a session, which need ADMIN, and which namespace an identity
 * belongs to.
 *
 * Originally written for /verify-email, whose placement is a decision rather
 * than an accident. ADR-0011 records it: confirming a token runs against an
 * authenticated session, so the verify page sits inside the protected area and
 * a signed-out visitor is sent to /login first. Putting it in PUBLIC_PATHS
 * would produce a page that loads and then cannot do the one thing it exists
 * for.
 *
 * It is equally important that it is not administrative. Verifying your own
 * address is not an admin act, so the page must not sit under /admin, where the
 * callback below would refuse every role but one.
 *
 * Extended for external identity. The callback used to end in `return true`,
 * which was right while every user was staff and became wrong the moment an
 * EXTERNAL_PARTY could sign in.
 */

const authorized = authConfig.callbacks?.authorized

const INTERNAL_ROLES: Role[] = ['ADMIN', 'EXPORT_MANAGER', 'VERIFIER', 'READ_ONLY']

/** Internal pages an external party must never render. One per area. */
const INTERNAL_ROUTES = [
  '/dashboard',
  '/accounts',
  '/suppliers',
  '/rfqs',
  '/quotations',
  '/verifications',
  '/catalog/products',
  '/documents',
  '/settings/profile',
  '/verify-email',
]

/**
 * The shape the callback reads.
 *
 * `nextUrl` is a real URL because the policy now builds redirects from it - a
 * bare `{ pathname }` would have been enough for a boolean answer and is not
 * enough for `new URL(target, nextUrl)`.
 */
function ask(pathname: string, roles: Role[] | null) {
  const auth = roles ? { user: { roles } } : null
  return authorized?.({
    auth,
    request: { nextUrl: new URL(pathname, 'https://bnp.test') },
  } as never)
}

/** Where a redirect answer points, or null when the answer was a boolean. */
function redirectTarget(result: unknown): string | null {
  if (typeof result !== 'object' || result === null) return null
  const location = (result as Response).headers?.get('location')
  return location ? new URL(location).pathname : null
}

describe('/verify-email is protected, but not administrative', () => {
  it('sends a signed-out visitor to sign in first', () => {
    // Not in PUBLIC_PATHS, deliberately: the confirm endpoint needs a session.
    expect(ask('/verify-email', null)).toBe(false)
  })

  it.each(INTERNAL_ROLES)('lets a signed-in %s reach it', (role) => {
    // Every role verifies their own address, so every role reaches the page
    // the link lands on. READ_ONLY included - that is the whole point.
    expect(ask('/verify-email', [role])).toBe(true)
  })

  it('is not behind the admin gate', () => {
    // The contrast: /admin refuses the same session the verify page accepts.
    expect(ask('/admin/users', ['READ_ONLY'])).toBe(false)
    expect(ask('/admin/users', ['ADMIN'])).toBe(true)
  })

  it('leaves the profile screen reachable by every signed-in role', () => {
    // Where the "send verification email" control lives.
    for (const role of INTERNAL_ROLES) {
      expect(ask('/settings/profile', [role]), role).toBe(true)
    }
  })
})

describe('an external party is confined to the portal', () => {
  it('reaches /portal', () => {
    expect(ask('/portal', ['EXTERNAL_PARTY'])).toBe(true)
  })

  it('reaches pages beneath /portal', () => {
    expect(ask('/portal/requirements', ['EXTERNAL_PARTY'])).toBe(true)
    expect(ask('/portal/a/b/c', ['EXTERNAL_PARTY'])).toBe(true)
  })

  it.each(INTERNAL_ROUTES)('is redirected away from %s', (path) => {
    // The property this batch exists for. Redirected rather than merely
    // refused: `(app)/layout.tsx` asks only for a session, so without this the
    // internal shell would render for a buyer.
    const result = ask(path, ['EXTERNAL_PARTY'])
    expect(result).not.toBe(true)
    expect(redirectTarget(result)).toBe('/portal')
  })

  it('cannot reach /admin', () => {
    const result = ask('/admin/users', ['EXTERNAL_PARTY'])
    expect(result).not.toBe(true)
    expect(redirectTarget(result)).toBe('/portal')
  })

  it('is not let through by a prefix that merely starts with the word', () => {
    // `/portalling` must not match `/portal`. A `startsWith('/portal')` check
    // would have allowed it.
    const result = ask('/portalling', ['EXTERNAL_PARTY'])
    expect(result).not.toBe(true)
    expect(redirectTarget(result)).toBe('/portal')
  })

  it('gains nothing from also holding an internal role', () => {
    // Roles are additive, so a paired identity has to resolve one way or the
    // other. It resolves as external: the safer of the two, and the one that
    // cannot be used to smuggle a buyer into the internal application.
    const result = ask('/accounts', ['EXTERNAL_PARTY', 'READ_ONLY'])
    expect(result).not.toBe(true)
    expect(redirectTarget(result)).toBe('/portal')
  })
})

describe('internal staff stay out of the portal', () => {
  it.each(INTERNAL_ROLES)('redirects %s away from /portal', (role) => {
    // ADMIN included. `manage all` is a permission, and the portal is an
    // audience - a different boundary, decided here rather than by CASL.
    const result = ask('/portal', [role])
    expect(result).not.toBe(true)
    expect(redirectTarget(result)).toBe('/dashboard')
  })

  it('redirects them away from pages beneath /portal too', () => {
    expect(redirectTarget(ask('/portal/requirements', ['ADMIN']))).toBe('/dashboard')
  })

  it('keeps every internal route they already had', () => {
    for (const path of INTERNAL_ROUTES) {
      expect(ask(path, ['EXPORT_MANAGER']), path).toBe(true)
    }
  })
})

describe('the fallthrough denies', () => {
  it('refuses a signed-in session carrying no role at all', () => {
    // Reachable: the jwt callback strips roles to [] when the user behind a
    // token no longer exists. Such a session belongs to no namespace, so it
    // gets none - where the old `return true` gave it the whole application.
    expect(ask('/dashboard', [])).toBe(false)
    expect(ask('/portal', [])).toBe(false)
    expect(ask('/admin/users', [])).toBe(false)
  })

  it('still sends a signed-out visitor to sign in', () => {
    expect(ask('/dashboard', null)).toBe(false)
    expect(ask('/portal', null)).toBe(false)
  })
})

describe('public and auth routes are untouched', () => {
  it.each(['/', '/login', '/forgot-password', '/reset-password', '/privacy', '/terms'])(
    'leaves %s open to a signed-out visitor',
    (path) => {
      expect(ask(path, null)).toBe(true)
    },
  )

  it.each(['/register/buyer', '/register/supplier', '/register/buyer/requirement'])(
    'leaves %s open, so registration still works',
    (path) => {
      expect(ask(path, null)).toBe(true)
    },
  )

  it('lets an external party reach the password and login pages', () => {
    // The invitation lands on /reset-password. If the policy sent an external
    // party from there to /portal, they could never set their password - and
    // /portal would then refuse them for having no session.
    expect(ask('/reset-password', ['EXTERNAL_PARTY'])).toBe(true)
    expect(ask('/login', ['EXTERNAL_PARTY'])).toBe(true)
  })
})
