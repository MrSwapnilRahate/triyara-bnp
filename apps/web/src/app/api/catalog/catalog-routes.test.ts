// @vitest-environment node
import { buildAbilityFor, type Role } from '@triyara/auth'
import { ConflictError, ForbiddenError, NotFoundError, PreconditionFailedError } from '@triyara/lib'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The route layer is tested in isolation: auth context and services are mocked,
// so these assert the HTTP contract (envelope, status, ETag/If-Match,
// validation, delegation) rather than re-testing service behaviour.

const authState = { roles: ['ADMIN'] as Role[], organizationId: 'org1', userId: 'u1' }

vi.mock('@/auth/context', () => ({
  requireAuth: vi.fn(async () => {
    const user = {
      id: authState.userId,
      organizationId: authState.organizationId,
      email: 'a@b.com',
      name: 'A',
      roles: authState.roles,
    }
    return {
      user,
      organizationId: authState.organizationId,
      ability: buildAbilityFor(authState.roles),
    }
  }),
}))

const categoryService = {
  list: vi.fn(),
  get: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}
const productService = {
  list: vi.fn(),
  get: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}
const catalogReferenceService = { listSpecifications: vi.fn(), listTags: vi.fn() }

vi.mock('@/lib/catalog-service', () => ({
  categoryService,
  productService,
  catalogReferenceService,
}))

const { GET: listCategories, POST: createCategory } = await import('./categories/route')
const {
  GET: getCategory,
  PATCH: patchCategory,
  DELETE: deleteCategory,
} = await import('./categories/[id]/route')
const { GET: listProducts, POST: createProduct } = await import('./products/route')
const {
  GET: getProduct,
  PATCH: patchProduct,
  DELETE: deleteProduct,
} = await import('./products/[id]/route')
const { GET: listSpecifications } = await import('./specifications/route')
const { GET: listTags } = await import('./tags/route')
const { GET: getOpenApi } = await import('./openapi.json/route')

const category = {
  id: 'cat1',
  name: 'Spices',
  slug: 'spices',
  path: '/spices',
  depth: 0,
  version: 1,
  deletedAt: null,
}
const product = {
  id: 'p1',
  sku: 'TRY-TUR-001',
  name: 'Turmeric Powder',
  slug: 'turmeric-powder',
  categoryId: 'cat1',
  status: 'DRAFT',
  version: 1,
  deletedAt: null,
}

const req = (url: string, init?: RequestInit) => new Request(`http://t.test${url}`, init)
const params = (id: string) => ({ params: Promise.resolve({ id }) })
type Envelope = {
  success: boolean
  data: unknown
  meta: {
    requestId: string
    pagination?: { limit: number; nextCursor: string | null }
    filters?: Record<string, unknown>
    sort?: string
  }
  errors: Array<{ code: string; message: string; field?: string }> | null
}
const json = async (res: Response) => (await res.json()) as Envelope

beforeEach(() => {
  vi.clearAllMocks()
  authState.roles = ['ADMIN']
  categoryService.list.mockResolvedValue({ items: [category], nextCursor: null })
  categoryService.get.mockResolvedValue(category)
  categoryService.create.mockResolvedValue(category)
  categoryService.update.mockResolvedValue({ ...category, version: 2 })
  categoryService.remove.mockResolvedValue({ ...category, version: 2, deletedAt: new Date() })
  productService.list.mockResolvedValue({ items: [product], nextCursor: 'CURSOR' })
  productService.get.mockResolvedValue(product)
  productService.create.mockResolvedValue(product)
  productService.update.mockResolvedValue({ ...product, version: 2 })
  productService.remove.mockResolvedValue({ ...product, version: 2, deletedAt: new Date() })
  catalogReferenceService.listSpecifications.mockResolvedValue({ items: [], nextCursor: null })
  catalogReferenceService.listTags.mockResolvedValue({ items: [], nextCursor: null })
})

describe('response envelope and pagination', () => {
  it('wraps list results in the platform envelope with pagination meta', async () => {
    const res = await listProducts(req('/api/catalog/products?limit=2'))
    const body = await json(res)

    expect(res.status).toBe(200)
    expect(body).toMatchObject({ success: true, errors: null })
    expect(body.data as unknown[]).toHaveLength(1)
    expect(body.meta).toMatchObject({ pagination: { limit: 2, nextCursor: 'CURSOR' } })
    expect(typeof body.meta.requestId).toBe('string')
  })

  it('echoes the caller x-request-id so a client can correlate', async () => {
    const res = await listCategories(
      req('/api/catalog/categories', { headers: { 'x-request-id': 'req-abc' } }),
    )
    const body = await json(res)
    expect(body.meta.requestId).toBe('req-abc')
  })

  it('reports the filters and sort actually applied', async () => {
    const res = await listProducts(req('/api/catalog/products?q=turmeric&status=ACTIVE&sort=name'))
    const body = await json(res)
    expect(body.meta).toMatchObject({ filters: { q: 'turmeric', status: 'ACTIVE' }, sort: 'name' })
  })
})

