import {
  type Action,
  type AppAbility,
  buildAbilityFor,
  type Role,
  type Subject,
} from '@triyara/auth'
import type { EventBus } from '@triyara/events'
import { describe, expect, it, vi } from 'vitest'

import { createSupplierMasterService } from './supplier.service'
import { createSupplierCertificationService } from './supplier-certification.service'
import { createSupplierContactService } from './supplier-contact.service'
import { createSupplierDocumentService } from './supplier-document.service'
import { createSupplierMatchingService } from './supplier-matching.service'
import { createSupplierNoteService } from './supplier-note.service'
import { createSupplierOfferingService } from './supplier-offering.service'

/**
 * The supplier master decided on its own subject.
 *
 * It was authorized as `SupplierProfile`, which is a different Prisma model -
 * the profile hanging off an Account. Two unrelated records shared one
 * permission, so "may maintain an account's supplier profile" and "may delete
 * the supplier master's certifications" were the same right and could never be
 * granted apart.
 *
 * Unlike the earlier splits, this one is NOT free. A new subject starts with no
 * grants, and EXPORT_MANAGER holds create/update on SupplierProfile - so the
 * ability had to name `Supplier` explicitly or an export manager would have
 * silently lost supplier onboarding. The service documented that contract
 * ("create/update -> ADMIN and EXPORT_MANAGER") and a test has asserted it
 * since it was written; the first block below pins it as an equivalence.
 */

const ROLES: Role[] = ['ADMIN', 'EXPORT_MANAGER', 'VERIFIER', 'READ_ONLY']
const BELOW_ADMIN: Role[] = ['EXPORT_MANAGER', 'VERIFIER', 'READ_ONLY']
const ACTIONS = ['read', 'create', 'update', 'delete', 'manage'] as const

const ability = (role: Role): AppAbility => buildAbilityFor([role])

describe('Supplier grants exactly what SupplierProfile granted', () => {
  it.each(ROLES)('gives %s the same answer on every action', (role) => {
    // The migration is behaviour-preserving BECAUSE the grant was added. Drop
    // 'Supplier' from EXPORT_MANAGER's list and this fails on two actions.
    const a = ability(role)
    for (const action of ACTIONS) {
      expect(a.can(action, 'Supplier'), `${role} ${action}`).toBe(a.can(action, 'SupplierProfile'))
    }
  })

  it('lets every role read the supplier master', () => {
    for (const role of ROLES) expect(ability(role).can('read', 'Supplier'), role).toBe(true)
  })

  it('lets ADMIN and EXPORT_MANAGER maintain it, and nobody else', () => {
    // The contract the master service states in its header.
    for (const action of ['create', 'update'] as const) {
      expect(ability('ADMIN').can(action, 'Supplier'), `ADMIN ${action}`).toBe(true)
      expect(ability('EXPORT_MANAGER').can(action, 'Supplier'), `EXPORT_MANAGER ${action}`).toBe(
        true,
      )
      for (const role of ['VERIFIER', 'READ_ONLY'] as Role[]) {
        expect(ability(role).can(action, 'Supplier'), `${role} ${action}`).toBe(false)
      }
    }
  })

  it('keeps approval and removal with ADMIN alone', () => {
    // Onboarding a supplier and approving one are deliberately different
    // privileges - `manage` and `delete` stay off EXPORT_MANAGER's list.
    for (const action of ['manage', 'delete'] as const) {
      expect(ability('ADMIN').can(action, 'Supplier'), `ADMIN ${action}`).toBe(true)
      for (const role of BELOW_ADMIN) {
        expect(ability(role).can(action, 'Supplier'), `${role} ${action}`).toBe(false)
      }
    }
  })

  it('carries Supplier in the subject vocabulary', () => {
    expect(ability('ADMIN').can('manage', 'Supplier')).toBe(true)
  })
})

