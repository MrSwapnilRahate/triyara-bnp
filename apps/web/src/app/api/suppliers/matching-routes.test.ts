// @vitest-environment node
import { buildAbilityFor, type Role } from '@triyara/auth'
import { ForbiddenError, NotFoundError } from '@triyara/lib'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Supplier matching routes in isolation. The service is mocked, so these assert
// the HTTP contract — and in particular that the shortlist takes the SAME query
// contract as the plain supplier list, since a second search answering the same
// filters differently is the failure worth guarding.

const authState = { roles: ['ADMIN'] as Role[], organizationId: 'org1', userId: 'u1' }

vi.mock('@/auth/context', () => ({
  requireAuth: vi.fn(async () => ({
    user: {
      id: authState.userId,
      organizationId: authState.organizationId,
      email: 'a@b.com',
      name: 'A',
      roles: authState.roles,
    },
    organizationId: authState.organizationId,
    ability: buildAbilityFor(authState.roles),
  })),
}))

const supplierMatchingService = {
  shortlist: vi.fn(),
  score: vi.fn(),
  rfqs: vi.fn(),
  quotations: vi.fn(),
}

vi.mock('@/lib/supplier-master-service', () => ({
  supplierMasterService: {},
  supplierOfferingService: {},
  supplierContactService: {},
  supplierCertificationService: {},
  supplierDocumentService: {},
  supplierNoteService: {},
  supplierMatchingService,
}))

const { GET: shortlist } = await import('./shortlist/route')
const { GET: score } = await import('./[id]/score/route')
const { GET: rfqs } = await import('./[id]/rfqs/route')
const { GET: quotations } = await import('./[id]/quotations/route')

const req = (url: string) => new Request(`http://t.test${url}`)
const params = (id: string) => ({ params: Promise.resolve({ id }) })
const body = async (res: Response) =>
  (await res.json()) as {
    success: boolean
    data: never
    meta: { requestId: string; [k: string]: unknown }
    errors: Array<{ code: string; message: string }> | null
  }

const supplier = (over: Record<string, unknown> = {}) => ({
  id: 's1',
  supplierCode: 'SUP-000001',
  companyName: 'Acme Spices',
  status: 'APPROVED',
  isVerified: true,
  version: 1,
  ...over,
})

const scoreOf = (over: Record<string, unknown> = {}) => ({
  supplierId: 's1',
  score: 82,
  band: 'ready',
  components: [{ key: 'verification', label: 'Verification', points: 25, max: 25, detail: 'ok' }],
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  authState.roles = ['ADMIN']
})

describe('GET /api/suppliers/shortlist', () => {
  it('returns suppliers with their scores in meta', async () => {
    supplierMatchingService.shortlist.mockResolvedValue({
      items: [supplier()],
      nextCursor: null,
      scores: [scoreOf()],
    })
    const res = await shortlist(req('/api/suppliers/shortlist?limit=10'))
    const b = await body(res)

    expect(res.status).toBe(200)
    expect(b.data).toHaveLength(1)
    expect(b.meta.scores).toEqual([scoreOf()])
  })

  it('keeps the supplier shape identical to the plain list', async () => {
    supplierMatchingService.shortlist.mockResolvedValue({
      items: [supplier()],
      nextCursor: null,
      scores: [scoreOf()],
    })
    const b = await body(await shortlist(req('/api/suppliers/shortlist')))
    // Scores ride alongside, never merged in: a list item that grew an extra
    // field only on this endpoint is the difference nobody notices until
    // something else breaks on it.
    expect(b.data[0]).not.toHaveProperty('score')
    expect(b.data[0]).toEqual(supplier())
  })

  it('accepts every filter the supplier list accepts', async () => {
    supplierMatchingService.shortlist.mockResolvedValue({ items: [], nextCursor: null, scores: [] })
    await shortlist(
      req(
        '/api/suppliers/shortlist?productId=p1&maxMoq=10&certification=FSSAI&packaging=bags' +
          '&paymentTerms=advance&exportCountry=AE&country=IN&isVerified=true&status=APPROVED',
      ),
    )

    expect(supplierMatchingService.shortlist).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org1' }),
      expect.objectContaining({
        productId: 'p1',
        maxMoq: 10,
        certification: 'FSSAI',
        packaging: 'bags',
        paymentTerms: 'advance',
        exportCountry: 'AE',
        country: 'IN',
        isVerified: 'true',
        status: 'APPROVED',
      }),
    )
  })

  it('coerces maxMoq to a number rather than passing the raw string', async () => {
    supplierMatchingService.shortlist.mockResolvedValue({ items: [], nextCursor: null, scores: [] })
    await shortlist(req('/api/suppliers/shortlist?maxMoq=25'))
    const [, query] = supplierMatchingService.shortlist.mock.calls[0] as [
      unknown,
      { maxMoq: number },
    ]
    expect(query.maxMoq).toBe(25)
  })

  it('rejects a negative MOQ with 422', async () => {
    const res = await shortlist(req('/api/suppliers/shortlist?maxMoq=-5'))
    expect(res.status).toBe(422)
    expect(supplierMatchingService.shortlist).not.toHaveBeenCalled()
  })

  it('rejects an unknown certification with 422', async () => {
    const res = await shortlist(req('/api/suppliers/shortlist?certification=NOT_A_CERT'))
    expect(res.status).toBe(422)
  })

  it('rejects an export country that is not an alpha-2 code with 422', async () => {
    const res = await shortlist(req('/api/suppliers/shortlist?exportCountry=UAE'))
    expect(res.status).toBe(422)
  })

  it('echoes the applied filters so the screen can show what it searched', async () => {
    supplierMatchingService.shortlist.mockResolvedValue({ items: [], nextCursor: null, scores: [] })
    const b = await body(await shortlist(req('/api/suppliers/shortlist?certification=FSSAI')))
    expect(b.meta.filters).toMatchObject({ certification: 'FSSAI', productId: null })
  })

  it('refuses a caller who may not read suppliers', async () => {
    supplierMatchingService.shortlist.mockRejectedValue(new ForbiddenError())
    const res = await shortlist(req('/api/suppliers/shortlist'))
    expect(res.status).toBe(403)
  })
})

