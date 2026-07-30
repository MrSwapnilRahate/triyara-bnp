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

const supplierMasterService = {
  list: vi.fn(),
  get: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  search: vi.fn(),
  countries: vi.fn(),
  certifications: vi.fn(),
}
const supplierOfferingService = { list: vi.fn(), add: vi.fn() }

vi.mock('@/lib/supplier-master-service', () => ({
  supplierMasterService,
  supplierOfferingService,
}))

const { GET: listSuppliers, POST: createSupplier } = await import('./route')
const {
  GET: getSupplier,
  PATCH: patchSupplier,
  DELETE: deleteSupplier,
} = await import('./[id]/route')
const { GET: listProducts, POST: addProduct } = await import('./[id]/products/route')
const { GET: searchSuppliers } = await import('./search/route')
const { GET: listCountries } = await import('./countries/route')
const { GET: listCertifications } = await import('./certifications/route')
const { GET: openapi } = await import('./openapi.json/route')

const req = (url: string, init?: RequestInit) => new Request(`http://t.test${url}`, init)
const params = (id: string) => ({ params: Promise.resolve({ id }) })
const body = async (res: Response) =>
  (await res.json()) as {
    success: boolean
    data: never
    meta: { requestId: string; [k: string]: unknown }
    errors: Array<{ code: string; message: string; field?: string }> | null
  }

const supplier = (over: Record<string, unknown> = {}) => ({
  id: 's1',
  supplierCode: 'SUP-000001',
  companyName: 'Acme Spices',
  legalName: 'Acme Spices Pvt Ltd',
  businessType: 'MANUFACTURER',
  country: 'IN',
  city: 'Kochi',
  status: 'APPROVED',
  isVerified: true,
  version: 3,
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  authState.roles = ['ADMIN']
})

describe('GET /api/suppliers', () => {
  it('returns the envelope with pagination, filters and sort in meta', async () => {
    supplierMasterService.list.mockResolvedValue({ items: [supplier()], nextCursor: 'cur1' })
    const res = await listSuppliers(req('/api/suppliers?limit=5&status=APPROVED&country=IN'))
    const b = await body(res)

    expect(res.status).toBe(200)
    expect(b.success).toBe(true)
    expect(b.errors).toBeNull()
    expect(b.data).toHaveLength(1)
    expect(b.meta.pagination).toEqual({ limit: 5, nextCursor: 'cur1' })
    expect(b.meta.filters).toMatchObject({ status: 'APPROVED', country: 'IN' })
    expect(b.meta.sort).toBe('-createdAt')
  })

  it('passes the parsed query through to the service, not the raw string', async () => {
    supplierMasterService.list.mockResolvedValue({ items: [], nextCursor: null })
    await listSuppliers(req('/api/suppliers?limit=7&q=acme&isVerified=true'))
    expect(supplierMasterService.list).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org1' }),
      expect.objectContaining({ limit: 7, q: 'acme', isVerified: 'true' }),
    )
  })

  it('rejects an out-of-range limit with 422 and names the field', async () => {
    const res = await listSuppliers(req('/api/suppliers?limit=500'))
    const b = await body(res)
    expect(res.status).toBe(422)
    expect(b.success).toBe(false)
    expect(b.errors?.[0]?.code).toBe('VALIDATION_ERROR')
    expect(b.errors?.[0]?.field).toBe('limit')
    expect(supplierMasterService.list).not.toHaveBeenCalled()
  })

  it('rejects an unknown sort value', async () => {
    const res = await listSuppliers(req('/api/suppliers?sort=companyName;DROP'))
    expect(res.status).toBe(422)
  })

  it('propagates the caller request id', async () => {
    supplierMasterService.list.mockResolvedValue({ items: [], nextCursor: null })
    const res = await listSuppliers(
      req('/api/suppliers', { headers: { 'x-request-id': 'req-abc' } }),
    )
    expect((await body(res)).meta.requestId).toBe('req-abc')
  })

  it('generates a request id when the caller supplies none', async () => {
    supplierMasterService.list.mockResolvedValue({ items: [], nextCursor: null })
    const b = await body(await listSuppliers(req('/api/suppliers')))
    expect(b.meta.requestId).toMatch(/[0-9a-f-]{36}/)
  })

  it('surfaces a service authorization failure as 403', async () => {
    supplierMasterService.list.mockRejectedValue(new ForbiddenError())
    const res = await listSuppliers(req('/api/suppliers'))
    expect(res.status).toBe(403)
    expect((await body(res)).success).toBe(false)
  })
})

