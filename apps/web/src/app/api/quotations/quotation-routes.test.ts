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

const quotationService = {
  list: vi.fn(),
  get: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  transition: vi.fn(),
  send: vi.fn(),
  accept: vi.fn(),
  expire: vi.fn(),
  replaceItems: vi.fn(),
  setConditions: vi.fn(),
  approvalHistory: vi.fn(),
  revisionHistory: vi.fn(),
  revise: vi.fn(),
  history: vi.fn(),
}

vi.mock('@/lib/quotation-service', () => ({ quotationService }))

const { GET: listQuotations, POST: createQuotation } = await import('./route')
const { POST: replaceItems } = await import('./[id]/items/route')
const { GET: getConditions, PUT: setConditions } = await import('./[id]/conditions/route')
const { GET: listApprovals, POST: decide } = await import('./[id]/approvals/route')
const { GET: listRevisions } = await import('./[id]/revisions/route')
const { POST: revise } = await import('./[id]/revise/route')
const { GET: getChain } = await import('./[id]/chain/route')
const {
  GET: getQuotation,
  PATCH: patchQuotation,
  DELETE: deleteQuotation,
} = await import('./[id]/route')
const { GET: listItems } = await import('./[id]/items/route')
const { POST: approve } = await import('./[id]/approve/route')
const { POST: reject } = await import('./[id]/reject/route')
const { POST: send } = await import('./[id]/send/route')
const { POST: accept } = await import('./[id]/accept/route')
const { POST: expire } = await import('./[id]/expire/route')
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

const quotation = (over: Record<string, unknown> = {}) => ({
  id: 'q1',
  quotationNumber: 'QT-2026-0001',
  revisionNumber: 1,
  type: 'FIRM',
  status: 'DRAFT',
  buyerId: 'acc1',
  currency: 'USD',
  baseCurrency: 'USD',
  grandTotal: '1000',
  sentAt: null,
  version: 3,
  items: [{ id: 'li1', lineNumber: 1 }],
  charges: [],
  taxes: [],
  ...over,
})

const validItem = { quantity: 10, unit: 'MT', unitPrice: 100, productId: 'p1' }
const validCreate = {
  quotationNumber: 'QT-2026-0001',
  buyerId: 'acc1',
  currency: 'USD',
  baseCurrency: 'USD',
  items: [validItem],
}

beforeEach(() => {
  vi.clearAllMocks()
  authState.roles = ['ADMIN']
})

describe('GET /api/quotations', () => {
  it('returns the envelope with pagination, filters and sort in meta', async () => {
    quotationService.list.mockResolvedValue({ items: [quotation()], nextCursor: 'cur1' })
    const res = await listQuotations(req('/api/quotations?limit=5&status=SENT&currentOnly=true'))
    const b = await body(res)
    expect(res.status).toBe(200)
    expect(b.success).toBe(true)
    expect(b.errors).toBeNull()
    expect(b.meta.pagination).toEqual({ limit: 5, nextCursor: 'cur1' })
    expect(b.meta.filters).toMatchObject({ status: 'SENT', currentOnly: 'true' })
    expect(b.meta.sort).toBe('-createdAt')
  })

  it('forwards the parsed query to the service', async () => {
    quotationService.list.mockResolvedValue({ items: [], nextCursor: null })
    await listQuotations(req('/api/quotations?limit=7&q=turmeric&rfqId=r1'))
    expect(quotationService.list).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org1' }),
      expect.objectContaining({ limit: 7, q: 'turmeric', rfqId: 'r1' }),
    )
  })

  it('rejects an out-of-range limit with 422 and names the field', async () => {
    const res = await listQuotations(req('/api/quotations?limit=500'))
    expect(res.status).toBe(422)
    expect((await body(res)).errors?.[0]?.field).toBe('limit')
    expect(quotationService.list).not.toHaveBeenCalled()
  })

  it('rejects an unknown status and an unknown sort', async () => {
    expect((await listQuotations(req('/api/quotations?status=WIZARD'))).status).toBe(422)
    expect((await listQuotations(req('/api/quotations?sort=title'))).status).toBe(422)
  })

  it('propagates the caller request id', async () => {
    quotationService.list.mockResolvedValue({ items: [], nextCursor: null })
    const res = await listQuotations(
      req('/api/quotations', { headers: { 'x-request-id': 'req-abc' } }),
    )
    expect((await body(res)).meta.requestId).toBe('req-abc')
  })

  it('generates a request id when the caller supplies none', async () => {
    quotationService.list.mockResolvedValue({ items: [], nextCursor: null })
    expect((await body(await listQuotations(req('/api/quotations')))).meta.requestId).toMatch(
      /[0-9a-f-]{36}/,
    )
  })

  it('surfaces an authorization failure as 403', async () => {
    quotationService.list.mockRejectedValue(new ForbiddenError())
    expect((await listQuotations(req('/api/quotations'))).status).toBe(403)
  })
})

