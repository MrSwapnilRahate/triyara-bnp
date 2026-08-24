import {
  type Action,
  type AppAbility,
  buildAbilityFor,
  type Role,
  type Subject,
} from '@triyara/auth'
import type { EventBus } from '@triyara/events'
import { describe, expect, it, vi } from 'vitest'

import { createCategoryService } from './catalog/category.service'
import { createProductService } from './catalog/product.service'
import { createQuotationService } from './quotation/quotation.service'
import { createRfqService } from './rfq/rfq.service'
import { createSupplierMasterService } from './supplier-management/supplier.service'

/**
 * Who may put a soft-deleted record back.
 *
 * Every one of these services has implemented `restore` since it was written,
 * and none of them could be reached: there was no route and no hook, so the
 * capability existed only as code. Wiring it up makes the authorization it
 * already carries load-bearing for the first time, which is what these pin.
 *
 * The contract is NOT uniform, and that is deliberate:
 *
 *   RFQ, Supplier      restore -> `update`   ADMIN + EXPORTER
 *   Product, Category  restore -> `update`   ADMIN only, because the catalogue
 *                                            is readable by all and writable by
 *                                            ADMIN alone
 *   Quotation          restore -> `manage`   ADMIN only, stricter on purpose -
 *                                            a quotation a buyer has seen is a
 *                                            record, so restoring one is an
 *                                            administrative act, not an edit
 *
 * No ability grant was changed to make any of this work.
 */

const ROLES: Role[] = ['ADMIN', 'EXPORTER', 'VERIFIER', 'READ_ONLY']
const fakeEvents = () => ({ emit: async () => undefined }) as unknown as EventBus
const NOT_PERMITTED = /not permitted/i

function ctxFor(roles: Role[]) {
  const user = { id: 'u1', organizationId: 'org1', email: 'a@b.com', name: 'A', roles }
  return { user, organizationId: 'org1', ability: buildAbilityFor(roles), requestId: 'r1' }
}

/** A record shaped enough for the restore path; the repo is a stub throughout. */
const restored = (over: Record<string, unknown> = {}) => ({
  id: 'x1',
  organizationId: 'org1',
  version: 2,
  deletedAt: null,
  items: [],
  ...over,
})

/** The stub every service gets; `restore` is a spy so refusals can be proved. */
interface RestoreRepo {
  restore: ReturnType<typeof vi.fn>
  findById: () => Promise<Record<string, unknown>>
  softDelete: () => Promise<Record<string, unknown>>
}

function services() {
  const repo = (): RestoreRepo => ({
    restore: vi.fn(async () => restored()),
    findById: async () => restored({ deletedAt: new Date() }),
    softDelete: async () => restored({ deletedAt: new Date() }),
  })

  const rfqRepo = repo()
  const quotationRepo = repo()
  const productRepo = repo()
  const categoryRepo = repo()
  const supplierRepo = repo()

  return {
    rfqRepo,
    quotationRepo,
    productRepo,
    categoryRepo,
    supplierRepo,
    rfq: createRfqService({ repo: rfqRepo as never, events: fakeEvents() }),
    quotation: createQuotationService({
      repo: quotationRepo as never,
      sourcing: {} as never,
      reference: {} as never,
      events: fakeEvents(),
    } as never),
    product: createProductService({ repo: productRepo as never, events: fakeEvents() }),
    category: createCategoryService({ repo: categoryRepo as never, events: fakeEvents() }),
    supplier: createSupplierMasterService({ repo: supplierRepo as never, events: fakeEvents() }),
  }
}

