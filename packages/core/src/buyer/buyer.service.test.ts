import { buildAbilityFor, type Role } from '@triyara/auth'
import type { BuyerProfileRecord, BuyerProfileRepository } from '@triyara/db'
import type { DomainEvent, EventBus } from '@triyara/events'
import { beforeEach, describe, expect, it } from 'vitest'

import { type BuyerServiceCtx, createBuyerService } from './buyer.service'

function ctxFor(roles: Role[]): BuyerServiceCtx {
  const user = { id: 'u1', organizationId: 'org1', email: 'a@b.com', name: 'A', roles }
  return { user, organizationId: 'org1', ability: buildAbilityFor(roles), requestId: 'r1' }
}

function makeProfile(over: Partial<BuyerProfileRecord> = {}): BuyerProfileRecord {
  return {
    id: 'bp1',
    accountId: 'acc1',
    organizationId: 'org1',
    businessType: 'IMPORTER',
    annualRequirement: null,
    annualBudgetBand: null,
    importExperience: null,
    destinationCountries: [],
    destinationPort: null,
    incoterms: [],
    paymentTerms: [],
    certificationsRequired: [],
    languages: [],
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

function fakeRepo(over: Partial<BuyerProfileRepository> = {}): BuyerProfileRepository {
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

describe('buyer service', () => {
  let events: ReturnType<typeof spyBus>
  beforeEach(() => {
    events = spyBus()
  })

  it('READ_ONLY cannot create', async () => {
    const svc = createBuyerService({ repo: fakeRepo(), events: events.bus })
    await expect(svc.create(ctxFor(['READ_ONLY']), 'acc1', {})).rejects.toThrow()
  })

  it('EXPORT_MANAGER create emits buyer.created', async () => {
    const svc = createBuyerService({ repo: fakeRepo(), events: events.bus })
    await svc.create(ctxFor(['EXPORT_MANAGER']), 'acc1', { businessType: 'IMPORTER' })
    expect(events.emitted.map((e) => e.type)).toEqual(['buyer.created'])
  })

  it('addProduct emits buyer.capability_changed', async () => {
    const svc = createBuyerService({ repo: fakeRepo(), events: events.bus })
    await svc.addProduct(ctxFor(['EXPORT_MANAGER']), 'acc1', { product: 'Onion Powder' }, 1)
    expect(events.emitted.map((e) => e.type)).toEqual(['buyer.capability_changed'])
  })

  it('remove requires delete ability (manager denied, admin allowed)', async () => {
    const svc = createBuyerService({ repo: fakeRepo(), events: events.bus })
    await expect(svc.remove(ctxFor(['EXPORT_MANAGER']), 'acc1', 1)).rejects.toThrow()
    await expect(svc.remove(ctxFor(['ADMIN']), 'acc1', 1)).resolves.toBeTruthy()
  })

  it('get throws NotFound when absent', async () => {
    const svc = createBuyerService({
      repo: fakeRepo({ findByAccountId: async () => null }),
      events: events.bus,
    })
    await expect(svc.get(ctxFor(['ADMIN']), 'acc1')).rejects.toThrow(/not found/i)
  })
})
