import { describe, expect, it } from 'vitest'

import { assertAbility, assertRole, resolveContext } from './guards'
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
