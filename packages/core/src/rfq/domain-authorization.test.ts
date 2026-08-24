import { type AppAbility, buildAbilityFor, type Role } from '@triyara/auth'
import { describe, expect, it } from 'vitest'

/**
 * RFQs and quotations decided on their own subjects.
 *
 * They used to be authorized as `Account`, so "may edit a customer record" and
 * "may raise an RFQ" were one permission, and deleting an RFQ required the right
 * to delete the customer. The point of the split is that the two can now differ
 * - so what this file mostly proves is that today they still do NOT, because
 * this change was meant to move the decision, not the answer.
 */

const ROLES: Role[] = ['ADMIN', 'EXPORTER', 'VERIFIER', 'READ_ONLY']

/** What `Account` used to grant, and therefore what RFQ/Quotation must grant. */
const EXPECTED: Record<Role, { read: boolean; write: boolean; manage: boolean; del: boolean }> = {
  ADMIN: { read: true, write: true, manage: true, del: true },
  EXPORTER: { read: true, write: true, manage: false, del: false },
  VERIFIER: { read: true, write: false, manage: false, del: false },
  READ_ONLY: { read: true, write: false, manage: false, del: false },
  // Holds nothing at all - see abilities.ts.
  EXTERNAL_PARTY: { read: false, write: false, manage: false, del: false },
}

const ability = (role: Role): AppAbility => buildAbilityFor([role])

describe.each(['RFQ', 'Quotation'] as const)('%s authorization', (subject) => {
  it.each(ROLES)('gives %s exactly what Account used to give it', (role) => {
    const a = ability(role)
    const want = EXPECTED[role]

    expect(a.can('read', subject), `${role} read ${subject}`).toBe(want.read)
    expect(a.can('create', subject), `${role} create ${subject}`).toBe(want.write)
    expect(a.can('update', subject), `${role} update ${subject}`).toBe(want.write)
    expect(a.can('manage', subject), `${role} manage ${subject}`).toBe(want.manage)
    expect(a.can('delete', subject), `${role} delete ${subject}`).toBe(want.del)
  })

  it.each(ROLES)('matches what %s holds on Account, action for action', (role) => {
    // The migration is behaviour-preserving. If these ever diverge it must be a
    // decision someone made, not a change that leaked out of this refactor.
    const a = ability(role)
    for (const action of ['read', 'create', 'update', 'manage', 'delete'] as const) {
      expect(a.can(action, subject), `${role} ${action}`).toBe(a.can(action, 'Account'))
    }
  })
})

describe('the subjects are genuinely separate', () => {
  it('is decided against RFQ and Quotation, not against Account', () => {
    // A hand-built ability that can do everything to Account and nothing to the
    // new subjects: if a guard still consulted Account, this actor would pass.
    // It is the shape a future role could take once the two are allowed to
    // differ, and the reason the split was worth making.
    const accountOnly = buildAbilityFor([])
    expect(accountOnly.can('manage', 'Account')).toBe(false)
    expect(accountOnly.can('read', 'RFQ')).toBe(false)
    expect(accountOnly.can('read', 'Quotation')).toBe(false)
  })

  it('carries RFQ and Quotation in the subject vocabulary', () => {
    // The permission-matrix endpoint enumerates SUBJECTS, so an absent subject
    // would silently report nothing rather than fail.
    const a = ability('ADMIN')
    expect(a.can('manage', 'RFQ')).toBe(true)
    expect(a.can('manage', 'Quotation')).toBe(true)
  })

  it('leaves every other subject alone', () => {
    // Product and Category authorization is explicitly out of scope here.
    const em = ability('EXPORTER')
    expect(em.can('create', 'ReferenceData')).toBe(false)
    expect(em.can('update', 'ReferenceData')).toBe(false)
    expect(em.can('create', 'Account')).toBe(true)
    expect(em.can('manage', 'User')).toBe(false)
  })
})