describe('POST /api/suppliers', () => {
  it('creates and returns 201 with an ETag', async () => {
    supplierMasterService.create.mockResolvedValue(supplier({ version: 1 }))
    const res = await createSupplier(
      req('/api/suppliers', {
        method: 'POST',
        body: JSON.stringify({
          supplierCode: 'SUP-000001',
          companyName: 'Acme Spices',
          legalName: 'Acme Spices Pvt Ltd',
          businessType: 'MANUFACTURER',
        }),
      }),
    )
    expect(res.status).toBe(201)
    expect(res.headers.get('ETag')).toBe('W/"v1"')
  })

  it('rejects a body missing required fields with 422', async () => {
    const res = await createSupplier(
      req('/api/suppliers', { method: 'POST', body: JSON.stringify({ companyName: 'x' }) }),
    )
    expect(res.status).toBe(422)
    expect(supplierMasterService.create).not.toHaveBeenCalled()
  })

  it('rejects an unknown businessType with 422', async () => {
    const res = await createSupplier(
      req('/api/suppliers', {
        method: 'POST',
        body: JSON.stringify({
          supplierCode: 'SUP-1',
          companyName: 'x',
          legalName: 'y',
          businessType: 'WIZARD',
        }),
      }),
    )
    expect(res.status).toBe(422)
  })

  it('maps a duplicate supplier code to 409', async () => {
    supplierMasterService.create.mockRejectedValue(new ConflictError('exists'))
    const res = await createSupplier(
      req('/api/suppliers', {
        method: 'POST',
        body: JSON.stringify({
          supplierCode: 'SUP-1',
          companyName: 'x',
          legalName: 'y',
          businessType: 'TRADER',
        }),
      }),
    )
    expect(res.status).toBe(409)
  })
})

describe('GET /api/suppliers/:id', () => {
  it('returns the record and its ETag', async () => {
    supplierMasterService.get.mockResolvedValue(supplier())
    const res = await getSupplier(req('/api/suppliers/s1'), params('s1'))
    expect(res.status).toBe(200)
    expect(res.headers.get('ETag')).toBe('W/"v3"')
  })

  it('maps a missing record to 404', async () => {
    supplierMasterService.get.mockRejectedValue(new NotFoundError('Supplier not found.'))
    const res = await getSupplier(req('/api/suppliers/nope'), params('nope'))
    expect(res.status).toBe(404)
  })

  it('takes the id from the path', async () => {
    supplierMasterService.get.mockResolvedValue(supplier())
    await getSupplier(req('/api/suppliers/s9'), params('s9'))
    expect(supplierMasterService.get).toHaveBeenCalledWith(expect.anything(), 's9')
  })
})

describe('PATCH /api/suppliers/:id', () => {
  it('requires If-Match and answers 428 without it', async () => {
    const res = await patchSupplier(
      req('/api/suppliers/s1', { method: 'PATCH', body: JSON.stringify({ city: 'Kochi' }) }),
      params('s1'),
    )
    expect(res.status).toBe(428)
    expect(supplierMasterService.update).not.toHaveBeenCalled()
  })

  it('forwards the parsed version from If-Match', async () => {
    supplierMasterService.update.mockResolvedValue(supplier({ version: 4 }))
    const res = await patchSupplier(
      req('/api/suppliers/s1', {
        method: 'PATCH',
        headers: { 'if-match': 'W/"v3"' },
        body: JSON.stringify({ city: 'Kochi' }),
      }),
      params('s1'),
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('ETag')).toBe('W/"v4"')
    expect(supplierMasterService.update).toHaveBeenCalledWith(
      expect.anything(),
      's1',
      3,
      expect.objectContaining({ city: 'Kochi' }),
    )
  })

  it('maps a stale version to 412', async () => {
    supplierMasterService.update.mockRejectedValue(new PreconditionFailedError())
    const res = await patchSupplier(
      req('/api/suppliers/s1', {
        method: 'PATCH',
        headers: { 'if-match': 'W/"v1"' },
        body: JSON.stringify({ city: 'x' }),
      }),
      params('s1'),
    )
    expect(res.status).toBe(412)
  })

  it('rejects a malformed If-Match with 428', async () => {
    const res = await patchSupplier(
      req('/api/suppliers/s1', {
        method: 'PATCH',
        headers: { 'if-match': 'garbage' },
        body: JSON.stringify({ city: 'x' }),
      }),
      params('s1'),
    )
    expect(res.status).toBe(428)
  })
})

describe('DELETE /api/suppliers/:id', () => {
  it('requires If-Match', async () => {
    const res = await deleteSupplier(req('/api/suppliers/s1', { method: 'DELETE' }), params('s1'))
    expect(res.status).toBe(428)
    expect(supplierMasterService.remove).not.toHaveBeenCalled()
  })

  it('soft-deletes and returns the record', async () => {
    supplierMasterService.remove.mockResolvedValue(
      supplier({ version: 4, deletedAt: new Date().toISOString() }),
    )
    const res = await deleteSupplier(
      req('/api/suppliers/s1', { method: 'DELETE', headers: { 'if-match': 'W/"v3"' } }),
      params('s1'),
    )
    expect(res.status).toBe(200)
    expect(supplierMasterService.remove).toHaveBeenCalledWith(expect.anything(), 's1', 3)
  })
})

