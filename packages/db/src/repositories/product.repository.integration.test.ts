import { beforeAll, describe, expect, it } from 'vitest'

import { prisma } from '../client'
import { productRepository } from './product.repository'
import { productCategoryRepository } from './product-category.repository'
import { productLinkRepository } from './product-link.repository'

describe.skipIf(!process.env.DATABASE_URL)('product catalog (integration)', () => {
  let orgId = ''
  let userId = ''
  let categoryId = ''
  let attributeId = ''
  let packagingId = ''

  beforeAll(async () => {
    const org = await prisma.organization.upsert({
      where: { slug: 'prod-itest' },
      update: {},
      create: { name: 'Prod IT', slug: 'prod-itest' },
    })
    orgId = org.id
    const u = await prisma.user.upsert({
      where: { email: 'prod-it@triyara.test' },
      update: {},
      create: {
        organizationId: orgId,
        email: 'prod-it@triyara.test',
        name: 'IT',
        passwordHash: 'x',
      },
    })
    userId = u.id
    const attr = await prisma.productAttribute.upsert({
      where: { organizationId_key: { organizationId: orgId, key: 'moisture' } },
      update: {},
      create: {
        organizationId: orgId,
        key: 'moisture',
        label: 'Moisture',
        dataType: 'NUMBER',
        unit: '%',
      },
    })
    attributeId = attr.id
    const pkg = await prisma.packagingType.upsert({
      where: { organizationId_code: { organizationId: orgId, code: 'PP_BAG' } },
      update: {},
      create: { organizationId: orgId, code: 'PP_BAG', name: 'PP Bag' },
    })
    packagingId = pkg.id
  })

  it('category CRUD with slug + child guard', async () => {
    const ctx = { actorId: userId, organizationId: orgId, requestId: 'r1' }
    const parent = await productCategoryRepository.create(ctx, {
      name: `Spices ${Date.now()}`,
      slug: `spices-${Date.now()}`,
    })
    categoryId = parent.id
    const child = await productCategoryRepository.create(ctx, {
      name: 'Turmeric',
      slug: `turmeric-${Date.now()}`,
      parentId: parent.id,
    })
    await expect(
      productCategoryRepository.softDelete(ctx, parent.id, parent.version),
    ).rejects.toThrow(/sub-categor/i)
    const del = await productCategoryRepository.softDelete(ctx, child.id, child.version)
    expect(del.deletedAt).not.toBeNull()
  })

  it('product create with attributes + packaging, unique SKU, version, delete, restore', async () => {
    const ctx = { actorId: userId, organizationId: orgId, requestId: 'r1' }
    const sku = `SKU-${Date.now()}`
    const product = await productRepository.create(ctx, {
      sku,
      slug: `onion-powder-${Date.now()}`,
      name: 'Onion Powder',
      categoryId,
      attributes: [{ attributeId, value: '5' }],
      packagingTypeIds: [packagingId],
    })
    expect(product.attributes).toHaveLength(1)
    expect(product.packaging).toHaveLength(1)
    expect(product.category?.id).toBe(categoryId)

    await expect(
      productRepository.create(ctx, { sku, slug: `dup-${Date.now()}`, name: 'Dup' }),
    ).rejects.toThrow(/already exists/i)

    const updated = await productRepository.mutate(
      ctx,
      product.id,
      product.version,
      { name: 'Onion Powder A', attributes: [] },
      'product.attribute_changed',
    )
    expect(updated.version).toBe(2)
    expect(updated.attributes).toHaveLength(0)

    const deleted = await productRepository.softDelete(ctx, product.id, updated.version)
    expect(deleted.deletedAt).not.toBeNull()
    const restored = await productRepository.restore(ctx, product.id, deleted.version)
    expect(restored.deletedAt).toBeNull()

    // extension link (frozen tables untouched)
    const link = await productLinkRepository.link(ctx, 'SUPPLIER_PRODUCT', 'sp-123', product.id)
    expect(link.productId).toBe(product.id)
    const resolved = await productLinkRepository.resolve(orgId, 'SUPPLIER_PRODUCT', ['sp-123'])
    expect(resolved[0]?.productId).toBe(product.id)

    const audits = await prisma.auditLog.count({
      where: { entityType: 'Product', entityId: product.id },
    })
    expect(audits).toBeGreaterThanOrEqual(4)
  })
})