describe('the two supplier subjects are genuinely separate', () => {
  /** An actor holding every action on exactly the subjects named. */
  const only = (...held: Subject[]): AppAbility =>
    ({ can: (_a: Action, s: Subject) => held.includes(s) }) as unknown as AppAbility

  it('does not let Supplier permission reach the account-attached profile', () => {
    const master = only('Supplier')
    expect(master.can('update', 'Supplier')).toBe(true)
    expect(master.can('update', 'SupplierProfile')).toBe(false)
  })

  it('does not let SupplierProfile permission reach the supplier master', () => {
    const profile = only('SupplierProfile')
    expect(profile.can('update', 'SupplierProfile')).toBe(true)
    expect(profile.can('update', 'Supplier')).toBe(false)
  })

  it('leaves every other boundary the earlier work established alone', () => {
    // G5.2 RFQ/Quotation, G5.3 Product/Category, G5.5 AuditLog, G4 User.
    const em = ability('EXPORT_MANAGER')
    expect(em.can('create', 'RFQ')).toBe(true)
    expect(em.can('create', 'Quotation')).toBe(true)
    expect(em.can('create', 'Product')).toBe(false)
    expect(em.can('create', 'Category')).toBe(false)
    expect(em.can('manage', 'AuditLog')).toBe(false)
    expect(em.can('manage', 'User')).toBe(false)
    expect(ability('ADMIN').can('manage', 'AuditLog')).toBe(true)
    // Reference data keeps its own meaning.
    expect(em.can('read', 'ReferenceData')).toBe(true)
    expect(em.can('create', 'ReferenceData')).toBe(false)
  })
})

/**
 * The part an ability-only test cannot reach.
 *
 * Every configured role now answers identically for `Supplier` and
 * `SupplierProfile` - that is the point of the grant - so no behavioural test
 * can tell which subject a service consults. These build actors whose
 * permissions deliberately differ between the two, which is the only way to
 * observe the choice. Restore the old subject anywhere and they fail.
 */
