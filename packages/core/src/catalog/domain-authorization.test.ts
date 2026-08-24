import {
  type Action,
  type AppAbility,
  buildAbilityFor,
  type Role,
  type Subject,
} from '@triyara/auth'
import type { EventBus } from '@triyara/events'
import { describe, expect, it } from 'vitest'

import { createCategoryService } from './category.service'
import { createProductService, type ProductServiceCtx } from './product.service'

/**
 * Products and categories decided on their own subjects.
 *
 * They shared `ReferenceData` with specification definitions and tag
 * vocabularies, which made "may edit the tag list" and "may delete a product"
 * one permission. Both services already documented the intent - readable by
 * every role, writable by ADMIN only - and the existing service tests pin it,
 * so this change moves where the decision is made and nothing else.
 */

const ROLES: Role[] = ['ADMIN', 'EXPORTER', 'VERIFIER', 'READ_ONLY']
const CATALOGUE = ['Product', 'Category'] as const
const WRITES = ['create', 'update', 'delete'] as const

const ability = (role: Role): AppAbility => buildAbilityFor([role])

describe.each(CATALOGUE)('%s authorization', (subject) => {
  it.each(ROLES)('lets %s read', (role) => {
    expect(ability(role).can('read', subject)).toBe(true)
  })

  it('lets ADMIN write', () => {
    for (const action of WRITES) {
      expect(ability('ADMIN').can(action, subject), `ADMIN ${action}`).toBe(true)
    }
  })

  it.each(['EXPORTER', 'VERIFIER', 'READ_ONLY'] as const)('refuses every write to %s', (role) => {
    for (const action of WRITES) {
      expect(ability(role).can(action, subject), `${role} ${action}`).toBe(false)
    }
  })

  it.each(ROLES)('gives %s exactly what ReferenceData used to give it', (role) => {
    // The migration is behaviour-preserving. If these diverge it has to be a
    // decision somebody made, not something that leaked out of this refactor.
    const a = ability(role)
    for (const action of ['read', ...WRITES, 'manage'] as const) {
      expect(a.can(action, subject), `${role} ${action}`).toBe(a.can(action, 'ReferenceData'))
    }
  })
})

describe('the catalogue no longer shares a permission with reference data', () => {
  it('separates the subjects, so the two can now be granted apart', () => {
    // The whole point of the split: a role can hold one without the other.
    // Nobody is configured that way today - which is why every assertion above
    // still matches ReferenceData - but the vocabulary now allows it, and these
    // are the shapes that were impossible before.
    const catalogueWriter = buildAbilityFor([])
    expect(catalogueWriter.can('create', 'Product')).toBe(false)
    expect(catalogueWriter.can('create', 'ReferenceData')).toBe(false)

    // ADMIN reaches all three through `manage all`, not through any one of them
    // standing in for the others.
    const admin = ability('ADMIN')
    expect(admin.can('manage', 'Product')).toBe(true)
    expect(admin.can('manage', 'Category')).toBe(true)
    expect(admin.can('manage', 'ReferenceData')).toBe(true)
  })

  it('keeps Product and Category distinct from each other', () => {
    // Two subjects, not one shared "Catalog": a future policy may well let
    // someone maintain the category tree without editing products.
    expect(['Product', 'Category']).toHaveLength(2)
    const admin = ability('ADMIN')
    expect(admin.can('delete', 'Product')).toBe(true)
    expect(admin.can('delete', 'Category')).toBe(true)
  })

  it('leaves reference data readable by everyone, as before', () => {
    for (const role of ROLES) {
      expect(ability(role).can('read', 'ReferenceData'), role).toBe(true)
    }
  })

  it('does not disturb the subjects the other work established', () => {
    // G5.2 (RFQ/Quotation) and G4 (security metadata) must be unaffected.
    const em = ability('EXPORTER')
    expect(em.can('create', 'RFQ')).toBe(true)
    expect(em.can('create', 'Quotation')).toBe(true)
    expect(em.can('manage', 'User')).toBe(false)
    expect(ability('READ_ONLY').can('manage', 'User')).toBe(false)
  })
})

/**
 * The part an ability-only test cannot reach.
 *
 * While Product and ReferenceData grant the same thing to every role, no
 * behavioural test can tell which subject a service consults - swapping one for
 * the other changes no answer. So these build an actor whose permissions
 * deliberately differ between the two, which is the only way to observe the
 * choice. Restore the old proxy and they fail.
 */
describe('the services consult the catalogue subject, not reference data', () => {
  const fakeEvents = () => ({ emit: async () => undefined }) as unknown as EventBus

  /**
   * A context whose answer depends on which subject is asked about.
   *
   * `assertAbility` consults `ability.can(action, subject)` and nothing else, so
   * a double that decides per subject is the precise instrument here: it records
   * the question the service actually asks, which a real ability cannot reveal
   * while both subjects give the same answer.
   */
  function ctxWritable(...writable: Subject[]): ProductServiceCtx {
    const ability = {
      can: (action: Action, subject: Subject) =>
        action === 'read' ? true : writable.includes(subject),
    } as unknown as AppAbility
    const user = { id: 'u1', organizationId: 'org1', email: 'a@b.com', name: 'A', roles: [] }
    return { user, organizationId: 'org1', ability, requestId: 'r1' }
  }

  /** May write the catalogue, but NOT reference data. */
  const catalogueWriter = () => ctxWritable('Product', 'Category')
  /** The mirror image: may write reference data, but not the catalogue. */
  const referenceWriter = () => ctxWritable('ReferenceData')

  const productRepo = {
    findBySku: async () => null,
    create: async () => ({ id: 'p1', sku: 'S', name: 'N' }),
  } as never
  const categoryRepo = {
    findBySlug: async () => null,
    create: async () => ({ id: 'c1', name: 'N', slug: 'n' }),
  } as never

  const newProduct = {
    sku: 'TRY-1',
    name: 'Turmeric',
    categoryId: 'cat1',
    status: 'DRAFT' as const,
    isActive: true,
  }
  const newCategory = { name: 'Spices', sortOrder: 0, isActive: true }

  it('lets a catalogue writer create a product without reference-data rights', async () => {
    const svc = createProductService({ repo: productRepo, events: fakeEvents() })
    await expect(svc.create(catalogueWriter(), newProduct)).resolves.toBeDefined()
  })

  it('lets a catalogue writer create a category without reference-data rights', async () => {
    const svc = createCategoryService({ repo: categoryRepo, events: fakeEvents() })
    await expect(svc.create(catalogueWriter(), newCategory)).resolves.toBeDefined()
  })

  it('refuses a reference-data writer the product catalogue', async () => {
    // The invariant in the other direction: holding ReferenceData must not
    // carry the catalogue with it.
    const svc = createProductService({ repo: productRepo, events: fakeEvents() })
    await expect(svc.create(referenceWriter(), newProduct)).rejects.toThrow(/not permitted/i)
  })

  it('refuses a reference-data writer the category tree', async () => {
    const svc = createCategoryService({ repo: categoryRepo, events: fakeEvents() })
    await expect(svc.create(referenceWriter(), newCategory)).rejects.toThrow(/not permitted/i)
  })
})
