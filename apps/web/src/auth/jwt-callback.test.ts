import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Where a session gets its identity.
 *
 * Two things have to be true and neither is visible from the outside: signing in
 * mints an identifier and records a row against it, and a cookie minted before
 * any of this existed is adopted rather than thrown out.
 *
 * The identifier must name the SESSION, not the user and not the token. Keyed on
 * `sub`, revoking a laptop would sign out the phone. Keyed on `jti`, the row
 * would be orphaned by the next request, because Auth.js re-mints `jti` every
 * time it re-encodes - which it does on every request.
 */

const register = vi.fn()
const findById = vi.fn()
const logError = vi.fn()

vi.mock('@/lib/auth-extension-service', () => ({
  sessionService: { register: (p: unknown) => register(p) },
}))
vi.mock('@triyara/db', () => ({
  userRepository: { findById: (id: string) => findById(id) },
}))
vi.mock('@triyara/lib', () => ({
  logger: { error: (...a: unknown[]) => logError(...a), warn: vi.fn(), info: vi.fn() },
}))

const { jwtCallback } = await import('./jwt-callback')

const SIGNING_IN = {
  id: 'u1',
  organizationId: 'org1',
  roles: ['EXPORTER' as const],
  accountId: null,
}

/** What the database returns for a token being refreshed. */
function dbUser(over: Record<string, unknown> = {}) {
  return {
    id: 'u1',
    organizationId: 'org1',
    accountId: null,
    roles: [{ role: { name: 'EXPORTER' } }],
    ...over,
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

beforeEach(() => {
  register.mockReset()
  findById.mockReset()
  logError.mockReset()
  register.mockResolvedValue({ id: 'row-1' })
  findById.mockResolvedValue(dbUser())
})

describe('signing in opens a session', () => {
  it('mints a session identifier', async () => {
    const token = await jwtCallback({ token: {} as never, user: SIGNING_IN })
    expect(token.sid).toMatch(UUID)
  })

  it('records exactly one session row', async () => {
    await jwtCallback({ token: {} as never, user: SIGNING_IN })
    expect(register).toHaveBeenCalledTimes(1)
  })

  it('records it against the user and organization signing in', async () => {
    const token = await jwtCallback({ token: {} as never, user: SIGNING_IN })
    expect(register).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', organizationId: 'org1', tokenId: token.sid }),
    )
  })

  it('persists the identifier the token carries, not a different one', async () => {
    const token = await jwtCallback({ token: {} as never, user: SIGNING_IN })
    expect(register.mock.calls[0]![0].tokenId).toBe(token.sid)
  })

  it('gives a second sign-in its own identifier, so both may be live at once', async () => {
    const a = await jwtCallback({ token: {} as never, user: SIGNING_IN })
    const b = await jwtCallback({ token: {} as never, user: SIGNING_IN })
    expect(a.sid).not.toBe(b.sid)
    expect(register).toHaveBeenCalledTimes(2)
  })

  it('does not key the session on the user', async () => {
    const token = await jwtCallback({ token: {} as never, user: SIGNING_IN })
    expect(token.sid).not.toBe('u1')
  })

  it('does not reuse the token id Auth.js mints', async () => {
    // `jti` is on the token here and must be ignored: it is replaced on every
    // re-encode, so a row keyed on it dies at the next request.
    const token = await jwtCallback({
      token: { jti: 'authjs-rotating-jti' } as never,
      user: SIGNING_IN,
    })
    expect(token.sid).not.toBe('authjs-rotating-jti')
  })

  it('fails the sign-in rather than issuing an unrevocable cookie', async () => {
    register.mockRejectedValue(new Error('connect ECONNREFUSED'))
    await expect(jwtCallback({ token: {} as never, user: SIGNING_IN })).rejects.toThrow(
      /ECONNREFUSED/,
    )
  })

  it('refuses a sign-in carrying no user id', async () => {
    await expect(
      jwtCallback({ token: {} as never, user: { ...SIGNING_IN, id: undefined } }),
    ).rejects.toThrow(/no user id/i)
    expect(register).not.toHaveBeenCalled()
  })
})

describe('a token that already has a session keeps it', () => {
  it('does not mint a new identifier on refresh', async () => {
    const token = await jwtCallback({ token: { sub: 'u1', sid: 'sid-existing' } as never })
    expect(token.sid).toBe('sid-existing')
  })

  it('records no second row for the same session', async () => {
    // A fresh identifier per request would leave a trail of dead rows and a live
    // session nobody could revoke, because the one being checked would always be
    // brand new.
    await jwtCallback({ token: { sub: 'u1', sid: 'sid-existing' } as never })
    await jwtCallback({ token: { sub: 'u1', sid: 'sid-existing' } as never })
    expect(register).not.toHaveBeenCalled()
  })
})

describe('a cookie minted before sessions existed is adopted', () => {
  it('mints an identifier for it', async () => {
    const token = await jwtCallback({ token: { sub: 'u1' } as never })
    expect(token.sid).toMatch(UUID)
  })

  it('records a session row so it becomes revocable', async () => {
    await jwtCallback({ token: { sub: 'u1' } as never })
    expect(register).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', organizationId: 'org1' }),
    )
  })

  it('adopts against the organization the database reports, not the stale claim', async () => {
    findById.mockResolvedValue(dbUser({ organizationId: 'org-moved' }))
    await jwtCallback({ token: { sub: 'u1', organizationId: 'org-old' } as never })
    expect(register.mock.calls[0]![0].organizationId).toBe('org-moved')
  })

  it('adopts once, not on every request', async () => {
    const first = await jwtCallback({ token: { sub: 'u1' } as never })
    await jwtCallback({ token: { sub: 'u1', sid: first.sid } as never })
    expect(register).toHaveBeenCalledTimes(1)
  })

  it('lets the request continue normally', async () => {
    const token = await jwtCallback({ token: { sub: 'u1' } as never })
    expect(token.roles).toEqual(['EXPORTER'])
    expect(token.organizationId).toBe('org1')
  })

  it('leaves the session unidentified when adoption fails, rather than throwing', async () => {
    // Throwing here makes Auth.js discard the cookie, so one database blip would
    // sign out every user permanently. Unset instead: `loadContext` refuses this
    // request, and the next one tries again.
    register.mockRejectedValue(new Error('connect ECONNREFUSED'))
    const token = await jwtCallback({ token: { sub: 'u1' } as never })
    expect(token.sid).toBeUndefined()
    expect(logError).toHaveBeenCalled()
  })

  it('does not adopt a token whose user is gone', async () => {
    findById.mockResolvedValue(null)
    const token = await jwtCallback({ token: { sub: 'u-deleted' } as never })
    expect(token.sid).toBeUndefined()
    expect(token.roles).toEqual([])
    expect(register).not.toHaveBeenCalled()
  })
})

describe('the claims that were already refreshed still are', () => {
  it('re-reads roles from the database', async () => {
    findById.mockResolvedValue(dbUser({ roles: [{ role: { name: 'ADMIN' } }] }))
    const token = await jwtCallback({ token: { sub: 'u1', sid: 's1', roles: [] } as never })
    expect(token.roles).toEqual(['ADMIN'])
  })

  it('re-reads the account', async () => {
    findById.mockResolvedValue(dbUser({ accountId: 'acct-9' }))
    const token = await jwtCallback({ token: { sub: 'u1', sid: 's1' } as never })
    expect(token.accountId).toBe('acct-9')
  })

  it('strips the claims of a deleted user', async () => {
    findById.mockResolvedValue(null)
    const token = await jwtCallback({ token: { sub: 'u1', sid: 's1' } as never })
    expect(token.roles).toEqual([])
    expect(token.accountId).toBeNull()
  })
})
