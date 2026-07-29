// @vitest-environment node
import { buildAbilityFor, type Role } from '@triyara/auth'
import { prisma } from '@triyara/db'
import { beforeAll, describe, expect, it, vi } from 'vitest'

// Full-stack API integration: route handler -> service -> repository -> real
// PostgreSQL. Only the auth context is mocked; nothing else is stubbed, so this
// exercises authorization, org isolation, optimistic locking and audit for real.

const authState = { roles: ['ADMIN'] as Role[], organizationId: '', userId: '' }

vi.mock('@/auth/context', () => ({
  requireAuth: vi.fn(async () => {
    const user = {
      id: authState.userId,
      organizationId: authState.organizationId,
      email: 'catalog-api@triyara.test',
      name: 'API IT',
      roles: authState.roles,
    }
    return {
      user,
      organizationId: authState.organizationId,
      ability: buildAbilityFor(authState.roles),
    }
  }),
}))

const { GET: listCategories, POST: createCategory } = await import('./categories/route')
const { PATCH: patchCategory, DELETE: deleteCategory } = await import('./categories/[id]/route')
const { GET: listProducts, POST: createProduct } = await import('./products/route')
const {
  GET: getProduct,
  PATCH: patchProduct,
  DELETE: deleteProduct,
} = await import('./products/[id]/route')
const { GET: listSpecifications } = await import('./specifications/route')
const { GET: listTags } = await import('./tags/route')

const req = (url: string, init?: RequestInit) => new Request(`http://t.test${url}`, init)
const params = (id: string) => ({ params: Promise.resolve({ id }) })
const body = async (res: Response) =>
  (await res.json()) as { success: boolean; data: never; meta: never; errors: never }
// Every generated NAME must be unique, not just the SKU: the service derives the
// slug from the name, and slugs are unique per organization. A fixed name passes
// on a fresh database and then collides on the second run.
const uniq = () => Math.random().toString(36).slice(2, 10)

