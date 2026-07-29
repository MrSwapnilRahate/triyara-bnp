import { beforeAll, describe, expect, it } from 'vitest'

import { prisma } from '../client'
import { categoryRepository } from './category.repository'
import { productRepository } from './product.repository'

// Repository behaviour for the Product Catalog (TRY-BNP-CATALOG-S1) against a
// real database.
describe.skipIf(!process.env.DATABASE_URL)('catalog repositories (integration)', () => {
  let organizationId = ''
  let ctx = { actorId: '', organizationId: '', requestId: 'cat-it' }
  let rootId = ''
  let definitionId = ''
  let tagId = ''

  const uniq = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

  beforeAll(async () => {
    const org = await prisma.organization.upsert({
      where: { slug: 'catalog-repo-itest' },
      update: {},
      create: { name: 'Catalog Repo IT', slug: 'catalog-repo-itest' },
    })
    organizationId = org.id

    const user = await prisma.user.upsert({
      where: { email: 'catalog-repo@triyara.test' },
      update: {},
      create: {
        organizationId,
        email: 'catalog-repo@triyara.test',
        name: 'IT',
        passwordHash: 'x',
      },
    })
    ctx = { actorId: user.id, organizationId, requestId: 'cat-it' }

    const def = await prisma.productSpecificationDefinition.upsert({
      where: { organizationId_slug: { organizationId, slug: 'repo-moisture' } },
      update: {},
      create: {
        organizationId,
        name: 'Moisture',
        slug: 'repo-moisture',
        unit: '%',
        dataType: 'NUMBER',
        isFilterable: true,
      },
    })
    definitionId = def.id

    const tag = await prisma.tag.upsert({
      where: { organizationId_slug: { organizationId, slug: 'repo-premium' } },
      update: {},
      create: { organizationId, name: 'Premium', slug: 'repo-premium' },
    })
    tagId = tag.id

    const root = await categoryRepository.create(ctx, { name: 'Root', slug: `root-${uniq()}` })
    rootId = root.id
  })

  it('derives path and depth from the parent', async () => {
    const child = await categoryRepository.create(ctx, {
      name: 'Child',
      slug: `child-${uniq()}`,
      parentId: rootId,
    })
    const root = await categoryRepository.findById(organizationId, rootId)

    expect(child.depth).toBe(1)
    expect(child.path).toBe(`${root!.path}/${child.slug}`)
  })

  it('rewrites the whole subtree when a category is moved', async () => {
    const a = await categoryRepository.create(ctx, { name: 'A', slug: `a-${uniq()}` })
    const b = await categoryRepository.create(ctx, {
      name: 'B',
      slug: `b-${uniq()}`,
      parentId: a.id,
    })
    const c = await categoryRepository.create(ctx, {
      name: 'C',
      slug: `c-${uniq()}`,
      parentId: b.id,
    })
    const newHome = await categoryRepository.create(ctx, { name: 'Home', slug: `home-${uniq()}` })

    expect(c.depth).toBe(2)

    // Move A under Home; B and C must follow.
    await categoryRepository.mutate(ctx, a.id, a.version, { parentId: newHome.id })

    const movedA = await categoryRepository.findById(organizationId, a.id)
    const movedB = await categoryRepository.findById(organizationId, b.id)
    const movedC = await categoryRepository.findById(organizationId, c.id)

    expect(movedA!.path).toBe(`${newHome.path}/${a.slug}`)
    expect(movedB!.path).toBe(`${movedA!.path}/${b.slug}`)
    expect(movedC!.path).toBe(`${movedB!.path}/${c.slug}`)
    expect(movedC!.depth).toBe(3)
  })

  it('refuses to move a category beneath its own descendant', async () => {
    const p = await categoryRepository.create(ctx, { name: 'P', slug: `p-${uniq()}` })
    const q = await categoryRepository.create(ctx, {
      name: 'Q',
      slug: `q-${uniq()}`,
      parentId: p.id,
    })

    await expect(
      categoryRepository.mutate(ctx, p.id, p.version, { parentId: q.id }),
    ).rejects.toThrow(/descendant/i)
  })

  it('enforces optimistic concurrency on update', async () => {
    const cat = await categoryRepository.create(ctx, { name: 'V', slug: `v-${uniq()}` })
    await categoryRepository.mutate(ctx, cat.id, cat.version, { name: 'V2' })
    // Stale version -> 412.
    await expect(
      categoryRepository.mutate(ctx, cat.id, cat.version, { name: 'V3' }),
    ).rejects.toThrow()
  })

  it('blocks deleting a category that still holds products', async () => {
    const cat = await categoryRepository.create(ctx, { name: 'Held', slug: `held-${uniq()}` })
    const product = await productRepository.create(ctx, {
      sku: `SKU-${uniq()}`,
      name: 'Held Product',
      slug: `held-product-${uniq()}`,
      categoryId: cat.id,
    })

    const fresh = await categoryRepository.findById(organizationId, cat.id)
    await expect(categoryRepository.softDelete(ctx, cat.id, fresh!.version)).rejects.toThrow(
      /reassign the products/i,
    )

    await productRepository.softDelete(ctx, product.id, product.version)
  })

  it('creates a product with specifications and tags, and writes audit', async () => {
    const sku = `SKU-${uniq()}`
    const product = await productRepository.create(ctx, {
      sku,
      name: 'Turmeric Powder',
      slug: `turmeric-${uniq()}`,
      categoryId: rootId,
      brand: 'Triyara',
      hsCode: '09103020',
      countryOfOrigin: 'IN',
      specifications: [{ definitionId, value: '8' }],
      tagIds: [tagId],
    })

    expect(product.specifications).toHaveLength(1)
    // NUMBER definitions get the typed projection populated.
    expect(Number(product.specifications[0]!.valueNumber)).toBe(8)
    expect(product.tags).toHaveLength(1)

    const audits = await prisma.auditLog.count({
      where: { organizationId, entityType: 'Product', entityId: product.id },
    })
    expect(audits).toBeGreaterThanOrEqual(1)
  })

  it('rejects an unknown specification definition', async () => {
    await expect(
      productRepository.create(ctx, {
        sku: `SKU-${uniq()}`,
        name: 'Bad Spec',
        slug: `bad-spec-${uniq()}`,
        categoryId: rootId,
        specifications: [{ definitionId: 'does-not-exist', value: '1' }],
      }),
    ).rejects.toThrow(/unknown specification definition/i)
  })

  it('replaces specifications and tags wholesale on update', async () => {
    const product = await productRepository.create(ctx, {
      sku: `SKU-${uniq()}`,
      name: 'Replaceable',
      slug: `replaceable-${uniq()}`,
      categoryId: rootId,
      specifications: [{ definitionId, value: '5' }],
      tagIds: [tagId],
    })

    const updated = await productRepository.mutate(ctx, product.id, product.version, {
      specifications: [],
      tagIds: [],
    })

    expect(updated.specifications).toHaveLength(0)
    expect(updated.tags).toHaveLength(0)
    expect(updated.version).toBe(2)
  })

  it('soft-deletes, keeps the SKU reserved, and restores', async () => {
    const sku = `SKU-${uniq()}`
    const product = await productRepository.create(ctx, {
      sku,
      name: 'Deletable',
      slug: `deletable-${uniq()}`,
      categoryId: rootId,
    })

    const deleted = await productRepository.softDelete(ctx, product.id, product.version)
    expect(deleted.deletedAt).not.toBeNull()
    expect(deleted.isActive).toBe(false)

    // The SKU is still taken - restore, never recreate.
    await expect(
      productRepository.create(ctx, {
        sku,
        name: 'Recreated',
        slug: `recreated-${uniq()}`,
        categoryId: rootId,
      }),
    ).rejects.toThrow(/already exists/i)

    const restored = await productRepository.restore(ctx, product.id, deleted.version)
    expect(restored.deletedAt).toBeNull()
    expect(restored.isActive).toBe(true)
  })

  it('filters a list by category subtree and excludes deleted rows', async () => {
    const branch = await categoryRepository.create(ctx, {
      name: 'Branch',
      slug: `branch-${uniq()}`,
      parentId: rootId,
    })
    const kept = await productRepository.create(ctx, {
      sku: `SKU-${uniq()}`,
      name: 'Kept',
      slug: `kept-${uniq()}`,
      categoryId: branch.id,
    })
    const gone = await productRepository.create(ctx, {
      sku: `SKU-${uniq()}`,
      name: 'Gone',
      slug: `gone-${uniq()}`,
      categoryId: branch.id,
    })
    await productRepository.softDelete(ctx, gone.id, gone.version)

    const listed = await productRepository.list({
      organizationId,
      categoryPathPrefix: branch.path,
      limit: 50,
    })
    const ids = listed.items.map((p) => p.id)
    expect(ids).toContain(kept.id)
    expect(ids).not.toContain(gone.id)

    const withDeleted = await productRepository.list({
      organizationId,
      categoryPathPrefix: branch.path,
      includeDeleted: true,
      limit: 50,
    })
    expect(withDeleted.items.map((p) => p.id)).toContain(gone.id)
  })

  it('paginates by cursor without repeating rows', async () => {
    const cat = await categoryRepository.create(ctx, { name: 'Paged', slug: `paged-${uniq()}` })
    for (let i = 0; i < 5; i++) {
      await productRepository.create(ctx, {
        sku: `SKU-${uniq()}`,
        name: `Paged ${i}`,
        slug: `paged-${uniq()}`,
        categoryId: cat.id,
      })
    }

    const first = await productRepository.list({ organizationId, categoryId: cat.id, limit: 2 })
    expect(first.items).toHaveLength(2)
    expect(first.nextCursor).not.toBeNull()

    const second = await productRepository.list({
      organizationId,
      categoryId: cat.id,
      limit: 2,
      cursor: first.nextCursor!,
    })
    const overlap = first.items.filter((a) => second.items.some((b) => b.id === a.id))
    expect(overlap).toHaveLength(0)
  })
})
