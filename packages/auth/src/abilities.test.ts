import { describe, expect, it } from 'vitest'

import { ACTIONS, buildAbilityFor, SUBJECTS } from './abilities'

describe('buildAbilityFor', () => {
  it('ADMIN can manage everything', () => {
    const a = buildAbilityFor(['ADMIN'])
    expect(a.can('manage', 'all')).toBe(true)
    expect(a.can('delete', 'User')).toBe(true)
  })

  it('EXPORTER can edit accounts but not approve verification or manage users', () => {
    const a = buildAbilityFor(['EXPORTER'])
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

  it('EXTERNAL_PARTY has no abilities whatsoever', () => {
    // An authenticated Buyer or Supplier. Every internal role holds `read all`,
    // which for an external party would expose the other buyers and the whole
    // supplier network; the correct grant until record-level scoping exists is
    // none. Asserted across every subject rather than a sample, so a rule added
    // for any one of them fails here.
    const ability = buildAbilityFor(['EXTERNAL_PARTY'])
    for (const subject of SUBJECTS) {
      for (const action of ACTIONS) {
        expect(ability.can(action, subject), `${action} ${subject}`).toBe(false)
      }
    }
  })

  it('does not change what any internal role holds', () => {
    // The enum gained a member; the four existing roles must answer exactly as
    // before. A regression here would mean the new role leaked into a shared
    // rule rather than standing alone.
    expect(buildAbilityFor(['ADMIN']).can('manage', 'all')).toBe(true)
    expect(buildAbilityFor(['EXPORTER']).can('read', 'all')).toBe(true)
    expect(buildAbilityFor(['EXPORTER']).can('update', 'Account')).toBe(true)
    expect(buildAbilityFor(['EXPORTER']).can('manage', 'all')).toBe(false)
    expect(buildAbilityFor(['VERIFIER']).can('verify', 'Verification')).toBe(true)
    expect(buildAbilityFor(['VERIFIER']).can('update', 'Account')).toBe(false)
    expect(buildAbilityFor(['READ_ONLY']).can('read', 'all')).toBe(true)
    expect(buildAbilityFor(['READ_ONLY']).can('update', 'Account')).toBe(false)
  })

  it('does not let EXTERNAL_PARTY widen a role it is paired with', () => {
    // Roles are additive, so holding both must equal holding the internal one.
    // If EXTERNAL_PARTY ever gains a rule, this is where the surprise shows up.
    const readOnly = buildAbilityFor(['READ_ONLY'])
    const paired = buildAbilityFor(['READ_ONLY', 'EXTERNAL_PARTY'])
    for (const subject of SUBJECTS) {
      for (const action of ACTIONS) {
        expect(paired.can(action, subject), `${action} ${subject}`).toBe(
          readOnly.can(action, subject),
        )
      }
    }
  })

  it('READ_ONLY can read but not write', () => {
    const a = buildAbilityFor(['READ_ONLY'])
    expect(a.can('read', 'Account')).toBe(true)
    expect(a.can('create', 'Account')).toBe(false)
    expect(a.can('verify', 'Verification')).toBe(false)
  })
})