describe('query validation', () => {
  it('rejects an out-of-range limit with 422 and names the field', async () => {
    const res = await listProducts(req('/api/catalog/products?limit=5000'))
    const body = await json(res)
    expect(res.status).toBe(422)
    expect(body.success).toBe(false)
    expect(body.errors?.[0]).toMatchObject({ code: 'VALIDATION_ERROR', field: 'limit' })
    expect(productService.list).not.toHaveBeenCalled()
  })

  it('rejects an unknown status value', async () => {
    const res = await listProducts(req('/api/catalog/products?status=NONSENSE'))
    expect(res.status).toBe(422)
  })

  it('passes filters and sort through to the service', async () => {
    await listProducts(
      req('/api/catalog/products?q=onion&categoryPathPrefix=/spices&sort=-sku&limit=10'),
    )
    expect(productService.list).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        q: 'onion',
        categoryPathPrefix: '/spices',
        sort: '-sku',
        limit: 10,
      }),
    )
  })
})

describe('body validation', () => {
  it('rejects a product without a SKU', async () => {
    const res = await createProduct(
      req('/api/catalog/products', {
        method: 'POST',
        body: JSON.stringify({ name: 'No SKU', categoryId: 'cat1' }),
      }),
    )
    expect(res.status).toBe(422)
    expect(productService.create).not.toHaveBeenCalled()
  })

  it('rejects a malformed HS code', async () => {
    const res = await createProduct(
      req('/api/catalog/products', {
        method: 'POST',
        body: JSON.stringify({ sku: 'X', name: 'X', categoryId: 'c', hsCode: 'abc' }),
      }),
    )
    expect(res.status).toBe(422)
  })

  it('rejects an invalid category slug pattern', async () => {
    const res = await createCategory(
      req('/api/catalog/categories', {
        method: 'POST',
        body: JSON.stringify({ name: 'Bad', slug: 'Not A Slug' }),
      }),
    )
    expect(res.status).toBe(422)
  })
})

describe('creation', () => {
  it('returns 201 with an ETag carrying the version', async () => {
    const res = await createProduct(
      req('/api/catalog/products', {
        method: 'POST',
        body: JSON.stringify({ sku: 'TRY-TUR-001', name: 'Turmeric Powder', categoryId: 'cat1' }),
      }),
    )
    expect(res.status).toBe(201)
    expect(res.headers.get('ETag')).toBe('W/"v1"')
  })

  it('returns 201 for a category', async () => {
    const res = await createCategory(
      req('/api/catalog/categories', { method: 'POST', body: JSON.stringify({ name: 'Spices' }) }),
    )
    expect(res.status).toBe(201)
    expect(res.headers.get('ETag')).toBe('W/"v1"')
  })
})

describe('optimistic concurrency', () => {
  it('refuses a PATCH with no If-Match (428)', async () => {
    const res = await patchProduct(
      req('/api/catalog/products/p1', { method: 'PATCH', body: JSON.stringify({ name: 'New' }) }),
      params('p1'),
    )
    expect(res.status).toBe(428)
    expect(productService.update).not.toHaveBeenCalled()
  })

  it('refuses a DELETE with no If-Match (428)', async () => {
    const res = await deleteProduct(
      req('/api/catalog/products/p1', { method: 'DELETE' }),
      params('p1'),
    )
    expect(res.status).toBe(428)
    expect(productService.remove).not.toHaveBeenCalled()
  })

  it('parses the version out of If-Match and forwards it', async () => {
    const res = await patchProduct(
      req('/api/catalog/products/p1', {
        method: 'PATCH',
        headers: { 'If-Match': 'W/"v7"' },
        body: JSON.stringify({ name: 'Renamed' }),
      }),
      params('p1'),
    )
    expect(res.status).toBe(200)
    expect(productService.update).toHaveBeenCalledWith(
      expect.anything(),
      'p1',
      7,
      expect.objectContaining({ name: 'Renamed' }),
    )
    expect(res.headers.get('ETag')).toBe('W/"v2"')
  })

  it('surfaces a stale version as 412', async () => {
    productService.update.mockRejectedValue(new PreconditionFailedError())
    const res = await patchProduct(
      req('/api/catalog/products/p1', {
        method: 'PATCH',
        headers: { 'If-Match': 'W/"v1"' },
        body: JSON.stringify({ name: 'Renamed' }),
      }),
      params('p1'),
    )
    expect(res.status).toBe(412)
  })

  it('requires If-Match on category mutations too', async () => {
    const res = await deleteCategory(
      req('/api/catalog/categories/cat1', { method: 'DELETE' }),
      params('cat1'),
    )
    expect(res.status).toBe(428)
  })
})

