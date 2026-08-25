import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { UnauthenticatedError } from '@triyara/lib'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Revocation, at the boundary where it has to hold.
 *
 * The property under test is not "the service can refuse a session" - that was
 * already true and already tested, and it protected nobody, because no request
 * path called it. It is: sign in, revoke that session, and the next
 * authenticated request is refused.
 *
 * So these exercise `loadContext` through `requireAuth`, which is where all 135
 * authenticating API routes and every data-reading page arrive. Asserting on the
 * service instead would pass with the enforcement call deleted, which is exactly
 * the state this batch found the codebase in.
 *
 * `./index` is mocked to keep Auth.js out of it: what a signed-in request looks
 * like is the input here, not the thing being proved.
 */

const authFn = vi.fn()
const assertLive = vi.fn()

vi.mock('./index', () => ({ auth: () => authFn() }))
vi.mock('@/lib/auth-extension-service', () => ({
  sessionService: {
    assertLive: (organizationId: string, tokenId: string) => assertLive(organizationId, tokenId),
  },
}))

const { requireAuth } = await import('./context')

const SID = 'sid-session-a'

function signedIn(over: Record<string, unknown> = {}) {
  return {
    user: {
      id: 'u1',
      organizationId: 'org1',
      email: 'staff@triyara.test',
      name: 'Staff',
      roles: ['EXPORTER'],
      accountId: null,
      sid: SID,
      ...over,
    },
  }
}

beforeEach(() => {
  authFn.mockReset()
  assertLive.mockReset()
  authFn.mockResolvedValue(signedIn())
  assertLive.mockResolvedValue(undefined)
})

describe('an active session is let through unchanged', () => {
  it('returns a normal context', async () => {
    const ctx = await requireAuth()
    expect(ctx.user.id).toBe('u1')
    expect(ctx.organizationId).toBe('org1')
  })

  it('still builds the ability set from the roles', async () => {
    // The regression that would matter most: adding a session check must not
    // disturb what the request is allowed to do once it passes.
    const ctx = await requireAuth()
    expect(ctx.ability).toBeDefined()
    expect(ctx.user.roles).toEqual(['EXPORTER'])
  })

  it('checks the session on every request, not once per process', async () => {
    await requireAuth()
    await requireAuth()
    expect(assertLive).toHaveBeenCalledTimes(2)
  })
})

describe('the session is checked before anything is granted', () => {
  it('asks about this session, scoped to this organization', async () => {
    await requireAuth()
    expect(assertLive).toHaveBeenCalledWith('org1', SID)
  })

  it('follows the signed-in organization rather than a fixed value', async () => {
    authFn.mockResolvedValue(signedIn({ organizationId: 'org9', sid: 'sid-9' }))
    await requireAuth()
    expect(assertLive).toHaveBeenCalledWith('org9', 'sid-9')
  })

  it('passes the session identifier, never the user id', async () => {
    // `sub` names the person. Keyed on that, revoking a laptop would sign out
    // the phone, and every one of this user's sessions would die together.
    await requireAuth()
    const [, identifier] = assertLive.mock.calls[0]!
    expect(identifier).toBe(SID)
    expect(identifier).not.toBe('u1')
  })

  it('refuses before resolving the context, so a revoked token gains no ability', async () => {
    assertLive.mockRejectedValue(new UnauthenticatedError('This session is no longer valid.'))
    await expect(requireAuth()).rejects.toThrow(UnauthenticatedError)
  })
})

describe('THE property: revoking a session ends it on the next request', () => {
  it('lets the request through while the session is live', async () => {
    await expect(requireAuth()).resolves.toBeDefined()
  })

  it('refuses the very next request once that session is revoked', async () => {
    // Same token, same user, same organization. The only thing that changed is
    // the answer from the database.
    await expect(requireAuth()).resolves.toBeDefined()

    assertLive.mockRejectedValue(new UnauthenticatedError('This session is no longer valid.'))

    await expect(requireAuth()).rejects.toThrow(/no longer valid/i)
  })
})

describe('a session that cannot be identified is refused, not trusted', () => {
  it.each([
    ['missing', undefined],
    ['null', null],
    ['empty', ''],
  ])('refuses a token whose sid is %s', async (_label, sid) => {
    authFn.mockResolvedValue(signedIn({ sid }))
    await expect(requireAuth()).rejects.toThrow(UnauthenticatedError)
  })

  it('does not fall back to looking the session up by user', async () => {
    // The tempting repair for a missing claim, and a hole: it would make every
    // sid-less token permanently valid for as long as the user exists.
    authFn.mockResolvedValue(signedIn({ sid: null }))
    await expect(requireAuth()).rejects.toThrow(UnauthenticatedError)
    expect(assertLive).not.toHaveBeenCalled()
  })

  it('still refuses when there is no session at all', async () => {
    authFn.mockResolvedValue(null)
    await expect(requireAuth()).rejects.toThrow(UnauthenticatedError)
  })
})

describe('a lookup that fails denies the request', () => {
  it('does not let the request through when the database throws', async () => {
    // Fail closed. An unanswered revocation check is not a granted one, and the
    // shape that would break this - try/catch around the call, continuing on
    // error - is the single most dangerous edit available in this file.
    assertLive.mockRejectedValue(new Error('connect ECONNREFUSED'))
    await expect(requireAuth()).rejects.toThrow(/ECONNREFUSED/)
  })

  it('surfaces the failure rather than converting it into a signed-out user', async () => {
    // Deliberate: a transient outage denies the request and leaves the cookie
    // alone, so the session recovers by itself. Translating it into a clean
    // "signed out" would invite clearing the cookie and log everyone out for
    // the duration of a blip.
    assertLive.mockRejectedValue(new Error('connect ECONNREFUSED'))
    await expect(requireAuth()).rejects.not.toBeInstanceOf(UnauthenticatedError)
  })
})

/**
 * The enforcement is in the shared resolver, not sprinkled over the routes.
 *
 * Source-level for the reason earlier batches established: a route that
 * authenticated some other way would type-check and behave identically until
 * somebody revoked a session, and nothing in rendered output shows the
 * difference.
 */
describe('enforcement sits in the shared resolver', () => {
  const source = readFileSync(join(__dirname, 'context.ts'), 'utf8')
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

  it('calls the session service from loadContext', () => {
    expect(code).toContain('sessionService.assertLive')
  })

  it('passes the organization and the sid, in that order', () => {
    expect(code).toMatch(/assertLive\(\s*u\.organizationId\s*,\s*u\.sid\s*\)/)
  })

  it('refuses a missing sid rather than skipping the check', () => {
    expect(code).toMatch(/if \(!u\.sid\) throw/)
  })

  it('never swallows a failed lookup', () => {
    expect(code).not.toMatch(/catch[\s\S]{0,80}assertLive/)
    expect(code).not.toMatch(/assertLive[\s\S]{0,80}catch/)
  })

  it('does not reach the repository directly', () => {
    expect(code).not.toContain('sessionRepository')
    expect(code).not.toContain('prisma')
  })
})
