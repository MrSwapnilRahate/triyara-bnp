import { describe, expect, it } from 'vitest'

import { assertAbility, assertRole, resolveContext } from './guards'
import type { AuthUser } from './session'

const user: AuthUser = {
  id: 'u1',
  organizationId: 'org1',
  email: 'a@b.com',
  name: 'A',
  roles: ['EXPORT_MANAGER'],
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
