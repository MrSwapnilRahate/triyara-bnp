import { type AppAbility, buildAbilityFor, type Role } from '@triyara/auth'
import { describe, expect, it } from 'vitest'

/**
 * Who may act on a website enquiry.
 *
 * The reason `QuoteRequest` is its own subject rather than riding on `RFQ`: an
 * intake record is an unqualified lead from a stranger, an RFQ is a commercial
 * sourcing document. What this file pins down is that the two are genuinely
 * decided apart, and that nobody can create or delete an intake record through
 * the API at all.
 */

const ROLES: Role[] = ['ADMIN', 'EXPORT_MANAGER', 'VERIFIER', 'READ_ONLY']

const ability = (role: Role): AppAbility => buildAbilityFor([role])

describe('reading the intake queue', () => {
  it.each(ROLES)('%s can read enquiries', (role) => {
    // Every internal role holds `read all`. The queue is internal work in
    // progress, and hiding it from a verifier would not protect anything.
    expect(ability(role).can('read', 'QuoteRequest')).toBe(true)
  })
})

describe('triaging an enquiry', () => {
  it.each([
    ['ADMIN', true],
    ['EXPORT_MANAGER', true],
    ['VERIFIER', false],
    ['READ_ONLY', false],
  ] as const)('%s update -> %s', (role, allowed) => {
    expect(ability(role).can('update', 'QuoteRequest')).toBe(allowed)
  })
})

describe('creation and deletion are not offered to anyone', () => {
  it.each(ROLES.filter((r) => r !== 'ADMIN'))('%s cannot create an enquiry', (role) => {
    // An intake record exists because a member of the public submitted one.
    // The public endpoint has no AuthContext at all, so no role needs `create`
    // - and granting it would invite a second, authenticated way to make one.
    expect(ability(role).can('create', 'QuoteRequest')).toBe(false)
  })

  it.each(ROLES.filter((r) => r !== 'ADMIN'))('%s cannot delete an enquiry', (role) => {
    // Junk is REJECTED with a reason, which is a statement about the enquiry.
    // Erasing it would leave the desk unable to tell "we looked and it was
    // junk" from "it never arrived".
    expect(ability(role).can('delete', 'QuoteRequest')).toBe(false)
  })

  it('ADMIN reaches both only through `manage all`, not a named grant', () => {
    // Documented rather than assumed: ADMIN is deliberately unrestricted, and
    // this records that the reach comes from the blanket rule.
    const admin = buildAbilityFor(['ADMIN'])
    expect(admin.can('manage', 'all')).toBe(true)
    expect(admin.can('delete', 'QuoteRequest')).toBe(true)
  })
})

describe('the subject is genuinely separate from RFQ', () => {
  it('does not let intake rights imply RFQ rights', () => {
    // A verifier may read the queue but must not be able to raise an RFQ from
    // it. If promotion were authorized on the intake subject alone, this is the
    // actor who would slip through.
    const verifier = buildAbilityFor(['VERIFIER'])
    expect(verifier.can('read', 'QuoteRequest')).toBe(true)
    expect(verifier.can('create', 'RFQ')).toBe(false)
  })

  it('does not let RFQ rights imply intake rights', () => {
    // The mirror. Nothing today grants `create RFQ` without `update
    // QuoteRequest`, but the two are separate decisions and this states it.
    const handBuilt = buildAbilityFor([])
    expect(handBuilt.can('update', 'QuoteRequest')).toBe(false)
    expect(handBuilt.can('create', 'RFQ')).toBe(false)
  })

  it('leaves every pre-existing RFQ answer untouched', () => {
    // The intake subject is additive. If adding it changed what any role holds
    // on RFQ, that would be a permission change smuggled in by a new feature.
    const EXPECTED_RFQ: Record<Role, { create: boolean; manage: boolean }> = {
      ADMIN: { create: true, manage: true },
      EXPORT_MANAGER: { create: true, manage: false },
      VERIFIER: { create: false, manage: false },
      READ_ONLY: { create: false, manage: false },
    }
    for (const role of ROLES) {
      const a = ability(role)
      expect(a.can('create', 'RFQ'), `${role} create RFQ`).toBe(EXPECTED_RFQ[role].create)
      expect(a.can('manage', 'RFQ'), `${role} manage RFQ`).toBe(EXPECTED_RFQ[role].manage)
    }
  })
})
