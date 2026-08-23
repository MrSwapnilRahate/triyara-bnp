import { describe, expect, it } from 'vitest'

import { assertAbility, assertRole, requireExternalAccountContext, resolveContext } from './guards'
import type { AuthUser } from './session'

const user: AuthUser = {
  id: 'u1',
  organizationId: 'org1',
  email: 'a@b.com',
  name: 'A',
  roles: ['EXPORT_MANAGER'],
  accountId: null,
}

/** An authenticated external party. Belongs to an Account, holds no role. */
const externalUser: AuthUser = {
  id: 'u2',
  organizationId: 'org1',
  email: 'buyer@example.test',
  name: 'A Buyer',
  roles: ['EXTERNAL_PARTY'],
  accountId: 'acct-1',
}

describe('guards', () => {
  it('resolveContext throws when unauthenticated', () => {
    expect(() => resolveContext(null)).toThrowError()
    expect(() => resolveContext({ user: null })).toThrowError()
  })

  it('resolveContext builds ability + org scope', () => {
    const ctx = resolveContext({ user })
    expect(ctx.organizationId).toBe('org1')
    expect(ctx.ability.can('update', 'Account')).toBe(true)
  })

  it('lifts accountId onto the context, null for internal staff', () => {
    // Internal staff belong to no external party, and every existing user is
    // internal. Reading `undefined` here rather than `null` would make the
    // absent case indistinguishable from a claim that failed to propagate.
    expect(resolveContext({ user }).accountId).toBeNull()
  })

  it('lifts accountId onto the context for an external party', () => {
    // The identifier a later batch will scope records by. It has to survive the
    // trip from the session to the context, or nothing downstream can use it.
    expect(resolveContext({ user: externalUser }).accountId).toBe('acct-1')
  })

  it('gives an external party no abilities at all', () => {
    // The security property of this batch. EXTERNAL_PARTY authenticates and
    // reaches nothing until record-level scoping exists.
    const ctx = resolveContext({ user: externalUser })
    expect(ctx.ability.can('read', 'all')).toBe(false)
    expect(ctx.ability.can('read', 'Account')).toBe(false)
    expect(ctx.ability.can('read', 'RFQ')).toBe(false)
    expect(ctx.ability.can('read', 'Document')).toBe(false)
  })

  it('assertRole passes for held role, throws otherwise', () => {
    const ctx = resolveContext({ user })
    expect(() => assertRole(ctx, 'EXPORT_MANAGER')).not.toThrow()
    expect(() => assertRole(ctx, 'ADMIN')).toThrowError()
  })

  it('assertAbility enforces permissions', () => {
    const ctx = resolveContext({ user })
    expect(() => assertAbility(ctx, 'update', 'Account')).not.toThrow()
    expect(() => assertAbility(ctx, 'verify', 'Verification')).toThrowError()
  })
})

/**
 * The account scope an external route may narrow a query by.
 *
 * The value these cases are really about is `undefined`. Prisma omits a `where`
 * key whose value is undefined, so `where: { accountId: ctx.accountId }` with a
 * missing claim is not a query that finds nothing - it is a query with no filter
 * at all, returning every account's rows. `null` fails closed by comparison.
 * That asymmetry is why the guard exists and why both are asserted separately.
 */
describe('requireExternalAccountContext', () => {
  it('returns the account of an external party', () => {
    const scope = requireExternalAccountContext(resolveContext({ user: externalUser }))
    expect(scope.accountId).toBe('acct-1')
  })

  it('refuses an external party whose accountId is null', () => {
    // Reachable today: the jwt callback sets `accountId = null` when the user
    // behind a token no longer exists, keeping the role claim from the old
    // token. Fails closed rather than querying with no scope.
    const orphan: AuthUser = { ...externalUser, accountId: null }
    expect(() => requireExternalAccountContext(resolveContext({ user: orphan }))).toThrowError(
      /No account/,
    )
  })

  it('refuses an external party whose accountId is missing entirely', () => {
    // The dangerous one. `accountId` is optional on AuthUser, so a context built
    // without it type-checks - and undefined is what silently drops the filter.
    const { accountId: _omitted, ...withoutAccount } = externalUser
    expect(() =>
      requireExternalAccountContext(resolveContext({ user: withoutAccount as AuthUser })),
    ).toThrowError(/No account/)
  })

  it('refuses an accountId that is an empty string', () => {
    // Not null and not undefined, so the obvious `?? throw` would let it past -
    // and `where: { accountId: '' }` looks scoped while matching nothing.
    const blank: AuthUser = { ...externalUser, accountId: '' }
    expect(() => requireExternalAccountContext(resolveContext({ user: blank }))).toThrowError(
      /No account/,
    )
  })

  it('refuses internal staff, even holding an accountId', () => {
    // Staff act across the tenant through CASL, never through an account scope.
    // Reaching here at all means an external-only path was entered by someone it
    // was not written for, which is worth refusing rather than interpreting.
    const staffWithAccount: AuthUser = { ...user, accountId: 'acct-1' }
    expect(() =>
      requireExternalAccountContext(resolveContext({ user: staffWithAccount })),
    ).toThrowError(/Not an external party/)
  })

  it('refuses an ADMIN, whose broad abilities are not an account scope', () => {
    const admin: AuthUser = { ...user, roles: ['ADMIN'], accountId: 'acct-1' }
    expect(() => requireExternalAccountContext(resolveContext({ user: admin }))).toThrowError(
      /Not an external party/,
    )
  })
})