describe('GET /api/suppliers/:id/score', () => {
  it('returns the score with its components', async () => {
    supplierMatchingService.score.mockResolvedValue(scoreOf())
    const b = await body(await score(req('/api/suppliers/s1/score'), params('s1')))

    expect(b.meta.supplierId).toBe('s1')
    // A score nobody can interrogate is a number people stop trusting.
    expect(b.data).toMatchObject({ score: 82, band: 'ready' })
    expect((b.data as unknown as { components: unknown[] }).components).toHaveLength(1)
  })

  it('treats an invisible supplier as absent', async () => {
    supplierMatchingService.score.mockRejectedValue(new NotFoundError('Supplier not found.'))
    const res = await score(req('/api/suppliers/sX/score'), params('sX'))
    expect(res.status).toBe(404)
  })
})

describe('GET /api/suppliers/:id/rfqs', () => {
  it('returns the RFQ history with pagination', async () => {
    supplierMatchingService.rfqs.mockResolvedValue({
      items: [{ id: 'rs1', rfq: { rfqNumber: 'RFQ-1' } }],
      nextCursor: 'cur1',
    })
    const b = await body(await rfqs(req('/api/suppliers/s1/rfqs?limit=5'), params('s1')))

    expect(b.data).toHaveLength(1)
    expect(b.meta.supplierId).toBe('s1')
    expect(b.meta.pagination).toEqual({ limit: 5, nextCursor: 'cur1' })
  })

  it('treats an invisible supplier as absent rather than as having no history', async () => {
    supplierMatchingService.rfqs.mockRejectedValue(new NotFoundError('Supplier not found.'))
    const res = await rfqs(req('/api/suppliers/sX/rfqs'), params('sX'))
    expect(res.status).toBe(404)
  })

  it('rejects a limit beyond the ceiling with 422', async () => {
    const res = await rfqs(req('/api/suppliers/s1/rfqs?limit=5000'), params('s1'))
    expect(res.status).toBe(422)
    expect(supplierMatchingService.rfqs).not.toHaveBeenCalled()
  })
})

describe('GET /api/suppliers/:id/quotations', () => {
  it('returns the quotation history', async () => {
    supplierMatchingService.quotations.mockResolvedValue({
      items: [{ id: 'qo1', isSelected: true }],
      nextCursor: null,
    })
    const b = await body(await quotations(req('/api/suppliers/s1/quotations'), params('s1')))

    expect(b.data).toHaveLength(1)
    expect(b.meta.supplierId).toBe('s1')
  })

  it('treats an invisible supplier as absent', async () => {
    supplierMatchingService.quotations.mockRejectedValue(new NotFoundError('Supplier not found.'))
    const res = await quotations(req('/api/suppliers/sX/quotations'), params('sX'))
    expect(res.status).toBe(404)
  })
})
