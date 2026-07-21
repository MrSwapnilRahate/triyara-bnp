import { describe, expect, it } from 'vitest'

import { buildAbilityFor } from './abilities'

describe('buildAbilityFor', () => {
  it('ADMIN can manage everything', () => {
    const a = buildAbilityFor(['ADMIN'])
    expect(a.can('manage', 'all')).toBe(true)
    expect(a.can('delete', 'User')).toBe(true)
  })

  it('EXPORT_MANAGER can edit accounts but not approve verification or manage users', () => {
    const a = buildAbilityFor(['EXPORT_MANAGER'])
    expect(a.can('update', 'Account')).toBe(true)
    expect(a.can('read', 'Verification')).toBe(true)
    expect(a.can('verify', 'Verification')).toBe(false)
    expect(a.can('delete', 'User')).toBe(false)
  })

  it('VERIFIER can verify but not edit accounts', () => {
    const a = buildAbilityFor(['VERIFIER'])
    expect(a.can('verify', 'Verification')).toBe(true)
    expect(a.can('update', 'Account')).toBe(false)
  })

  it('READ_ONLY can read but not write', () => {
    const a = buildAbilityFor(['READ_ONLY'])
    expect(a.can('read', 'Account')).toBe(true)
    expect(a.can('create', 'Account')).toBe(false)
    expect(a.can('verify', 'Verification')).toBe(false)
  })
})
