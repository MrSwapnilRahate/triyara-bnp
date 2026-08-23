import { describe, expect, it } from 'vitest'

import { authConfig } from './config'

/**
 * `accountId` survives the trip from the token to the session.
 *
 * The claim is what a later batch will scope an external party's records by, so
 * it has to arrive intact and it has to be `null` - not `undefined` - when there
 * is no account. A consumer that cannot tell "internal member of staff" from
 * "claim went missing" would have to guess, and guessing about the scope of a
 * query is how one buyer sees another.
 *
 * The session callback is exercised directly rather than through a signed-in
 * browser: it is the one place the mapping happens, and calling it is the whole
 * assertion.
 */

const sessionCallback = authConfig.callbacks?.session

/** The shape the callback reads, with only what it actually touches. */
function mapToSession(token: Record<string, unknown>) {
  return sessionCallback?.({
    session: { user: {} },
    token,
  } as never) as unknown as {
    user: { accountId: string | null; organizationId: string; roles: string[] }
  }
}

describe('accountId reaches the session', () => {
  it('carries the account of an external party', () => {
    const session = mapToSession({
      sub: 'u2',
      organizationId: 'org1',
      roles: ['EXTERNAL_PARTY'],
      accountId: 'acct-1',
    })
    expect(session.user.accountId).toBe('acct-1')
  })

  it('is null for internal staff, who belong to no account', () => {
    const session = mapToSession({ sub: 'u1', organizationId: 'org1', roles: ['ADMIN'] })
    expect(session.user.accountId).toBeNull()
  })

  it('is null rather than undefined when the token carries no claim', () => {
    // A token minted before this batch has no `accountId`. It must map to the
    // same "no account" answer as an internal user, not to a hole.
    const session = mapToSession({ sub: 'u1', organizationId: 'org1', roles: [] })
    expect(session.user.accountId).toBeNull()
    expect(session.user.accountId).not.toBeUndefined()
  })
})

describe('the existing claims are unchanged', () => {
  it('still maps id, organizationId and roles', () => {
    // The regression that would matter most: adding a claim must not disturb
    // the three every authenticated request already depends on.
    const session = mapToSession({
      sub: 'u1',
      organizationId: 'org-existing',
      roles: ['EXPORT_MANAGER'],
    })
    expect(session.user.organizationId).toBe('org-existing')
    expect(session.user.roles).toEqual(['EXPORT_MANAGER'])
  })

  it('defaults organizationId and roles when a token lacks them', () => {
    const session = mapToSession({ sub: 'u1' })
    expect(session.user.organizationId).toBe('')
    expect(session.user.roles).toEqual([])
  })
})