describe('POST /api/quotations', () => {
  it('creates with lines in one request and returns 201 + ETag', async () => {
    quotationService.create.mockResolvedValue(quotation({ version: 1 }))
    const res = await createQuotation(
      req('/api/quotations', { method: 'POST', body: JSON.stringify(validCreate) }),
    )
    expect(res.status).toBe(201)
    expect(res.headers.get('ETag')).toBe('W/"v1"')
  })

  it('separates the header from the items before delegating', async () => {
    quotationService.create.mockResolvedValue(quotation({ version: 1 }))
    await createQuotation(
      req('/api/quotations', { method: 'POST', body: JSON.stringify(validCreate) }),
    )
    const [, header, itemsDto] = quotationService.create.mock.calls[0]!
    expect(header).not.toHaveProperty('items')
    expect(header).toMatchObject({ quotationNumber: 'QT-2026-0001' })
    expect(itemsDto.items).toHaveLength(1)
  })

  it('rejects a create with no items', async () => {
    const res = await createQuotation(
      req('/api/quotations', {
        method: 'POST',
        body: JSON.stringify({ ...validCreate, items: [] }),
      }),
    )
    expect(res.status).toBe(422)
    expect(quotationService.create).not.toHaveBeenCalled()
  })

  it('rejects a create missing baseCurrency', async () => {
    const { baseCurrency: _b, ...noBase } = validCreate
    expect(
      (
        await createQuotation(
          req('/api/quotations', { method: 'POST', body: JSON.stringify(noBase) }),
        )
      ).status,
    ).toBe(422)
  })

  it('rejects a malformed quotationNumber', async () => {
    const res = await createQuotation(
      req('/api/quotations', {
        method: 'POST',
        body: JSON.stringify({ ...validCreate, quotationNumber: 'qt lowercase' }),
      }),
    )
    expect(res.status).toBe(422)
  })

  it('maps a duplicate number and revision to 409', async () => {
    quotationService.create.mockRejectedValue(new ConflictError('exists'))
    const res = await createQuotation(
      req('/api/quotations', { method: 'POST', body: JSON.stringify(validCreate) }),
    )
    expect(res.status).toBe(409)
  })

  it('maps a missing exchange rate to 422', async () => {
    const { ValidationError } = await import('@triyara/lib')
    quotationService.create.mockRejectedValue(new ValidationError('No exchange rate is on file'))
    const res = await createQuotation(
      req('/api/quotations', { method: 'POST', body: JSON.stringify(validCreate) }),
    )
    expect(res.status).toBe(422)
  })
})

describe('GET /api/quotations/:id', () => {
  it('returns the record and its ETag', async () => {
    quotationService.get.mockResolvedValue(quotation())
    const res = await getQuotation(req('/api/quotations/q1'), params('q1'))
    expect(res.status).toBe(200)
    expect(res.headers.get('ETag')).toBe('W/"v3"')
  })

  it('maps a missing record to 404', async () => {
    quotationService.get.mockRejectedValue(new NotFoundError('Quotation not found.'))
    expect((await getQuotation(req('/api/quotations/nope'), params('nope'))).status).toBe(404)
  })

  it('passes through whatever redaction the service applied', async () => {
    quotationService.get.mockResolvedValue(
      quotation({ costTotal: null, marginPercent: null, items: [{ id: 'li1', unitCost: null }] }),
    )
    const b = await body(await getQuotation(req('/api/quotations/q1'), params('q1')))
    const d = b.data as unknown as { costTotal: null; items: Array<{ unitCost: null }> }
    expect(d.costTotal).toBeNull()
    expect(d.items[0]!.unitCost).toBeNull()
  })
})

