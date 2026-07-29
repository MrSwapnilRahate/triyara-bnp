import { buildAbilityFor, type Role } from '@triyara/auth'
import type {
  CategoryRecord,
  CategoryRepository,
  ProductRecord,
  ProductRepository,
} from '@triyara/db'
import type { DomainEvent, EventBus } from '@triyara/events'
import { describe, expect, it } from 'vitest'

import { createCategoryService, slugify } from './category.service'
import { createProductService, type ProductServiceCtx } from './product.service'

function ctxFor(roles: Role[]): ProductServiceCtx {
  const user = { id: 'u1', organizationId: 'org1', email: 'a@b.com', name: 'A', roles }
  return { user, organizationId: 'org1', ability: buildAbilityFor(roles), requestId: 'r1' }
}

function makeCategory(over: Partial<CategoryRecord> = {}): CategoryRecord {
  return {
    id: 'cat1',
    organizationId: 'org1',
    parentId: null,
    name: 'Spices',
    slug: 'spices',
    description: null,
    path: '/spices',
    depth: 0,
    sortOrder: 0,
    isActive: true,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...over,
  }
}

function makeProduct(over: Partial<ProductRecord> = {}): ProductRecord {
  return {
    id: 'p1',
    organizationId: 'org1',
    sku: 'TRY-TUR-001',
    name: 'Turmeric Powder',
    slug: 'turmeric-powder',
    shortDescription: null,
    description: null,
    categoryId: 'cat1',
    countryOfOrigin: 'IN',
    brand: 'Triyara',
    hsCode: '09103020',
    status: 'DRAFT',
    isActive: true,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    category: { id: 'cat1', name: 'Spices', slug: 'spices', path: '/spices' },
    specifications: [],
    tags: [],
    ...over,
  } as ProductRecord
}

function fakeEvents(sink: DomainEvent[] = []): EventBus {
  return {
    emit: async (e: DomainEvent) => {
      sink.push(e)
    },
    subscribe: () => undefined,
  } as unknown as EventBus
}

function fakeProductRepo(over: Partial<ProductRepository> = {}): ProductRepository {
  return {
    create: async () => makeProduct(),
    findById: async () => makeProduct(),
    findBySku: async () => null,
    list: async () => ({ items: [], nextCursor: null }),
    mutate: async () => makeProduct({ version: 2 }),
    softDelete: async () => makeProduct({ deletedAt: new Date(), isActive: false, version: 2 }),
    restore: async () => makeProduct({ version: 3 }),
    ...over,
  } as ProductRepository
}

function fakeCategoryRepo(over: Partial<CategoryRepository> = {}): CategoryRepository {
  return {
    create: async () => makeCategory(),
    findById: async () => makeCategory(),
    findBySlug: async () => null,
    list: async () => ({ items: [makeCategory()], nextCursor: null }),
    mutate: async () => makeCategory({ version: 2 }),
    softDelete: async () => makeCategory({ deletedAt: new Date(), version: 2 }),
    restore: async () => makeCategory({ version: 3 }),
    ...over,
  } as CategoryRepository
}

describe('slugify', () => {
  it('produces url-safe slugs', () => {
    expect(slugify('Turmeric Powder')).toBe('turmeric-powder')
    expect(slugify('  Dehydrated  WHITE Onion!! ')).toBe('dehydrated-white-onion')
  })
})

describe('product service', () => {
  it('lets an ADMIN create a product and emits product.created', async () => {
    const sink: DomainEvent[] = []
    const svc = createProductService({ repo: fakeProductRepo(), events: fakeEvents(sink) })

    const product = await svc.create(ctxFor(['ADMIN']), {
      sku: 'TRY-TUR-001',
      name: 'Turmeric Powder',
      categoryId: 'cat1',
      status: 'DRAFT',
      isActive: true,
    })

    expect(product.sku).toBe('TRY-TUR-001')
    expect(sink.map((e) => e.type)).toContain('product.created')
  })

  it('refuses a write from a non-admin but allows the read', async () => {
    const svc = createProductService({ repo: fakeProductRepo(), events: fakeEvents() })

    await expect(
      svc.create(ctxFor(['EXPORT_MANAGER']), {
        sku: 'X',
        name: 'X',
        categoryId: 'cat1',
        status: 'DRAFT',
        isActive: true,
      }),
    ).rejects.toThrow(/not permitted/i)

    // Reading reference data is allowed for every role.
    await expect(svc.list(ctxFor(['READ_ONLY']), { limit: 25 })).resolves.toEqual({
      items: [],
      nextCursor: null,
    })
  })

  it('rejects a duplicate SKU', async () => {
    const svc = createProductService({
      repo: fakeProductRepo({ findBySku: async () => makeProduct() }),
      events: fakeEvents(),
    })

    await expect(
      svc.create(ctxFor(['ADMIN']), {
        sku: 'TRY-TUR-001',
        name: 'Dup',
        categoryId: 'cat1',
        status: 'DRAFT',
        isActive: true,
      }),
    ).rejects.toThrow(/already exists/i)
  })

  it('points at restore when the SKU belongs to a deleted product', async () => {
    const svc = createProductService({
      repo: fakeProductRepo({ findBySku: async () => makeProduct({ deletedAt: new Date() }) }),
      events: fakeEvents(),
    })

    await expect(
      svc.create(ctxFor(['ADMIN']), {
        sku: 'TRY-TUR-001',
        name: 'Dup',
        categoryId: 'cat1',
        status: 'DRAFT',
        isActive: true,
      }),
    ).rejects.toThrow(/restore it instead/i)
  })

  it('records a distinct audit action when specifications change', async () => {
    const seen: string[] = []
    const svc = createProductService({
      repo: fakeProductRepo({
        mutate: async (_c, _id, _v, _d, action) => {
          seen.push(action ?? 'product.updated')
          return makeProduct({ version: 2 })
        },
      }),
      events: fakeEvents(),
    })

    await svc.update(ctxFor(['ADMIN']), 'p1', 1, { name: 'Renamed' })
    await svc.update(ctxFor(['ADMIN']), 'p1', 2, {
      specifications: [{ definitionId: 'd1', value: '8' }],
    })

    expect(seen).toEqual(['product.updated', 'product.specifications_changed'])
  })
})

describe('category service', () => {
  it('derives a slug from the name when none is supplied', async () => {
    let captured = ''
    const svc = createCategoryService({
      repo: fakeCategoryRepo({
        create: async (_c, data) => {
          captured = data.slug
          return makeCategory({ slug: data.slug })
        },
      }),
      events: fakeEvents(),
    })

    await svc.create(ctxFor(['ADMIN']), { name: 'Whole Spices', sortOrder: 0, isActive: true })
    expect(captured).toBe('whole-spices')
  })

  it('rejects a duplicate slug', async () => {
    const svc = createCategoryService({
      repo: fakeCategoryRepo({ findBySlug: async () => makeCategory() }),
      events: fakeEvents(),
    })

    await expect(
      svc.create(ctxFor(['ADMIN']), { name: 'Spices', sortOrder: 0, isActive: true }),
    ).rejects.toThrow(/already exists/i)
  })

  it('refuses category writes from a non-admin', async () => {
    const svc = createCategoryService({ repo: fakeCategoryRepo(), events: fakeEvents() })
    await expect(
      svc.create(ctxFor(['VERIFIER']), { name: 'Spices', sortOrder: 0, isActive: true }),
    ).rejects.toThrow(/not permitted/i)
  })
})
