import { buildAbilityFor, type Role } from '@triyara/auth'
import type { ProductCategoryRepository, ProductRecord, ProductRepository } from '@triyara/db'
import type { DomainEvent, EventBus } from '@triyara/events'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  createProductService,
  type ProductServiceCtx,
  type ReferenceValidator,
} from './product.service'

function ctxFor(roles: Role[]): ProductServiceCtx {
  const user = { id: 'u1', organizationId: 'org1', email: 'a@b.com', name: 'A', roles }
  return { user, organizationId: 'org1', ability: buildAbilityFor(roles), requestId: 'r1' }
}

function makeProduct(over: Partial<ProductRecord> = {}): ProductRecord {
  return {
    id: 'p1',
    organizationId: 'org1',
    sku: 'SKU-1',
    slug: 'onion-powder',
    name: 'Onion Powder',
    shortDescription: null,
    description: null,
    status: 'DRAFT',
    isActive: true,
    categoryId: null,
    hsCodeId: null,
    originCountryId: null,
    defaultUnitId: null,
    version: 1,
    deletedAt: null,
    createdById: 'u1',
    updatedById: 'u1',
    createdAt: new Date(),
    updatedAt: new Date(),
    category: null,
    hsCode: null,
    originCountry: null,
    defaultUnit: null,
    attributes: [],
    packaging: [],
    ...over,
  }
}

function fakeRepo(over: Partial<ProductRepository> = {}): ProductRepository {
  return {
    create: async () => makeProduct(),
    findById: async () => makeProduct(),
    findBySku: async () => null,
    findBySlug: async () => null,
    list: async () => ({ items: [], nextCursor: null, hasMore: false }),
    mutate: async () => makeProduct({ version: 2 }),
    softDelete: async () => makeProduct({ deletedAt: new Date() }),
    restore: async () => makeProduct(),
    ...over,
  }
}

const categories: Pick<ProductCategoryRepository, 'findById'> = {
  findById: async (_o, id) => ({
    id,
    organizationId: 'org1',
    parentId: null,
    name: 'Cat',
    slug: 'cat',
    displayOrder: 0,
    isActive: true,
    version: 1,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
}

function reference(over: Partial<ReferenceValidator> = {}): ReferenceValidator {
  return {
    countRefs: async (_o, _t, ids) => ids.length,
    attributeIds: async (_o, ids) => ids.map((id) => ({ id, dataType: 'STRING' as const })),
    ...over,
  }
}

function spyBus() {
  const emitted: DomainEvent[] = []
  const bus: EventBus = { emit: async (e) => void emitted.push(e as DomainEvent) }
  return { bus, emitted }
}

describe('product service', () => {
  let events: ReturnType<typeof spyBus>
  beforeEach(() => {
    events = spyBus()
  })
  const svc = (r = fakeRepo(), ref = reference()) =>
    createProductService({ repo: r, categories, reference: ref, events: events.bus })

  it('only ADMIN can create (manager/read-only denied)', async () => {
    await expect(svc().create(ctxFor(['READ_ONLY']), { sku: 'S1', name: 'X' })).rejects.toThrow()
    await expect(
      svc().create(ctxFor(['EXPORT_MANAGER']), { sku: 'S1', name: 'X' }),
    ).rejects.toThrow()
    await expect(svc().create(ctxFor(['ADMIN']), { sku: 'S1', name: 'X' })).resolves.toBeTruthy()
  })

  it('everyone can read/list', async () => {
    await expect(svc().list(ctxFor(['READ_ONLY']), { limit: 25 })).resolves.toBeTruthy()
  })

  it('rejects a duplicate SKU', async () => {
    await expect(
      svc(fakeRepo({ findBySku: async () => ({ id: 'other' }) })).create(ctxFor(['ADMIN']), {
        sku: 'S1',
        name: 'X',
      }),
    ).rejects.toThrow(/SKU/i)
  })

  it('rejects an unknown category', async () => {
    const cats: Pick<ProductCategoryRepository, 'findById'> = { findById: async () => null }
    const s = createProductService({
      repo: fakeRepo(),
      categories: cats,
      reference: reference(),
      events: events.bus,
    })
    await expect(
      s.create(ctxFor(['ADMIN']), { sku: 'S1', name: 'X', categoryId: 'missing' }),
    ).rejects.toThrow(/category/i)
  })

  it('validates numeric attribute values', async () => {
    const ref = reference({
      attributeIds: async (_o, ids) => ids.map((id) => ({ id, dataType: 'NUMBER' as const })),
    })
    await expect(
      svc(fakeRepo(), ref).create(ctxFor(['ADMIN']), {
        sku: 'S1',
        name: 'X',
        attributes: [{ attributeId: 'a1', value: 'not-a-number' }],
      }),
    ).rejects.toThrow(/numeric/i)
    await expect(
      svc(fakeRepo(), ref).create(ctxFor(['ADMIN']), {
        sku: 'S1',
        name: 'X',
        attributes: [{ attributeId: 'a1', value: '5.2' }],
      }),
    ).resolves.toBeTruthy()
  })

  it('create emits product.created; attribute update emits product.attribute_changed', async () => {
    await svc().create(ctxFor(['ADMIN']), { sku: 'S1', name: 'X' })
    expect(events.emitted.map((e) => e.type)).toContain('product.created')
    events.emitted.length = 0
    await svc().update(ctxFor(['ADMIN']), 'p1', { attributes: [] }, 1)
    expect(events.emitted.map((e) => e.type)).toContain('product.attribute_changed')
  })
})