describe.skipIf(!process.env.DATABASE_URL)('catalog API (integration, real PostgreSQL)', () => {
  let categoryId = ''
  let definitionId = ''

  beforeAll(async () => {
    const org = await prisma.organization.upsert({
      where: { slug: 'catalog-api-itest' },
      update: {},
      create: { name: 'Catalog API IT', slug: 'catalog-api-itest' },
    })
    authState.organizationId = org.id

    const user = await prisma.user.upsert({
      where: { email: 'catalog-api@triyara.test' },
      update: {},
      create: {
        organizationId: org.id,
        email: 'catalog-api@triyara.test',
        name: 'API IT',
        passwordHash: 'x',
      },
    })
    authState.userId = user.id

    const def = await prisma.productSpecificationDefinition.upsert({
      where: { organizationId_slug: { organizationId: org.id, slug: 'api-moisture' } },
      update: {},
      create: {
        organizationId: org.id,
        name: 'Moisture',
        slug: 'api-moisture',
        unit: '%',
        dataType: 'NUMBER',
        isFilterable: true,
      },
    })
    definitionId = def.id

    const res = await createCategory(
      req('/api/catalog/categories', {
        method: 'POST',
        body: JSON.stringify({ name: `API Root ${uniq()}` }),
      }),
    )
    categoryId = ((await body(res)).data as unknown as { id: string }).id
  })

  it('creates a product end to end and persists it', async () => {
    const sku = `API-${uniq().toUpperCase()}`
    const res = await createProduct(
      req('/api/catalog/products', {
        method: 'POST',
        body: JSON.stringify({
          sku,
          name: `API Turmeric ${uniq()}`,
          categoryId,
          brand: 'Triyara',
          hsCode: '09103020',
          countryOfOrigin: 'IN',
          specifications: [{ definitionId, value: '8' }],
        }),
      }),
    )

    expect(res.status).toBe(201)
    expect(res.headers.get('ETag')).toBe('W/"v1"')

    const created = (await body(res)).data as unknown as {
      id: string
      sku: string
      specifications: Array<{ valueNumber: string | null }>
    }
    expect(created.sku).toBe(sku)
    // The typed EAV projection is written from the definition's dataType.
    expect(Number(created.specifications[0]!.valueNumber)).toBe(8)

    const row = await prisma.product.findUnique({ where: { id: created.id } })
    expect(row).not.toBeNull()
  })

  it('writes an audit row for a create performed through the API', async () => {
    const sku = `API-${uniq().toUpperCase()}`
    const res = await createProduct(
      req('/api/catalog/products', {
        method: 'POST',
        headers: { 'x-request-id': 'audit-probe' },
        body: JSON.stringify({ sku, name: `Audited ${uniq()}`, categoryId }),
      }),
    )
    const created = (await body(res)).data as unknown as { id: string }

    const audit = await prisma.auditLog.findFirst({
      where: { entityType: 'Product', entityId: created.id, action: 'product.created' },
    })
    expect(audit).not.toBeNull()
    expect(audit!.requestId).toBe('audit-probe')
    expect(audit!.actorId).toBe(authState.userId)
  })

  it('enforces optimistic locking against the real row version', async () => {
    const sku = `API-${uniq().toUpperCase()}`
    const created = (
      await body(
        await createProduct(
          req('/api/catalog/products', {
            method: 'POST',
            body: JSON.stringify({ sku, name: `Locked ${uniq()}`, categoryId }),
          }),
        ),
      )
    ).data as unknown as { id: string }

    const first = await patchProduct(
      req(`/api/catalog/products/${created.id}`, {
        method: 'PATCH',
        headers: { 'If-Match': 'W/"v1"' },
        body: JSON.stringify({ name: 'Renamed once' }),
      }),
      params(created.id),
    )
    expect(first.status).toBe(200)
    expect(first.headers.get('ETag')).toBe('W/"v2"')

    // Replaying the stale version must fail.
    const stale = await patchProduct(
      req(`/api/catalog/products/${created.id}`, {
        method: 'PATCH',
        headers: { 'If-Match': 'W/"v1"' },
        body: JSON.stringify({ name: 'Renamed twice' }),
      }),
      params(created.id),
    )
    expect(stale.status).toBe(412)
  })

  it('rejects a duplicate SKU with 409 and points at restore after soft delete', async () => {
    const sku = `API-${uniq().toUpperCase()}`
    const created = (
      await body(
        await createProduct(
          req('/api/catalog/products', {
            method: 'POST',
            body: JSON.stringify({ sku, name: `Dup Source ${uniq()}`, categoryId }),
          }),
        ),
      )
    ).data as unknown as { id: string }

    const dup = await createProduct(
      req('/api/catalog/products', {
        method: 'POST',
        body: JSON.stringify({ sku, name: `Dup ${uniq()}`, categoryId }),
      }),
    )
    expect(dup.status).toBe(409)

    const del = await deleteProduct(
      req(`/api/catalog/products/${created.id}`, {
        method: 'DELETE',
        headers: { 'If-Match': 'W/"v1"' },
      }),
      params(created.id),
    )
    expect(del.status).toBe(200)

    const afterDelete = await createProduct(
      req('/api/catalog/products', {
        method: 'POST',
        body: JSON.stringify({ sku, name: `Recreate ${uniq()}`, categoryId }),
      }),
    )
    expect(afterDelete.status).toBe(409)
    const msg = JSON.stringify((await body(afterDelete)).errors)
    expect(msg).toMatch(/restore it instead/i)
  })

  it('excludes soft-deleted products from lists unless asked', async () => {
    const sku = `API-${uniq().toUpperCase()}`
    const created = (
      await body(
        await createProduct(
          req('/api/catalog/products', {
            method: 'POST',
            body: JSON.stringify({ sku, name: `Hidden ${uniq()}`, categoryId }),
          }),
        ),
      )
    ).data as unknown as { id: string }

    await deleteProduct(
      req(`/api/catalog/products/${created.id}`, {
        method: 'DELETE',
        headers: { 'If-Match': 'W/"v1"' },
      }),
      params(created.id),
    )

    const plain = (
      await body(
        await listProducts(req(`/api/catalog/products?categoryId=${categoryId}&limit=100`)),
      )
    ).data as unknown as Array<{ id: string }>
    expect(plain.map((p) => p.id)).not.toContain(created.id)

    const withDeleted = (
      await body(
        await listProducts(
          req(`/api/catalog/products?categoryId=${categoryId}&limit=100&includeDeleted=true`),
        ),
      )
    ).data as unknown as Array<{ id: string }>
    expect(withDeleted.map((p) => p.id)).toContain(created.id)
  })

  it('paginates by cursor without repeating rows', async () => {
    const cat = (
      await body(
        await createCategory(
          req('/api/catalog/categories', {
            method: 'POST',
            body: JSON.stringify({ name: `Paged ${uniq()}` }),
          }),
        ),
      )
    ).data as unknown as { id: string }

    for (let i = 0; i < 4; i++) {
      await createProduct(
        req('/api/catalog/products', {
          method: 'POST',
          body: JSON.stringify({
            sku: `API-${uniq().toUpperCase()}`,
            name: `Paged ${i} ${uniq()}`,
            categoryId: cat.id,
          }),
        }),
      )
    }

    const p1 = await body(
      await listProducts(req(`/api/catalog/products?categoryId=${cat.id}&limit=2`)),
    )
    const cursor = (p1.meta as unknown as { pagination: { nextCursor: string } }).pagination
      .nextCursor
    expect(cursor).toBeTruthy()

    const p2 = await body(
      await listProducts(
        req(`/api/catalog/products?categoryId=${cat.id}&limit=2&cursor=${cursor}`),
      ),
    )
    const ids1 = (p1.data as unknown as Array<{ id: string }>).map((p) => p.id)
    const ids2 = (p2.data as unknown as Array<{ id: string }>).map((p) => p.id)
    expect(ids1.filter((id) => ids2.includes(id))).toHaveLength(0)
  })

  it('searches across name and sku', async () => {
    const marker = uniq().toUpperCase()
    await createProduct(
      req('/api/catalog/products', {
        method: 'POST',
        body: JSON.stringify({ sku: `API-${marker}`, name: `Searchable ${marker}`, categoryId }),
      }),
    )
    const found = (await body(await listProducts(req(`/api/catalog/products?q=${marker}`))))
      .data as unknown as Array<{ sku: string }>
    expect(found.length).toBeGreaterThan(0)
  })

  it('refuses a write from a non-admin with 403 but still allows the read', async () => {
    authState.roles = ['EXPORT_MANAGER']
    try {
      const denied = await createProduct(
        req('/api/catalog/products', {
          method: 'POST',
          body: JSON.stringify({ sku: `API-${uniq()}`, name: `Denied ${uniq()}`, categoryId }),
        }),
      )
      expect(denied.status).toBe(403)

      const read = await listProducts(req('/api/catalog/products?limit=1'))
      expect(read.status).toBe(200)
    } finally {
      authState.roles = ['ADMIN']
    }
  })

  it('isolates by organization: another org cannot read this org rows', async () => {
    const other = await prisma.organization.upsert({
      where: { slug: 'catalog-api-other' },
      update: {},
      create: { name: 'Other Org', slug: 'catalog-api-other' },
    })
    const mine = authState.organizationId
    authState.organizationId = other.id
    try {
      const res = await listProducts(
        req(`/api/catalog/products?categoryId=${categoryId}&limit=100`),
      )
      const rows = (await body(res)).data as unknown as unknown[]
      expect(rows).toHaveLength(0)
    } finally {
      authState.organizationId = mine
    }
  })

  it('blocks deleting a category that still holds products (409)', async () => {
    const cat = (
      await body(
        await createCategory(
          req('/api/catalog/categories', {
            method: 'POST',
            body: JSON.stringify({ name: `Held ${uniq()}` }),
          }),
        ),
      )
    ).data as unknown as { id: string; version: number }

    await createProduct(
      req('/api/catalog/products', {
        method: 'POST',
        body: JSON.stringify({
          sku: `API-${uniq().toUpperCase()}`,
          name: `Holder ${uniq()}`,
          categoryId: cat.id,
        }),
      }),
    )

    const res = await deleteCategory(
      req(`/api/catalog/categories/${cat.id}`, {
        method: 'DELETE',
        headers: { 'If-Match': `W/"v${cat.version}"` },
      }),
      params(cat.id),
    )
    expect(res.status).toBe(409)
  })

  it('rewrites the subtree path when a category is moved via PATCH', async () => {
    const a = (
      await body(
        await createCategory(
          req('/api/catalog/categories', {
            method: 'POST',
            body: JSON.stringify({ name: `MA ${uniq()}` }),
          }),
        ),
      )
    ).data as unknown as { id: string; version: number; path: string }
    const b = (
      await body(
        await createCategory(
          req('/api/catalog/categories', {
            method: 'POST',
            body: JSON.stringify({ name: `MB ${uniq()}`, parentId: a.id }),
          }),
        ),
      )
    ).data as unknown as { id: string; path: string }
    const home = (
      await body(
        await createCategory(
          req('/api/catalog/categories', {
            method: 'POST',
            body: JSON.stringify({ name: `MH ${uniq()}` }),
          }),
        ),
      )
    ).data as unknown as { id: string; path: string }

    const moved = await patchCategory(
      req(`/api/catalog/categories/${a.id}`, {
        method: 'PATCH',
        headers: { 'If-Match': `W/"v${a.version}"` },
        body: JSON.stringify({ parentId: home.id }),
      }),
      params(a.id),
    )
    expect(moved.status).toBe(200)

    const childAfter = await prisma.category.findUniqueOrThrow({ where: { id: b.id } })
    const parentAfter = await prisma.category.findUniqueOrThrow({ where: { id: a.id } })
    expect(parentAfter.path.startsWith(home.path)).toBe(true)
    expect(childAfter.path.startsWith(parentAfter.path)).toBe(true)
    expect(childAfter.depth).toBe(2)
  })

  it('serves specification definitions and tags', async () => {
    const specs = await listSpecifications(req('/api/catalog/specifications?limit=100'))
    expect(specs.status).toBe(200)
    const specRows = (await body(specs)).data as unknown as Array<{ id: string }>
    expect(specRows.map((s) => s.id)).toContain(definitionId)

    const tags = await listTags(req('/api/catalog/tags'))
    expect(tags.status).toBe(200)
  })

  it('lists categories ordered by materialised path', async () => {
    const res = await listCategories(req('/api/catalog/categories?limit=100'))
    expect(res.status).toBe(200)
    const rows = (await body(res)).data as unknown as Array<{ path: string }>
    const paths = rows.map((r) => r.path)
    expect([...paths].sort()).toEqual(paths)
  })
})