describe('GET /api/suppliers/:id/products', () => {
  it('scopes the listing to the supplier in the path', async () => {
    supplierOfferingService.list.mockResolvedValue({ items: [], nextCursor: null })
    const res = await listProducts(req('/api/suppliers/s1/products?limit=5'), params('s1'))
    expect(res.status).toBe(200)
    expect(supplierOfferingService.list).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ supplierId: 's1', limit: 5 }),
    )
    expect((await body(res)).meta.supplierId).toBe('s1')
  })

  it('ignores a supplierId smuggled through the query string', async () => {
    supplierOfferingService.list.mockResolvedValue({ items: [], nextCursor: null })
    await listProducts(req('/api/suppliers/s1/products?supplierId=other'), params('s1'))
    expect(supplierOfferingService.list).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ supplierId: 's1' }),
    )
  })

  it('adds an offering and returns 201 with an ETag', async () => {
    supplierOfferingService.add.mockResolvedValue({ id: 'o1', productId: 'p1', version: 1 })
    const res = await addProduct(
      req('/api/suppliers/s1/products', {
        method: 'POST',
        body: JSON.stringify({ productId: 'p1' }),
      }),
      params('s1'),
    )
    expect(res.status).toBe(201)
    expect(res.headers.get('ETag')).toBe('W/"v1"')
    expect(supplierOfferingService.add).toHaveBeenCalledWith(
      expect.anything(),
      's1',
      expect.objectContaining({ productId: 'p1' }),
    )
  })

  it('rejects an offering with no productId', async () => {
    const res = await addProduct(
      req('/api/suppliers/s1/products', { method: 'POST', body: JSON.stringify({}) }),
      params('s1'),
    )
    expect(res.status).toBe(422)
    expect(supplierOfferingService.add).not.toHaveBeenCalled()
  })
})

describe('GET /api/suppliers/search', () => {
  it('returns hits with the query echoed in meta', async () => {
    supplierMasterService.search.mockResolvedValue([
      { id: 's1', supplierCode: 'SUP-000001', companyName: 'Acme' },
    ])
    const res = await searchSuppliers(req('/api/suppliers/search?q=acme'))
    const b = await body(res)
    expect(res.status).toBe(200)
    expect(b.meta.query).toBe('acme')
    expect(b.meta.count).toBe(1)
  })

  it('requires q', async () => {
    const res = await searchSuppliers(req('/api/suppliers/search'))
    expect(res.status).toBe(422)
    expect(supplierMasterService.search).not.toHaveBeenCalled()
  })

  it('rejects a single-character q', async () => {
    const res = await searchSuppliers(req('/api/suppliers/search?q=a'))
    expect(res.status).toBe(422)
  })

  it('caps limit at 25', async () => {
    const res = await searchSuppliers(req('/api/suppliers/search?q=acme&limit=100'))
    expect(res.status).toBe(422)
  })

  it('defaults limit to 10', async () => {
    supplierMasterService.search.mockResolvedValue([])
    await searchSuppliers(req('/api/suppliers/search?q=acme'))
    expect(supplierMasterService.search).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ limit: 10 }),
    )
  })
})

describe('GET /api/suppliers/countries', () => {
  it('returns facets with a count', async () => {
    supplierMasterService.countries.mockResolvedValue([{ country: 'IN', suppliers: 3 }])
    const res = await listCountries(req('/api/suppliers/countries'))
    const b = await body(res)
    expect(res.status).toBe(200)
    expect(b.data).toEqual([{ country: 'IN', suppliers: 3 }])
    expect(b.meta.count).toBe(1)
    expect(b.meta.includeDeleted).toBe(false)
  })

  it('rejects a non-boolean includeDeleted', async () => {
    const res = await listCountries(req('/api/suppliers/countries?includeDeleted=maybe'))
    expect(res.status).toBe(422)
  })
})

describe('GET /api/suppliers/certifications', () => {
  it('returns facets and carries the full vocabulary in meta', async () => {
    supplierMasterService.certifications.mockResolvedValue([{ type: 'FSSAI', total: 2, active: 1 }])
    const res = await listCertifications(req('/api/suppliers/certifications'))
    const b = await body(res)
    expect(res.status).toBe(200)
    expect(b.data).toEqual([{ type: 'FSSAI', total: 2, active: 1 }])
    expect(b.meta.vocabulary).toContain('HACCP')
  })
})

describe('GET /api/suppliers/openapi.json', () => {
  it('serves a 3.1 document covering every endpoint', async () => {
    const res = await openapi(req('/api/suppliers/openapi.json'))
    const doc = (await res.json()) as { openapi: string; paths: Record<string, unknown> }
    expect(res.status).toBe(200)
    expect(doc.openapi).toBe('3.1.0')
    expect(Object.keys(doc.paths).sort()).toEqual([
      '/',
      '/certifications',
      '/countries',
      '/search',
      '/{id}',
      '/{id}/products',
    ])
  })
})