/** domain -> [who may restore, the call] */
const CASES = [
  {
    name: 'RFQ',
    allowed: ['ADMIN', 'EXPORTER'] as Role[],
    call: (s: ReturnType<typeof services>, c: never) => s.rfq.restore(c, 'x1', 1),
    repo: (s: ReturnType<typeof services>) => s.rfqRepo,
  },
  {
    name: 'Supplier',
    allowed: ['ADMIN', 'EXPORTER'] as Role[],
    call: (s: ReturnType<typeof services>, c: never) => s.supplier.restore(c, 'x1', 1),
    repo: (s: ReturnType<typeof services>) => s.supplierRepo,
  },
  {
    name: 'Product',
    allowed: ['ADMIN'] as Role[],
    call: (s: ReturnType<typeof services>, c: never) => s.product.restore(c, 'x1', 1),
    repo: (s: ReturnType<typeof services>) => s.productRepo,
  },
  {
    name: 'Category',
    allowed: ['ADMIN'] as Role[],
    call: (s: ReturnType<typeof services>, c: never) => s.category.restore(c, 'x1', 1),
    repo: (s: ReturnType<typeof services>) => s.categoryRepo,
  },
  {
    name: 'Quotation',
    allowed: ['ADMIN'] as Role[],
    call: (s: ReturnType<typeof services>, c: never) => s.quotation.restore(c, 'x1', 1),
    repo: (s: ReturnType<typeof services>) => s.quotationRepo,
  },
] as const

describe.each(CASES)('$name restore', ({ allowed, call, repo }) => {
  it.each(ROLES)('%s', async (role) => {
    const s = services()
    const may = allowed.includes(role)
    const promise = call(s, ctxFor([role]) as never)

    if (may) {
      await expect(promise).resolves.toBeDefined()
      expect(repo(s).restore).toHaveBeenCalled()
    } else {
      await expect(promise).rejects.toThrow(NOT_PERMITTED)
      // Refused before the write, not after: a denied caller must leave no trace.
      expect(repo(s).restore).not.toHaveBeenCalled()
    }
  })

  it('treats a super admin as an ADMIN', async () => {
    // Super Admin is an email allowlist, not an ability role, so it reaches
    // restore by holding ADMIN. Nothing here adds a second path.
    const s = services()
    const ctx = {
      ...ctxFor(['ADMIN']),
      user: { ...ctxFor(['ADMIN']).user, email: 'swapnilrahate6598@gmail.com' },
    }
    await expect(call(s, ctx as never)).resolves.toBeDefined()
  })
})

describe('the restore contract is not uniform, and that is deliberate', () => {
  it('lets EXPORTER restore an RFQ and a supplier, but not the catalogue', () => {
    const em = buildAbilityFor(['EXPORTER'])
    expect(em.can('update', 'RFQ')).toBe(true)
    expect(em.can('update', 'Supplier')).toBe(true)
    expect(em.can('update', 'Product')).toBe(false)
    expect(em.can('update', 'Category')).toBe(false)
  })

  it('keeps quotation restore above the rest', () => {
    // `manage`, not `update` - the one domain where restoring is an
    // administrative act rather than an edit.
    const em = buildAbilityFor(['EXPORTER'])
    expect(em.can('update', 'Quotation')).toBe(true)
    expect(em.can('manage', 'Quotation')).toBe(false)
    expect(buildAbilityFor(['ADMIN']).can('manage', 'Quotation')).toBe(true)
  })

  it('did not widen any grant to make restore reachable', () => {
    // The whole point: wiring exposed an existing boundary, it did not move
    // one. VERIFIER and READ_ONLY write nothing, anywhere.
    for (const role of ['VERIFIER', 'READ_ONLY'] as Role[]) {
      const a = buildAbilityFor([role])
      for (const s of ['RFQ', 'Quotation', 'Product', 'Category', 'Supplier'] as Subject[]) {
        expect(a.can('update', s), `${role} update ${s}`).toBe(false)
        expect(a.can('manage', s), `${role} manage ${s}`).toBe(false)
      }
    }
  })
})

describe('each service asks about its own subject', () => {
  /** An actor holding every action on exactly the subjects named. */
  const only = (...held: Subject[]) => {
    const ability = {
      can: (_a: Action, s: Subject) => held.includes(s),
    } as unknown as AppAbility
    const user = { id: 'u1', organizationId: 'org1', email: 'a@b.com', name: 'A', roles: [] }
    return { user, organizationId: 'org1', ability, requestId: 'r1' }
  }

  it.each(CASES)('$name refuses an actor holding only another domain', async ({ name, call }) => {
    // Cross-wiring check: every configured role answers the same across these
    // five subjects for `update`, so only a hand-built actor can show that each
    // service consults its own.
    const other: Subject = name === 'RFQ' ? 'Quotation' : 'RFQ'
    await expect(call(services(), only(other) as never)).rejects.toThrow(NOT_PERMITTED)
  })
})