describe('PATCH /api/quotations/:id', () => {
  it('answers 428 without If-Match', async () => {
    const res = await patchQuotation(
      req('/api/quotations/q1', { method: 'PATCH', body: JSON.stringify({ title: 'x' }) }),
      params('q1'),
    )
    expect(res.status).toBe(428)
    expect(quotationService.update).not.toHaveBeenCalled()
  })

  it('forwards the parsed version from If-Match', async () => {
    quotationService.update.mockResolvedValue(quotation({ version: 4 }))
    const res = await patchQuotation(
      req('/api/quotations/q1', {
        method: 'PATCH',
        headers: { 'if-match': 'W/"v3"' },
        body: JSON.stringify({ title: 'Revised' }),
      }),
      params('q1'),
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('ETag')).toBe('W/"v4"')
    expect(quotationService.update).toHaveBeenCalledWith(
      expect.anything(),
      'q1',
      3,
      expect.objectContaining({ title: 'Revised' }),
    )
  })

  it('maps a stale version to 412', async () => {
    quotationService.update.mockRejectedValue(new PreconditionFailedError())
    const res = await patchQuotation(
      req('/api/quotations/q1', {
        method: 'PATCH',
        headers: { 'if-match': 'W/"v1"' },
        body: JSON.stringify({ title: 'x' }),
      }),
      params('q1'),
    )
    expect(res.status).toBe(412)
  })

  it('surfaces an edit to a SENT quotation as 409', async () => {
    quotationService.update.mockRejectedValue(new ConflictError('cannot be edited'))
    const res = await patchQuotation(
      req('/api/quotations/q1', {
        method: 'PATCH',
        headers: { 'if-match': 'W/"v3"' },
        body: JSON.stringify({ title: 'x' }),
      }),
      params('q1'),
    )
    expect(res.status).toBe(409)
  })
})

describe('DELETE /api/quotations/:id', () => {
  it('requires If-Match', async () => {
    expect(
      (await deleteQuotation(req('/api/quotations/q1', { method: 'DELETE' }), params('q1'))).status,
    ).toBe(428)
    expect(quotationService.remove).not.toHaveBeenCalled()
  })

  it('withdraws with the parsed version', async () => {
    quotationService.remove.mockResolvedValue(quotation({ status: 'WITHDRAWN', version: 4 }))
    const res = await deleteQuotation(
      req('/api/quotations/q1', { method: 'DELETE', headers: { 'if-match': 'W/"v3"' } }),
      params('q1'),
    )
    expect(res.status).toBe(200)
    expect(quotationService.remove).toHaveBeenCalledWith(expect.anything(), 'q1', 3)
  })
})

describe('GET /api/quotations/:id/items', () => {
  it('returns the lines with quotation context in meta', async () => {
    quotationService.get.mockResolvedValue(quotation())
    const res = await listItems(req('/api/quotations/q1/items'), params('q1'))
    const b = await body(res)
    expect(res.status).toBe(200)
    expect(b.data).toHaveLength(1)
    expect(b.meta).toMatchObject({
      quotationId: 'q1',
      quotationNumber: 'QT-2026-0001',
      revisionNumber: 1,
      currency: 'USD',
      count: 1,
    })
  })
})

