import { buildAbilityFor, type Role } from '@triyara/auth'
import type { SupplierProfileRecord, SupplierProfileRepository } from '@triyara/db'
import type { DomainEvent, EventBus } from '@triyara/events'
import { beforeEach, describe, expect, it } from 'vitest'

import { createSupplierService, type SupplierServiceCtx } from './supplier.service'

function ctxFor(roles: Role[]): SupplierServiceCtx {
  const user = { id: 'u1', organizationId: 'org1', email: 'a@b.com', name: 'A', roles }
  return { user, organizationId: 'org1', ability: buildAbilityFor(roles), requestId: 'r1' }
}

function makeProfile(over: Partial<SupplierProfileRecord> = {}): SupplierProfileRecord {
  return {
    id: 'sp1',
    accountId: 'acc1',
    organizationId: 'org1',
    manufacturingType: 'MANUFACTURER',
    businessType: null,
    factorySizeSqm: null,
    employees: null,
    productionCapacity: null,
    annualTurnoverBand: null,
    exportExperienceYears: null,
    primaryMarkets: [],
    exportCountries: [],
    languages: [],
    incoterms: [],
    paymentTerms: [],
    supportedDocuments: [],
    certifications: [],
    leadTimeDays: null,
    moq: null,
    packaging: null,
    oem: false,
    odm: false,
    privateLabel: false,
    website: null,
    socialLinks: null,
    description: null,
    version: 1,
    createdById: 'u1',
    updatedById: 'u1',
    deletedById: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    products: [],
    ...over,
  }
}

function fakeRepo(over: Partial<SupplierProfileRepository> = {}): SupplierProfileRepository {
  return {
    create: async () => makeProfile(),
    findByAccountId: async () => makeProfile(),
    mutate: async () => makeProfile({ version: 2 }),
    softDelete: async () => makeProfile({ deletedAt: new Date() }),
    restore: async () => makeProfile(),
    addProduct: async () => makeProfile(),
    removeProduct: async () => makeProfile(),
    ...over,
  }
}

function spyBus() {
  const emitted: DomainEvent[] = []
  const bus: EventBus = { emit: async (e) => void emitted.push(e as DomainEvent) }
  return { bus, emitted }
}

describe('supplier service', () => {
  let events: ReturnType<typeof spyBus>
  beforeEach(() => {
    events = spyBus()
  })

  it('READ_ONLY cannot create', async () => {
    const svc = createSupplierService({ repo: fakeRepo(), events: events.bus })
    await expect(svc.create(ctxFor(['READ_ONLY']), 'acc1', {})).rejects.toThrow()
  })

  it('EXPORT_MANAGER create emits supplier.created', async () => {
    const svc = createSupplierService({ repo: fakeRepo(), events: events.bus })
    await svc.create(ctxFor(['EXPORT_MANAGER']), 'acc1', { manufacturingType: 'MANUFACTURER' })
    expect(events.emitted.map((e) => e.type)).toEqual(['supplier.created'])
  })

  it('addProduct emits supplier.capability_changed', async () => {
    const svc = createSupplierService({ repo: fakeRepo(), events: events.bus })
    await svc.addProduct(ctxFor(['EXPORT_MANAGER']), 'acc1', { product: 'Onion Powder' }, 1)
    expect(events.emitted.map((e) => e.type)).toEqual(['supplier.capability_changed'])
  })

  it('remove requires delete ability (EXPORT_MANAGER denied, ADMIN allowed)', async () => {
    const svc = createSupplierService({ repo: fakeRepo(), events: events.bus })
    await expect(svc.remove(ctxFor(['EXPORT_MANAGER']), 'acc1', 1)).rejects.toThrow()
    await expect(svc.remove(ctxFor(['ADMIN']), 'acc1', 1)).resolves.toBeTruthy()
  })

  it('get throws NotFound when absent', async () => {
    const svc = createSupplierService({
      repo: fakeRepo({ findByAccountId: async () => null }),
      events: events.bus,
    })
    await expect(svc.get(ctxFor(['ADMIN']), 'acc1')).rejects.toThrow(/not found/i)
  })
})
