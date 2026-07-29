import { beforeAll, describe, expect, it } from 'vitest'

import { prisma } from '../client'

// Schema-level guarantees for the Product Catalog (TRY-BNP-CATALOG-S1).
// These assert the constraints that live in the database rather than in
// application code, including the ones Prisma cannot express and that are
// created by 0003_product_catalog_constraints.
describe.skipIf(!process.env.DATABASE_URL)('product catalog schema (integration)', () => {
  let organizationId = ''
  let categoryId = ''
  let definitionId = ''

  beforeAll(async () => {
    const org = await prisma.organization.upsert({
      where: { slug: 'catalog-itest' },
      update: {},
      create: { name: 'Catalog IT', slug: 'catalog-itest' },
    })
    organizationId = org.id

    const category = await prisma.category.upsert({
      where: { organizationId_slug: { organizationId, slug: 'it-root' } },
      update: {},
      create: { organizationId, name: 'IT Root', slug: 'it-root', path: '/it-root', depth: 0 },
    })
    categoryId = category.id

    const definition = await prisma.productSpecificationDefinition.upsert({
      where: { organizationId_slug: { organizationId, slug: 'it-moisture' } },
      update: {},
      create: {
        organizationId,
        name: 'Moisture',
        slug: 'it-moisture',
        unit: '%',
        dataType: 'NUMBER',
        isFilterable: true,
      },
    })
    definitionId = definition.id
  })

  async function makeProduct(suffix: string) {
    return prisma.product.create({
      data: {
        organizationId,
        categoryId,
        sku: `IT-${suffix}-${Date.now()}`,
        name: `IT Product ${suffix}`,
        slug: `it-product-${suffix}-${Date.now()}`,
      },
    })
  }

  it('enforces a tenant-scoped unique SKU', async () => {
    const product = await makeProduct('sku')
    await expect(
      prisma.product.create({
        data: {
          organizationId,
          categoryId,
          sku: product.sku,
          name: 'Duplicate',
          slug: `dup-${Date.now()}`,
        },
      }),
    ).rejects.toThrow()
  })

  it('allows at most one live PRIMARY image per product', async () => {
    const product = await makeProduct('img')
    await prisma.productImage.create({
      data: { productId: product.id, url: 'https://example.test/a.jpg', type: 'PRIMARY' },
    })
    // A second GALLERY image is fine.
    await prisma.productImage.create({
      data: { productId: product.id, url: 'https://example.test/b.jpg', type: 'GALLERY' },
    })
    // A second PRIMARY is not.
    await expect(
      prisma.productImage.create({
        data: { productId: product.id, url: 'https://example.test/c.jpg', type: 'PRIMARY' },
      }),
    ).rejects.toThrow()
  })

  it('rejects overlapping price validity windows for the same commercial key', async () => {
    const product = await makeProduct('price')
    const base = {
      productId: product.id,
      currency: 'USD',
      incoterm: 'FOB' as const,
      port: 'Nhava Sheva',
      minimumOrderQty: '18',
    }

    await prisma.productPrice.create({
      data: {
        ...base,
        price: '1850',
        validFrom: new Date('2026-01-01'),
        validTo: new Date('2026-07-01'),
      },
    })

    // Overlaps the window above -> rejected by the exclusion constraint.
    await expect(
      prisma.productPrice.create({
        data: {
          ...base,
          price: '1900',
          validFrom: new Date('2026-06-01'),
          validTo: new Date('2027-01-01'),
        },
      }),
    ).rejects.toThrow()

    // Adjacent, non-overlapping window -> accepted.
    const next = await prisma.productPrice.create({
      data: {
        ...base,
        price: '1950',
        validFrom: new Date('2026-07-01'),
        validTo: new Date('2027-01-01'),
      },
    })
    expect(next.id).toBeTruthy()

    // A different incoterm is a different key, so it may share the window.
    const cif = await prisma.productPrice.create({
      data: { ...base, incoterm: 'CIF', price: '2050', validFrom: new Date('2026-01-01') },
    })
    expect(cif.incoterm).toBe('CIF')
  })

  it('cascades owned collections and restricts shared master data', async () => {
    const product = await makeProduct('cascade')
    await prisma.productSpecification.create({
      data: { productId: product.id, definitionId, value: '8', valueNumber: '8' },
    })
    await prisma.productImage.create({
      data: { productId: product.id, url: 'https://example.test/d.jpg', type: 'PRIMARY' },
    })

    // A specification definition that is in use cannot be deleted.
    await expect(
      prisma.productSpecificationDefinition.delete({ where: { id: definitionId } }),
    ).rejects.toThrow()

    // Deleting the product removes its owned children.
    await prisma.product.delete({ where: { id: product.id } })
    expect(await prisma.productSpecification.count({ where: { productId: product.id } })).toBe(0)
    expect(await prisma.productImage.count({ where: { productId: product.id } })).toBe(0)
  })

  it('refuses to delete a category that still holds products', async () => {
    const product = await makeProduct('cat')
    await expect(prisma.category.delete({ where: { id: categoryId } })).rejects.toThrow()
    await prisma.product.delete({ where: { id: product.id } })
  })

  it('supports unlimited category nesting through path and depth', async () => {
    const slugs = ['it-l1', 'it-l2', 'it-l3', 'it-l4']
    let parentId: string | null = null
    let path = ''

    for (const [i, slug] of slugs.entries()) {
      path = `${path}/${slug}`
      const row: { id: string; depth: number } = await prisma.category.upsert({
        where: { organizationId_slug: { organizationId, slug } },
        update: { path, depth: i, parentId },
        create: { organizationId, name: slug, slug, path, depth: i, parentId },
      })
      expect(row.depth).toBe(i)
      parentId = row.id
    }

    // Every descendant is reachable with a single indexed prefix match.
    const subtree = await prisma.category.findMany({
      where: { organizationId, path: { startsWith: '/it-l1' } },
    })
    expect(subtree).toHaveLength(4)
  })

  it('stores typed projections alongside the canonical value', async () => {
    const product = await makeProduct('proj')
    await prisma.productSpecification.create({
      data: { productId: product.id, definitionId, value: '12.5', valueNumber: '12.5' },
    })

    const found = await prisma.productSpecification.findMany({
      where: { definitionId, valueNumber: { gte: 12 }, productId: product.id },
    })
    expect(found).toHaveLength(1)
    expect(found[0]?.value).toBe('12.5')
    expect(Number(found[0]?.valueNumber)).toBe(12.5)
  })
})