describe('workflow endpoints', () => {
  const decisionCases = [
    ['approve', approve, 'APPROVED', 'APPROVED'],
    ['reject', reject, 'REJECTED', 'REJECTED'],
  ] as const

  for (const [name, handler, decision, status] of decisionCases) {
    it(`${name} requires If-Match`, async () => {
      const res = await handler(
        req(`/api/quotations/q1/${name}`, { method: 'POST', body: '{}' }),
        params('q1'),
      )
      expect(res.status).toBe(428)
      expect(quotationService.transition).not.toHaveBeenCalled()
    })

    it(`${name} delegates to transition() with decision ${decision}`, async () => {
      quotationService.transition.mockResolvedValue(quotation({ status, version: 4 }))
      const res = await handler(
        req(`/api/quotations/q1/${name}`, {
          method: 'POST',
          headers: { 'if-match': 'W/"v3"' },
          body: JSON.stringify({ comments: 'Looks right.' }),
        }),
        params('q1'),
      )
      const b = await body(res)
      expect(res.status).toBe(200)
      expect(res.headers.get('ETag')).toBe('W/"v4"')
      expect(b.meta.status).toBe(status)
      expect(quotationService.transition).toHaveBeenCalledWith(expect.anything(), 'q1', 3, {
        decision,
        comments: 'Looks right.',
      })
    })

    it(`${name} works with an empty body`, async () => {
      quotationService.transition.mockResolvedValue(quotation({ status, version: 4 }))
      const res = await handler(
        req(`/api/quotations/q1/${name}`, {
          method: 'POST',
          headers: { 'if-match': 'W/"v3"' },
          body: '{}',
        }),
        params('q1'),
      )
      expect(res.status).toBe(200)
      expect(quotationService.transition).toHaveBeenCalledWith(expect.anything(), 'q1', 3, {
        decision,
      })
    })

    it(`${name} maps an illegal transition to 409`, async () => {
      quotationService.transition.mockRejectedValue(new ConflictError('illegal'))
      const res = await handler(
        req(`/api/quotations/q1/${name}`, {
          method: 'POST',
          headers: { 'if-match': 'W/"v3"' },
          body: '{}',
        }),
        params('q1'),
      )
      expect(res.status).toBe(409)
    })
  }

  const directCases = [
    ['accept', accept, 'accept', 'ACCEPTED'],
    ['expire', expire, 'expire', 'EXPIRED'],
  ] as const

  for (const [name, handler, method, status] of directCases) {
    it(`${name} requires If-Match`, async () => {
      const res = await handler(
        req(`/api/quotations/q1/${name}`, { method: 'POST', body: '{}' }),
        params('q1'),
      )
      expect(res.status).toBe(428)
      expect(quotationService[method]).not.toHaveBeenCalled()
    })

    it(`${name} delegates to ${method}() and reports the new status`, async () => {
      quotationService[method].mockResolvedValue(quotation({ status, version: 4 }))
      const res = await handler(
        req(`/api/quotations/q1/${name}`, {
          method: 'POST',
          headers: { 'if-match': 'W/"v3"' },
          body: JSON.stringify({ comments: 'Buyer confirmed.' }),
        }),
        params('q1'),
      )
      const b = await body(res)
      expect(res.status).toBe(200)
      expect(b.meta.status).toBe(status)
      expect(quotationService[method]).toHaveBeenCalledWith(
        expect.anything(),
        'q1',
        3,
        'Buyer confirmed.',
      )
    })

    it(`${name} maps an illegal transition to 409`, async () => {
      quotationService[method].mockRejectedValue(new ConflictError('illegal'))
      const res = await handler(
        req(`/api/quotations/q1/${name}`, {
          method: 'POST',
          headers: { 'if-match': 'W/"v3"' },
          body: '{}',
        }),
        params('q1'),
      )
      expect(res.status).toBe(409)
    })
  }

  it('send requires If-Match and takes no body', async () => {
    expect(
      (await send(req('/api/quotations/q1/send', { method: 'POST' }), params('q1'))).status,
    ).toBe(428)

    quotationService.send.mockResolvedValue(
      quotation({ status: 'SENT', version: 4, sentAt: '2026-07-30T00:00:00.000Z' }),
    )
    const res = await send(
      req('/api/quotations/q1/send', { method: 'POST', headers: { 'if-match': 'W/"v3"' } }),
      params('q1'),
    )
    const b = await body(res)
    expect(res.status).toBe(200)
    expect(b.meta.status).toBe('SENT')
    expect(b.meta.sentAt).toBe('2026-07-30T00:00:00.000Z')
    expect(quotationService.send).toHaveBeenCalledWith(expect.anything(), 'q1', 3)
  })

  it('send maps a quotation with no validity date to 422', async () => {
    const { ValidationError } = await import('@triyara/lib')
    quotationService.send.mockRejectedValue(new ValidationError('needs a validity date'))
    const res = await send(
      req('/api/quotations/q1/send', { method: 'POST', headers: { 'if-match': 'W/"v3"' } }),
      params('q1'),
    )
    expect(res.status).toBe(422)
  })

  it('approve surfaces a threshold refusal as 403', async () => {
    quotationService.transition.mockRejectedValue(new ForbiddenError())
    const res = await approve(
      req('/api/quotations/q1/approve', {
        method: 'POST',
        headers: { 'if-match': 'W/"v3"' },
        body: '{}',
      }),
      params('q1'),
    )
    expect(res.status).toBe(403)
  })

  it('rejects an over-long comment', async () => {
    const res = await approve(
      req('/api/quotations/q1/approve', {
        method: 'POST',
        headers: { 'if-match': 'W/"v3"' },
        body: JSON.stringify({ comments: 'x'.repeat(2001) }),
      }),
      params('q1'),
    )
    expect(res.status).toBe(422)
    expect(quotationService.transition).not.toHaveBeenCalled()
  })
})