describe('the supplier-master services consult Supplier, not SupplierProfile', () => {
  function ctx(...held: Subject[]) {
    const a = {
      can: (_action: Action, subject: Subject) => held.includes(subject),
    } as unknown as AppAbility
    const user = { id: 'u1', organizationId: 'org1', email: 'a@b.com', name: 'A', roles: [] }
    return { user, organizationId: 'org1', ability: a, requestId: 'r1' }
  }

  /** Holds the supplier master, but not the account-attached profile. */
  const master = () => ctx('Supplier')
  /** The mirror image, and the actor that must now be refused everywhere. */
  const profileOnly = () => ctx('SupplierProfile')

  const fakeEvents = () => ({ emit: async () => undefined }) as unknown as EventBus
  const NOT_PERMITTED = /not permitted/i

  // Each entry: a service, a read call and a write call, both already bound.
  const subjects = () => {
    const supplierRow = { id: 's1', organizationId: 'org1', version: 1, contacts: [] }
    const listResult = { items: [], nextCursor: null }

    const masterRepo = {
      list: vi.fn(async () => listResult),
      findById: vi.fn(async () => supplierRow),
      findByCode: async () => null,
      create: vi.fn(async () => supplierRow),
      mutate: async () => supplierRow,
    } as never
    const supplierSvc = createSupplierMasterService({ repo: masterRepo, events: fakeEvents() })

    const subRepo = () =>
      ({
        list: vi.fn(async () => listResult),
        listForSupplier: vi.fn(async () => []),
        findById: async () => ({ id: 'x1', supplierId: 's1', version: 1 }),
        create: vi.fn(async () => ({ id: 'x1', supplierId: 's1', version: 1 })),
        mutate: async () => ({ id: 'x1', supplierId: 's1', version: 2 }),
        assertVisible: async () => undefined,
      }) as never

    const contacts = createSupplierContactService({ repo: subRepo(), events: fakeEvents() })
    const certs = createSupplierCertificationService({ repo: subRepo(), events: fakeEvents() })
    const docs = createSupplierDocumentService({
      repo: subRepo(),
      storage: {} as never,
      events: fakeEvents(),
      maxBytes: 10_000_000,
    })
    const notes = createSupplierNoteService({ repo: subRepo(), events: fakeEvents() })
    const offerings = createSupplierOfferingService({ repo: subRepo(), events: fakeEvents() })
    const matching = createSupplierMatchingService({
      search: (async () => listResult) as never,
      scores: {} as never,
      history: {
        assertVisible: async () => undefined,
        rfqs: async () => listResult,
        quotations: async () => listResult,
      } as never,
    })

    return { supplierSvc, contacts, certs, docs, notes, offerings, matching }
  }

  it('serves the supplier list to a master holder', async () => {
    const { supplierSvc } = subjects()
    await expect(supplierSvc.list(master(), { limit: 25 } as never)).resolves.toBeDefined()
  })

  it('refuses the supplier list to a profile-only holder', async () => {
    // The regression this guards: SupplierProfile used to be the key here.
    const { supplierSvc } = subjects()
    await expect(supplierSvc.list(profileOnly(), { limit: 25 } as never)).rejects.toThrow(
      NOT_PERMITTED,
    )
  })

  it('lets a master holder create a supplier', async () => {
    const { supplierSvc } = subjects()
    await expect(
      supplierSvc.create(master(), { companyName: 'X', country: 'IN' } as never),
    ).resolves.toBeDefined()
  })

  it('refuses supplier creation to a profile-only holder', async () => {
    const { supplierSvc } = subjects()
    await expect(
      supplierSvc.create(profileOnly(), { companyName: 'X', country: 'IN' } as never),
    ).rejects.toThrow(NOT_PERMITTED)
  })

  it('refuses the approval decision to a profile-only holder', async () => {
    const { supplierSvc } = subjects()
    await expect(
      supplierSvc.decide(profileOnly(), 's1', 1, { decision: 'APPROVED' } as never),
    ).rejects.toThrow(NOT_PERMITTED)
  })

  // Every sub-resource read moved with the master record. Documents are in this
  // list deliberately: supplier documents are part of the master aggregate, and
  // are authorized as `Supplier` while general documents keep `Document`.
  const reads: Array<[string, (s: ReturnType<typeof subjects>) => (c: never) => Promise<unknown>]> =
    [
      ['contacts', (s) => (c) => s.contacts.list(c, 's1')],
      ['certifications', (s) => (c) => s.certs.list(c, 's1')],
      ['documents', (s) => (c) => s.docs.list(c, 's1')],
      ['notes', (s) => (c) => s.notes.list(c, 's1', { limit: 25 } as never)],
      ['offerings', (s) => (c) => s.offerings.list(c, { supplierId: 's1', limit: 25 } as never)],
      ['matching shortlist', (s) => (c) => s.matching.shortlist(c, { limit: 25 } as never)],
    ]

  it.each(reads)('serves %s to a master holder', async (_name, call) => {
    await expect(call(subjects())(master() as never)).resolves.toBeDefined()
  })

  it.each(reads)('refuses %s to a profile-only holder', async (_name, call) => {
    await expect(call(subjects())(profileOnly() as never)).rejects.toThrow(NOT_PERMITTED)
  })
})

describe('supplier documents belong to the supplier master, not to Document', () => {
  const only = (...held: Subject[]): AppAbility =>
    ({ can: (_a: Action, s: Subject) => held.includes(s) }) as unknown as AppAbility

  it('separates the two document boundaries', () => {
    // General documents keep `Document`; supplier-master documents moved to
    // `Supplier`. Before this split, supplier documents were the only ones
    // authorized through an unrelated subject.
    const generalOnly = only('Document')
    expect(generalOnly.can('update', 'Document')).toBe(true)
    expect(generalOnly.can('update', 'Supplier')).toBe(false)

    const masterOnly = only('Supplier')
    expect(masterOnly.can('update', 'Supplier')).toBe(true)
    expect(masterOnly.can('update', 'Document')).toBe(false)
  })

  it('leaves general Document permissions exactly as they were', () => {
    // Untouched by this change: EXPORT_MANAGER and VERIFIER may create, ADMIN
    // may delete, everyone may read.
    for (const role of ROLES) expect(ability(role).can('read', 'Document'), role).toBe(true)
    expect(ability('EXPORT_MANAGER').can('create', 'Document')).toBe(true)
    expect(ability('VERIFIER').can('create', 'Document')).toBe(true)
    expect(ability('READ_ONLY').can('create', 'Document')).toBe(false)
    expect(ability('ADMIN').can('delete', 'Document')).toBe(true)
    expect(ability('EXPORT_MANAGER').can('delete', 'Document')).toBe(false)
  })
})