describe('error mapping', () => {
  it('maps NotFoundError to 404', async () => {
    productService.get.mockRejectedValue(new NotFoundError('Product not found.'))
    const res = await getProduct(req('/api/catalog/products/nope'), params('nope'))
    expect(res.status).toBe(404)
    expect((await json(res)).success).toBe(false)
  })

  it('maps ConflictError to 409', async () => {
    productService.create.mockRejectedValue(new ConflictError('Duplicate SKU.'))
    const res = await createProduct(
      req('/api/catalog/products', {
        method: 'POST',
        body: JSON.stringify({ sku: 'DUP', name: 'Dup', categoryId: 'cat1' }),
      }),
    )
    expect(res.status).toBe(409)
  })

  it('maps a CASL denial to 403', async () => {
    productService.create.mockRejectedValue(
      new ForbiddenError('Not permitted: create ReferenceData'),
    )
    const res = await createProduct(
      req('/api/catalog/products', {
        method: 'POST',
        body: JSON.stringify({ sku: 'X', name: 'X', categoryId: 'cat1' }),
      }),
    )
    expect(res.status).toBe(403)
  })

  it('never leaks an internal error message', async () => {
    productService.list.mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:5432'))
    const res = await listProducts(req('/api/catalog/products'))
    const body = await json(res)
    expect(res.status).toBe(500)
    expect(JSON.stringify(body)).not.toContain('ECONNREFUSED')
    expect(body.errors?.[0]?.code).toBe('INTERNAL')
  })
})

describe('authorization and organization isolation', () => {
  it('forwards the caller organization, never a client-supplied one', async () => {
    await listProducts(req('/api/catalog/products?organizationId=someone-else'))
    const [ctx] = productService.list.mock.calls[0]!
    expect((ctx as { organizationId: string }).organizationId).toBe('org1')
  })

  it('forwards a READ_ONLY ability unchanged so the service can enforce it', async () => {
    authState.roles = ['READ_ONLY']
    await listProducts(req('/api/catalog/products'))
    const [ctx] = productService.list.mock.calls[0]!
    const ability = (ctx as { ability: ReturnType<typeof buildAbilityFor> }).ability
    expect(ability.can('read', 'ReferenceData')).toBe(true)
    expect(ability.can('create', 'ReferenceData')).toBe(false)
  })
})

describe('reference endpoints', () => {
  it('lists specification definitions', async () => {
    const res = await listSpecifications(req('/api/catalog/specifications?isFilterable=true'))
    expect(res.status).toBe(200)
    expect(catalogReferenceService.listSpecifications).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ isFilterable: 'true' }),
    )
  })

  it('lists tags', async () => {
    const res = await listTags(req('/api/catalog/tags'))
    expect(res.status).toBe(200)
    expect(catalogReferenceService.listTags).toHaveBeenCalled()
  })
})

describe('single-resource reads', () => {
  it('returns a category with its ETag', async () => {
    const res = await getCategory(req('/api/catalog/categories/cat1'), params('cat1'))
    expect(res.status).toBe(200)
    expect(res.headers.get('ETag')).toBe('W/"v1"')
  })

  it('honours includeDeleted on product reads', async () => {
    await getProduct(req('/api/catalog/products/p1?includeDeleted=true'), params('p1'))
    expect(productService.get).toHaveBeenCalledWith(expect.anything(), 'p1', {
      includeDeleted: true,
    })
  })

  it('updates a category through the service', async () => {
    const res = await patchCategory(
      req('/api/catalog/categories/cat1', {
        method: 'PATCH',
        headers: { 'If-Match': 'W/"v1"' },
        body: JSON.stringify({ name: 'Renamed' }),
      }),
      params('cat1'),
    )
    expect(res.status).toBe(200)
    expect(categoryService.update).toHaveBeenCalledWith(expect.anything(), 'cat1', 1, {
      name: 'Renamed',
    })
  })
})

describe('openapi document', () => {
  it('serves a valid OpenAPI 3.1 document covering every endpoint', async () => {
    const res = await getOpenApi(req('/api/catalog/openapi.json'))
    const doc = (await res.json()) as {
      openapi: string
      paths: Record<string, Record<string, unknown>>
    }
    expect(res.status).toBe(200)
    expect(doc.openapi).toBe('3.1.0')

    const expected = {
      '/categories': ['get', 'post'],
      '/categories/{id}': ['get', 'patch', 'delete'],
      '/products': ['get', 'post'],
      '/products/{id}': ['get', 'patch', 'delete'],
      '/specifications': ['get'],
      '/tags': ['get'],
    }
    for (const [path, methods] of Object.entries(expected)) {
      expect(doc.paths[path], `missing path ${path}`).toBeDefined()
      for (const m of methods) {
        expect(doc.paths[path]![m], `missing ${m.toUpperCase()} ${path}`).toBeDefined()
      }
    }
  })
})