describe('lifecycle routes', () => {
  describe('POST /:id/items', () => {
    it('replaces the lines and returns 201 with the recomputed totals', async () => {
      quotationService.replaceItems.mockResolvedValue(
        quotation({ version: 4, subtotal: '2000', grandTotal: '2200' }),
      )
      const res = await replaceItems(
        req('/api/quotations/q1/items', {
          method: 'POST',
          headers: { 'if-match': 'W/"v3"' },
          body: JSON.stringify({ items: [validItem] }),
        }),
        params('q1'),
      )
      expect(res.status).toBe(201)
      expect(res.headers.get('etag')).toBe('W/"v4"')
      expect((await body(res)).meta).toMatchObject({ subtotal: '2000', grandTotal: '2200' })
    })

    it('requires If-Match', async () => {
      const res = await replaceItems(
        req('/api/quotations/q1/items', {
          method: 'POST',
          body: JSON.stringify({ items: [validItem] }),
        }),
        params('q1'),
      )
      expect(res.status).toBe(428)
      expect(quotationService.replaceItems).not.toHaveBeenCalled()
    })

    it('surfaces the frozen-after-send conflict as 409', async () => {
      quotationService.replaceItems.mockRejectedValue(
        new ConflictError('Pricing on a SENT quotation is frozen. Create a revision instead.'),
      )
      const res = await replaceItems(
        req('/api/quotations/q1/items', {
          method: 'POST',
          headers: { 'if-match': 'W/"v3"' },
          body: JSON.stringify({ items: [validItem] }),
        }),
        params('q1'),
      )
      expect(res.status).toBe(409)
      expect((await body(res)).errors?.[0]?.message).toContain('revision')
    })
  })

  describe('PUT /:id/conditions', () => {
    it('sends charges and taxes to the service in one call', async () => {
      quotationService.setConditions.mockResolvedValue(quotation({ version: 5 }))
      const res = await setConditions(
        req('/api/quotations/q1/conditions', {
          method: 'PUT',
          headers: { 'if-match': 'W/"v4"' },
          body: JSON.stringify({
            charges: [{ type: 'FREIGHT', amount: 100, currency: 'USD' }],
            taxes: [
              { type: 'GST', ratePercent: 5, taxableAmount: 100, amount: 5, currency: 'USD' },
            ],
          }),
        }),
        params('q1'),
      )
      expect(res.status).toBe(200)
      const [, id, version, charges, taxes] = quotationService.setConditions.mock.calls[0]!
      expect(id).toBe('q1')
      expect(version).toBe(4)
      expect(charges).toHaveLength(1)
      expect(taxes).toHaveLength(1)
    })

    it('treats omitted collections as empty, which is how they are cleared', async () => {
      quotationService.setConditions.mockResolvedValue(quotation({ version: 5 }))
      await setConditions(
        req('/api/quotations/q1/conditions', {
          method: 'PUT',
          headers: { 'if-match': 'W/"v4"' },
          body: JSON.stringify({}),
        }),
        params('q1'),
      )
      const [, , , charges, taxes] = quotationService.setConditions.mock.calls[0]!
      expect(charges).toEqual([])
      expect(taxes).toEqual([])
    })

    it('rejects a malformed charge', async () => {
      const res = await setConditions(
        req('/api/quotations/q1/conditions', {
          method: 'PUT',
          headers: { 'if-match': 'W/"v4"' },
          body: JSON.stringify({ charges: [{ type: 'NONSENSE', amount: 1, currency: 'USD' }] }),
        }),
        params('q1'),
      )
      expect(res.status).toBe(422)
      expect(quotationService.setConditions).not.toHaveBeenCalled()
    })

    it('reads the stored conditions', async () => {
      quotationService.get.mockResolvedValue(quotation())
      const res = await getConditions(req('/api/quotations/q1/conditions'), params('q1'))
      expect(res.status).toBe(200)
      expect(await body(res)).toHaveProperty('data.charges')
    })
  })

  describe('POST /:id/approvals', () => {
    it('accepts PENDING, the decision no other route could send', async () => {
      quotationService.transition.mockResolvedValue(
        quotation({ status: 'PENDING_APPROVAL', version: 2 }),
      )
      const res = await decide(
        req('/api/quotations/q1/approvals', {
          method: 'POST',
          headers: { 'if-match': 'W/"v1"' },
          body: JSON.stringify({ decision: 'PENDING' }),
        }),
        params('q1'),
      )
      expect(res.status).toBe(201)
      expect((await body(res)).meta).toMatchObject({
        status: 'PENDING_APPROVAL',
        decision: 'PENDING',
      })
    })

    it('rejects a decision outside the vocabulary', async () => {
      const res = await decide(
        req('/api/quotations/q1/approvals', {
          method: 'POST',
          headers: { 'if-match': 'W/"v1"' },
          body: JSON.stringify({ decision: 'MAYBE' }),
        }),
        params('q1'),
      )
      expect(res.status).toBe(422)
      expect(quotationService.transition).not.toHaveBeenCalled()
    })

    it('surfaces an illegal transition as 409', async () => {
      quotationService.transition.mockRejectedValue(
        new ConflictError('A DRAFT quotation cannot move to REJECTED.'),
      )
      const res = await decide(
        req('/api/quotations/q1/approvals', {
          method: 'POST',
          headers: { 'if-match': 'W/"v1"' },
          body: JSON.stringify({ decision: 'REJECTED' }),
        }),
        params('q1'),
      )
      expect(res.status).toBe(409)
    })

    it('lists the decision trail with a count', async () => {
      quotationService.approvalHistory.mockResolvedValue([
        { id: 'a2', sequence: 2, toStatus: 'APPROVED' },
        { id: 'a1', sequence: 1, toStatus: 'PENDING' },
      ])
      const res = await listApprovals(req('/api/quotations/q1/approvals'), params('q1'))
      expect((await body(res)).meta).toMatchObject({ quotationId: 'q1', count: 2 })
    })

    it('is refused for a role the service rejects', async () => {
      quotationService.transition.mockRejectedValue(new ForbiddenError('Not permitted.'))
      const res = await decide(
        req('/api/quotations/q1/approvals', {
          method: 'POST',
          headers: { 'if-match': 'W/"v1"' },
          body: JSON.stringify({ decision: 'APPROVED' }),
        }),
        params('q1'),
      )
      expect(res.status).toBe(403)
    })
  })

  describe('POST /:id/revise', () => {
    it('returns 201 with the successor and names what it superseded', async () => {
      quotationService.revise.mockResolvedValue(
        quotation({ id: 'q2', revisionNumber: 2, version: 1 }),
      )
      const res = await revise(
        req('/api/quotations/q1/revise', {
          method: 'POST',
          headers: { 'if-match': 'W/"v3"' },
          body: JSON.stringify({ reason: 'Buyer renegotiated.', items: [validItem] }),
        }),
        params('q1'),
      )
      expect(res.status).toBe(201)
      expect((await body(res)).meta).toMatchObject({ supersededId: 'q1', revisionNumber: 2 })
    })

    it('splits items from the revision reason before delegating', async () => {
      quotationService.revise.mockResolvedValue(quotation({ id: 'q2' }))
      await revise(
        req('/api/quotations/q1/revise', {
          method: 'POST',
          headers: { 'if-match': 'W/"v3"' },
          body: JSON.stringify({ reason: 'Correction.', items: [validItem] }),
        }),
        params('q1'),
      )
      const [, , , itemsDto, revisionDto] = quotationService.revise.mock.calls[0]!
      expect(itemsDto).toHaveProperty('items')
      expect(revisionDto).toEqual({ reason: 'Correction.' })
      expect(revisionDto).not.toHaveProperty('items')
    })

    it('requires a reason', async () => {
      const res = await revise(
        req('/api/quotations/q1/revise', {
          method: 'POST',
          headers: { 'if-match': 'W/"v3"' },
          body: JSON.stringify({ items: [validItem] }),
        }),
        params('q1'),
      )
      expect(res.status).toBe(422)
    })
  })

  describe('read-only history routes', () => {
    it('reports the current revision in meta', async () => {
      quotationService.revisionHistory.mockResolvedValue([
        { id: 'r2', toRevision: 3 },
        { id: 'r1', toRevision: 2 },
      ])
      const res = await listRevisions(req('/api/quotations/q1/revisions'), params('q1'))
      expect((await body(res)).meta).toMatchObject({ count: 2, currentRevision: 3 })
    })

    it('reports revision 0 when there are none', async () => {
      quotationService.revisionHistory.mockResolvedValue([])
      const res = await listRevisions(req('/api/quotations/q1/revisions'), params('q1'))
      expect((await body(res)).meta).toMatchObject({ count: 0, currentRevision: 0 })
    })

    it('resolves the chain through the quotation number', async () => {
      quotationService.get.mockResolvedValue(
        quotation({ quotationNumber: 'QT-1', revisionNumber: 2 }),
      )
      quotationService.history.mockResolvedValue([{ id: 'q1' }, { id: 'q2' }])
      const res = await getChain(req('/api/quotations/q1/chain'), params('q1'))
      expect(quotationService.history).toHaveBeenCalledWith(expect.anything(), 'QT-1')
      expect((await body(res)).meta).toMatchObject({ quotationNumber: 'QT-1', count: 2 })
    })

    it('reports a missing quotation as 404', async () => {
      quotationService.revisionHistory.mockRejectedValue(new NotFoundError('Quotation not found.'))
      const res = await listRevisions(req('/api/quotations/nope/revisions'), params('nope'))
      expect(res.status).toBe(404)
    })
  })
})

describe('GET /api/quotations/openapi.json', () => {
  it('serves a 3.1 document covering every endpoint', async () => {
    const res = await openapi(req('/api/quotations/openapi.json'))
    const doc = (await res.json()) as { openapi: string; paths: Record<string, unknown> }
    expect(res.status).toBe(200)
    expect(doc.openapi).toBe('3.1.0')
    expect(Object.keys(doc.paths).sort()).toEqual([
      '/',
      '/{id}',
      '/{id}/accept',
      '/{id}/approvals',
      '/{id}/approve',
      '/{id}/chain',
      '/{id}/conditions',
      '/{id}/expire',
      '/{id}/items',
      '/{id}/reject',
      '/{id}/revise',
      '/{id}/revisions',
      '/{id}/send',
    ])
  })
})
