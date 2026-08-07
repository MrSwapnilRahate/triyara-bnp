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

const rfqService = {
  list: vi.fn(),
  get: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  reviseItems: vi.fn(),
  issue: vi.fn(),
  close: vi.fn(),
  award: vi.fn(),
  reopen: vi.fn(),
  decide: vi.fn(),
  approvalHistory: vi.fn(),
  revisionHistory: vi.fn(),
}
const rfqSupplierService = {
  listResponsesForRfq: vi.fn(),
  submitResponseForRfq: vi.fn(),
  list: vi.fn(),
  invite: vi.fn(),
  setParticipation: vi.fn(),
}

vi.mock('@/lib/rfq-service', () => ({ rfqService, rfqSupplierService }))

const { GET: listRfqs, POST: createRfq } = await import('./route')
const { GET: getRfq, PATCH: patchRfq, DELETE: deleteRfq } = await import('./[id]/route')
const { GET: listItems, POST: replaceItems } = await import('./[id]/items/route')
const { GET: listResponses, POST: submitResponse } = await import('./[id]/responses/route')
const { POST: publishRfq } = await import('./[id]/publish/route')
const { POST: closeRfq } = await import('./[id]/close/route')
const { POST: reopenRfq } = await import('./[id]/reopen/route')
const { POST: awardRfq } = await import('./[id]/award/route')
const { GET: listSuppliers, POST: inviteSuppliers } = await import('./[id]/suppliers/route')
const { PATCH: setParticipation } = await import('./[id]/suppliers/[participationId]/route')
const { GET: listApprovals, POST: decideRfq } = await import('./[id]/approvals/route')
const { GET: listRevisions } = await import('./[id]/revisions/route')
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

const rfq = (over: Record<string, unknown> = {}) => ({
  id: 'r1',
  rfqNumber: 'RFQ-2026-000001',
  type: 'BUYER',
  buyerId: 'acc1',
  title: 'Q3 spices',
  status: 'DRAFT',
  priority: 'NORMAL',
  currentRevision: 1,
  version: 3,
  items: [{ id: 'i1', lineNumber: 1 }],
  suppliers: [{ id: 'rs1' }],
  ...over,
})

const validItem = { quantity: 10, unit: 'MT', productId: 'p1', requiredCertifications: [] }
const validCreate = {
  rfqNumber: 'RFQ-2026-000001',
  title: 'Q3 spices',
  buyerId: 'acc1',
  items: [validItem],
}

beforeEach(() => {
  vi.clearAllMocks()
  authState.roles = ['ADMIN']
})

describe('GET /api/rfqs', () => {
  it('returns the envelope with pagination, filters and sort in meta', async () => {
    rfqService.list.mockResolvedValue({ items: [rfq()], nextCursor: 'cur1' })
    const res = await listRfqs(req('/api/rfqs?limit=5&status=ISSUED&priority=HIGH'))
    const b = await body(res)
    expect(res.status).toBe(200)
    expect(b.success).toBe(true)
    expect(b.errors).toBeNull()
    expect(b.meta.pagination).toEqual({ limit: 5, nextCursor: 'cur1' })
    expect(b.meta.filters).toMatchObject({ status: 'ISSUED', priority: 'HIGH' })
    expect(b.meta.sort).toBe('-createdAt')
  })

  it('forwards the parsed query to the service', async () => {
    rfqService.list.mockResolvedValue({ items: [], nextCursor: null })
    await listRfqs(req('/api/rfqs?limit=7&q=spice&supplierId=s1'))
    expect(rfqService.list).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org1' }),
      expect.objectContaining({ limit: 7, q: 'spice', supplierId: 's1' }),
    )
  })

  it('rejects an out-of-range limit with 422 and names the field', async () => {
    const res = await listRfqs(req('/api/rfqs?limit=500'))
    const b = await body(res)
    expect(res.status).toBe(422)
    expect(b.errors?.[0]?.field).toBe('limit')
    expect(rfqService.list).not.toHaveBeenCalled()
  })

  it('rejects an unknown status filter', async () => {
    expect((await listRfqs(req('/api/rfqs?status=WIZARD'))).status).toBe(422)
  })

  it('rejects an unknown sort value', async () => {
    expect((await listRfqs(req('/api/rfqs?sort=title'))).status).toBe(422)
  })

  it('propagates the caller request id', async () => {
    rfqService.list.mockResolvedValue({ items: [], nextCursor: null })
    const res = await listRfqs(req('/api/rfqs', { headers: { 'x-request-id': 'req-abc' } }))
    expect((await body(res)).meta.requestId).toBe('req-abc')
  })

  it('generates a request id when the caller supplies none', async () => {
    rfqService.list.mockResolvedValue({ items: [], nextCursor: null })
    expect((await body(await listRfqs(req('/api/rfqs')))).meta.requestId).toMatch(/[0-9a-f-]{36}/)
  })

  it('surfaces an authorization failure as 403', async () => {
    rfqService.list.mockRejectedValue(new ForbiddenError())
    expect((await listRfqs(req('/api/rfqs'))).status).toBe(403)
  })
})

describe('POST /api/rfqs', () => {
  it('creates with lines in one request and returns 201 + ETag', async () => {
    rfqService.create.mockResolvedValue(rfq({ version: 1 }))
    const res = await createRfq(
      req('/api/rfqs', { method: 'POST', body: JSON.stringify(validCreate) }),
    )
    expect(res.status).toBe(201)
    expect(res.headers.get('ETag')).toBe('W/"v1"')
  })

  it('separates the header from the items before delegating', async () => {
    rfqService.create.mockResolvedValue(rfq({ version: 1 }))
    await createRfq(req('/api/rfqs', { method: 'POST', body: JSON.stringify(validCreate) }))
    const [, header, items] = rfqService.create.mock.calls[0]!
    expect(header).not.toHaveProperty('items')
    expect(header).toMatchObject({ rfqNumber: 'RFQ-2026-000001' })
    expect(items).toHaveLength(1)
  })

  it('rejects a create with no items', async () => {
    const res = await createRfq(
      req('/api/rfqs', {
        method: 'POST',
        body: JSON.stringify({ ...validCreate, items: [] }),
      }),
    )
    expect(res.status).toBe(422)
    expect(rfqService.create).not.toHaveBeenCalled()
  })

  it('rejects a create with no items key at all', async () => {
    const { items: _items, ...noItems } = validCreate
    const res = await createRfq(req('/api/rfqs', { method: 'POST', body: JSON.stringify(noItems) }))
    expect(res.status).toBe(422)
  })

  it('rejects a malformed rfqNumber', async () => {
    const res = await createRfq(
      req('/api/rfqs', {
        method: 'POST',
        body: JSON.stringify({ ...validCreate, rfqNumber: 'rfq lowercase' }),
      }),
    )
    expect(res.status).toBe(422)
  })

  it('maps a duplicate RFQ number to 409', async () => {
    rfqService.create.mockRejectedValue(new ConflictError('exists'))
    const res = await createRfq(
      req('/api/rfqs', { method: 'POST', body: JSON.stringify(validCreate) }),
    )
    expect(res.status).toBe(409)
  })
})

describe('GET /api/rfqs/:id', () => {
  it('returns the record and its ETag', async () => {
    rfqService.get.mockResolvedValue(rfq())
    const res = await getRfq(req('/api/rfqs/r1'), params('r1'))
    expect(res.status).toBe(200)
    expect(res.headers.get('ETag')).toBe('W/"v3"')
  })

  it('maps a missing record to 404', async () => {
    rfqService.get.mockRejectedValue(new NotFoundError('RFQ not found.'))
    expect((await getRfq(req('/api/rfqs/nope'), params('nope'))).status).toBe(404)
  })

  it('takes the id from the path', async () => {
    rfqService.get.mockResolvedValue(rfq())
    await getRfq(req('/api/rfqs/r9'), params('r9'))
    expect(rfqService.get).toHaveBeenCalledWith(expect.anything(), 'r9')
  })
})

describe('PATCH /api/rfqs/:id', () => {
  it('answers 428 without If-Match', async () => {
    const res = await patchRfq(
      req('/api/rfqs/r1', { method: 'PATCH', body: JSON.stringify({ title: 'x' }) }),
      params('r1'),
    )
    expect(res.status).toBe(428)
    expect(rfqService.update).not.toHaveBeenCalled()
  })

  it('forwards the parsed version from If-Match', async () => {
    rfqService.update.mockResolvedValue(rfq({ version: 4 }))
    const res = await patchRfq(
      req('/api/rfqs/r1', {
        method: 'PATCH',
        headers: { 'if-match': 'W/"v3"' },
        body: JSON.stringify({ title: 'Revised' }),
      }),
      params('r1'),
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('ETag')).toBe('W/"v4"')
    expect(rfqService.update).toHaveBeenCalledWith(
      expect.anything(),
      'r1',
      3,
      expect.objectContaining({ title: 'Revised' }),
    )
  })

  it('maps a stale version to 412', async () => {
    rfqService.update.mockRejectedValue(new PreconditionFailedError())
    const res = await patchRfq(
      req('/api/rfqs/r1', {
        method: 'PATCH',
        headers: { 'if-match': 'W/"v1"' },
        body: JSON.stringify({ title: 'x' }),
      }),
      params('r1'),
    )
    expect(res.status).toBe(412)
  })

  it('surfaces a frozen-terms conflict as 409', async () => {
    rfqService.update.mockRejectedValue(new ConflictError('terms frozen'))
    const res = await patchRfq(
      req('/api/rfqs/r1', {
        method: 'PATCH',
        headers: { 'if-match': 'W/"v3"' },
        body: JSON.stringify({ currency: 'EUR' }),
      }),
      params('r1'),
    )
    expect(res.status).toBe(409)
  })
})

describe('DELETE /api/rfqs/:id', () => {
  it('requires If-Match', async () => {
    expect((await deleteRfq(req('/api/rfqs/r1', { method: 'DELETE' }), params('r1'))).status).toBe(
      428,
    )
    expect(rfqService.remove).not.toHaveBeenCalled()
  })

  it('soft-deletes with the parsed version', async () => {
    rfqService.remove.mockResolvedValue(rfq({ version: 4, deletedAt: new Date().toISOString() }))
    const res = await deleteRfq(
      req('/api/rfqs/r1', { method: 'DELETE', headers: { 'if-match': 'W/"v3"' } }),
      params('r1'),
    )
    expect(res.status).toBe(200)
    expect(rfqService.remove).toHaveBeenCalledWith(expect.anything(), 'r1', 3)
  })
})

describe('GET /api/rfqs/:id/items', () => {
  it('returns the lines with RFQ context in meta', async () => {
    rfqService.get.mockResolvedValue(rfq())
    const res = await listItems(req('/api/rfqs/r1/items'), params('r1'))
    const b = await body(res)
    expect(res.status).toBe(200)
    expect(b.data).toHaveLength(1)
    expect(b.meta).toMatchObject({ rfqId: 'r1', rfqNumber: 'RFQ-2026-000001', count: 1 })
  })
})

describe('POST /api/rfqs/:id/items', () => {
  it('requires If-Match', async () => {
    const res = await replaceItems(
      req('/api/rfqs/r1/items', { method: 'POST', body: JSON.stringify({ items: [validItem] }) }),
      params('r1'),
    )
    expect(res.status).toBe(428)
    expect(rfqService.reviseItems).not.toHaveBeenCalled()
  })

  it('replaces the set, returns 201 and reports the new revision', async () => {
    rfqService.reviseItems.mockResolvedValue(rfq({ version: 4, currentRevision: 2 }))
    const res = await replaceItems(
      req('/api/rfqs/r1/items', {
        method: 'POST',
        headers: { 'if-match': 'W/"v3"' },
        body: JSON.stringify({ items: [validItem], reason: 'Buyer raised quantities.' }),
      }),
      params('r1'),
    )
    const b = await body(res)
    expect(res.status).toBe(201)
    expect(res.headers.get('ETag')).toBe('W/"v4"')
    expect(b.meta.revision).toBe(2)
    expect(rfqService.reviseItems).toHaveBeenCalledWith(
      expect.anything(),
      'r1',
      3,
      expect.objectContaining({ items: expect.any(Array) }),
      'Buyer raised quantities.',
    )
  })

  it('rejects an empty item set', async () => {
    const res = await replaceItems(
      req('/api/rfqs/r1/items', {
        method: 'POST',
        headers: { 'if-match': 'W/"v3"' },
        body: JSON.stringify({ items: [] }),
      }),
      params('r1'),
    )
    expect(res.status).toBe(422)
  })
})

describe('GET /api/rfqs/:id/responses', () => {
  it('scopes the listing to the RFQ in the path', async () => {
    rfqSupplierService.listResponsesForRfq.mockResolvedValue({ items: [], nextCursor: null })
    const res = await listResponses(req('/api/rfqs/r1/responses?limit=5'), params('r1'))
    expect(res.status).toBe(200)
    expect(rfqSupplierService.listResponsesForRfq).toHaveBeenCalledWith(
      expect.anything(),
      'r1',
      expect.objectContaining({ limit: 5 }),
    )
    expect((await body(res)).meta.rfqId).toBe('r1')
  })

  it('defaults currentOnly to true in reported meta', async () => {
    rfqSupplierService.listResponsesForRfq.mockResolvedValue({ items: [], nextCursor: null })
    const b = await body(await listResponses(req('/api/rfqs/r1/responses'), params('r1')))
    expect((b.meta.filters as { currentOnly: string }).currentOnly).toBe('true')
  })

  it('rejects a non-boolean currentOnly', async () => {
    const res = await listResponses(req('/api/rfqs/r1/responses?currentOnly=maybe'), params('r1'))
    expect(res.status).toBe(422)
  })
})

describe('POST /api/rfqs/:id/responses', () => {
  it('submits against the participation named in the body', async () => {
    rfqSupplierService.submitResponseForRfq.mockResolvedValue({ participation: {}, lines: [{}] })
    const res = await submitResponse(
      req('/api/rfqs/r1/responses', {
        method: 'POST',
        body: JSON.stringify({
          rfqSupplierId: 'rs1',
          lines: [{ rfqItemId: 'i1', price: 100, currency: 'USD' }],
        }),
      }),
      params('r1'),
    )
    expect(res.status).toBe(201)
    const [, rfqId, rfqSupplierId, dto] = rfqSupplierService.submitResponseForRfq.mock.calls[0]!
    expect(rfqId).toBe('r1')
    expect(rfqSupplierId).toBe('rs1')
    expect(dto).not.toHaveProperty('rfqSupplierId')
    expect(dto.lines).toHaveLength(1)
  })

  it('requires rfqSupplierId', async () => {
    const res = await submitResponse(
      req('/api/rfqs/r1/responses', {
        method: 'POST',
        body: JSON.stringify({ lines: [{ rfqItemId: 'i1', price: 100, currency: 'USD' }] }),
      }),
      params('r1'),
    )
    expect(res.status).toBe(422)
    expect(rfqSupplierService.submitResponseForRfq).not.toHaveBeenCalled()
  })

  it('rejects a bid with no lines', async () => {
    const res = await submitResponse(
      req('/api/rfqs/r1/responses', {
        method: 'POST',
        body: JSON.stringify({ rfqSupplierId: 'rs1', lines: [] }),
      }),
      params('r1'),
    )
    expect(res.status).toBe(422)
  })

  it('maps a participation on another RFQ to 404', async () => {
    rfqSupplierService.submitResponseForRfq.mockRejectedValue(
      new NotFoundError('Supplier participation not found on this RFQ.'),
    )
    const res = await submitResponse(
      req('/api/rfqs/r1/responses', {
        method: 'POST',
        body: JSON.stringify({
          rfqSupplierId: 'foreign',
          lines: [{ rfqItemId: 'i1', price: 100, currency: 'USD' }],
        }),
      }),
      params('r1'),
    )
    expect(res.status).toBe(404)
  })

  it('maps a bid outside the bidding window to 409', async () => {
    rfqSupplierService.submitResponseForRfq.mockRejectedValue(new ConflictError('closed'))
    const res = await submitResponse(
      req('/api/rfqs/r1/responses', {
        method: 'POST',
        body: JSON.stringify({
          rfqSupplierId: 'rs1',
          lines: [{ rfqItemId: 'i1', price: 100, currency: 'USD' }],
        }),
      }),
      params('r1'),
    )
    expect(res.status).toBe(409)
  })
})

describe('workflow endpoints', () => {
  const cases = [
    ['publish', publishRfq, 'issue', 'ISSUED'],
    ['close', closeRfq, 'close', 'CLOSED'],
    ['reopen', reopenRfq, 'reopen', 'DRAFT'],
  ] as const

  for (const [name, handler, method, status] of cases) {
    it(`${name} requires If-Match`, async () => {
      const res = await handler(req(`/api/rfqs/r1/${name}`, { method: 'POST' }), params('r1'))
      expect(res.status).toBe(428)
      expect(rfqService[method]).not.toHaveBeenCalled()
    })

    it(`${name} delegates to ${method}() and reports the new status`, async () => {
      rfqService[method].mockResolvedValue(rfq({ status, version: 4 }))
      const res = await handler(
        req(`/api/rfqs/r1/${name}`, { method: 'POST', headers: { 'if-match': 'W/"v3"' } }),
        params('r1'),
      )
      const b = await body(res)
      expect(res.status).toBe(200)
      expect(res.headers.get('ETag')).toBe('W/"v4"')
      expect(b.meta.status).toBe(status)
      expect(rfqService[method]).toHaveBeenCalledWith(expect.anything(), 'r1', 3)
    })

    it(`${name} maps an illegal transition to 409`, async () => {
      rfqService[method].mockRejectedValue(new ConflictError('illegal'))
      const res = await handler(
        req(`/api/rfqs/r1/${name}`, { method: 'POST', headers: { 'if-match': 'W/"v3"' } }),
        params('r1'),
      )
      expect(res.status).toBe(409)
    })
  }

  it('reopen surfaces a non-admin refusal as 403', async () => {
    rfqService.reopen.mockRejectedValue(new ForbiddenError())
    const res = await reopenRfq(
      req('/api/rfqs/r1/reopen', { method: 'POST', headers: { 'if-match': 'W/"v3"' } }),
      params('r1'),
    )
    expect(res.status).toBe(403)
  })
})

describe('supplier invitation', () => {
  it('lists invited suppliers with a submitted count in meta', async () => {
    rfqSupplierService.list.mockResolvedValue([
      { id: 'rs1', supplierId: 's1', status: 'INVITED' },
      { id: 'rs2', supplierId: 's2', status: 'SUBMITTED' },
    ])
    const res = await listSuppliers(req('/api/rfqs/r1/suppliers'), params('r1'))
    const b = await body(res)
    expect(res.status).toBe(200)
    expect(b.data).toHaveLength(2)
    expect(b.meta).toMatchObject({ rfqId: 'r1', count: 2, submitted: 1 })
    expect(rfqSupplierService.list).toHaveBeenCalledWith(expect.anything(), 'r1')
  })

  it('invites and returns 200, not 201 - inviting is idempotent per supplier', async () => {
    rfqSupplierService.invite.mockResolvedValue([{ id: 'rs1' }, { id: 'rs2' }])
    const res = await inviteSuppliers(
      req('/api/rfqs/r1/suppliers', {
        method: 'POST',
        body: JSON.stringify({ supplierIds: ['s1', 's2'] }),
      }),
      params('r1'),
    )
    const b = await body(res)
    expect(res.status).toBe(200)
    expect(b.meta).toMatchObject({ requested: 2, total: 2 })
    expect(rfqSupplierService.invite).toHaveBeenCalledWith(expect.anything(), 'r1', {
      supplierIds: ['s1', 's2'],
    })
  })

  it('rejects an empty supplier list', async () => {
    const res = await inviteSuppliers(
      req('/api/rfqs/r1/suppliers', { method: 'POST', body: JSON.stringify({ supplierIds: [] }) }),
      params('r1'),
    )
    expect(res.status).toBe(422)
    expect(rfqSupplierService.invite).not.toHaveBeenCalled()
  })

  it('maps an invitation to a closed RFQ to 409', async () => {
    rfqSupplierService.invite.mockRejectedValue(new ConflictError('closed'))
    const res = await inviteSuppliers(
      req('/api/rfqs/r1/suppliers', {
        method: 'POST',
        body: JSON.stringify({ supplierIds: ['s1'] }),
      }),
      params('r1'),
    )
    expect(res.status).toBe(409)
  })

  it('requires If-Match to change a participation', async () => {
    const res = await setParticipation(
      req('/api/rfqs/r1/suppliers/rs1', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'ACCEPTED' }),
      }),
      { params: Promise.resolve({ id: 'r1', participationId: 'rs1' }) },
    )
    expect(res.status).toBe(428)
    expect(rfqSupplierService.setParticipation).not.toHaveBeenCalled()
  })

  it('forwards the parsed version and reports the new status', async () => {
    rfqSupplierService.setParticipation.mockResolvedValue({
      id: 'rs1',
      status: 'ACCEPTED',
      version: 3,
    })
    const res = await setParticipation(
      req('/api/rfqs/r1/suppliers/rs1', {
        method: 'PATCH',
        headers: { 'if-match': 'W/"v2"' },
        body: JSON.stringify({ status: 'ACCEPTED' }),
      }),
      { params: Promise.resolve({ id: 'r1', participationId: 'rs1' }) },
    )
    const b = await body(res)
    expect(res.status).toBe(200)
    expect(res.headers.get('ETag')).toBe('W/"v3"')
    expect(b.meta.status).toBe('ACCEPTED')
    expect(rfqSupplierService.setParticipation).toHaveBeenCalledWith(expect.anything(), 'rs1', 2, {
      status: 'ACCEPTED',
    })
  })

  it('surfaces the service refusing SUBMITTED as 409', async () => {
    rfqSupplierService.setParticipation.mockRejectedValue(
      new ConflictError('Submit a response instead of setting SUBMITTED directly.'),
    )
    const res = await setParticipation(
      req('/api/rfqs/r1/suppliers/rs1', {
        method: 'PATCH',
        headers: { 'if-match': 'W/"v2"' },
        body: JSON.stringify({ status: 'SUBMITTED' }),
      }),
      { params: Promise.resolve({ id: 'r1', participationId: 'rs1' }) },
    )
    expect(res.status).toBe(409)
  })

  it('rejects an unknown participation status', async () => {
    const res = await setParticipation(
      req('/api/rfqs/r1/suppliers/rs1', {
        method: 'PATCH',
        headers: { 'if-match': 'W/"v2"' },
        body: JSON.stringify({ status: 'WIZARD' }),
      }),
      { params: Promise.resolve({ id: 'r1', participationId: 'rs1' }) },
    )
    expect(res.status).toBe(422)
  })
})

describe('approvals', () => {
  it('records a decision and returns 201 with the new status', async () => {
    rfqService.decide.mockResolvedValue(rfq({ status: 'PENDING_APPROVAL', version: 2 }))
    const res = await decideRfq(
      req('/api/rfqs/r1/approvals', {
        method: 'POST',
        headers: { 'if-match': 'W/"v1"' },
        body: JSON.stringify({ decision: 'PENDING', comments: 'Looks right.' }),
      }),
      params('r1'),
    )
    expect(res.status).toBe(201)
    expect(res.headers.get('etag')).toBe('W/"v2"')
    const payload = await body(res)
    expect(payload.meta).toMatchObject({ status: 'PENDING_APPROVAL', decision: 'PENDING' })
    expect(rfqService.decide).toHaveBeenCalledWith(
      expect.anything(),
      'r1',
      1,
      expect.objectContaining({ decision: 'PENDING' }),
    )
  })

  it('requires If-Match', async () => {
    const res = await decideRfq(
      req('/api/rfqs/r1/approvals', {
        method: 'POST',
        body: JSON.stringify({ decision: 'PENDING' }),
      }),
      params('r1'),
    )
    expect(res.status).toBe(428)
    expect(rfqService.decide).not.toHaveBeenCalled()
  })

  it('rejects a decision outside the vocabulary', async () => {
    const res = await decideRfq(
      req('/api/rfqs/r1/approvals', {
        method: 'POST',
        headers: { 'if-match': 'W/"v1"' },
        body: JSON.stringify({ decision: 'MAYBE' }),
      }),
      params('r1'),
    )
    expect(res.status).toBe(422)
    expect(rfqService.decide).not.toHaveBeenCalled()
  })

  it('surfaces an illegal transition as 409', async () => {
    rfqService.decide.mockRejectedValue(
      new ConflictError(
        'Cannot move a DRAFT RFQ to APPROVED. Allowed: PENDING_APPROVAL, CANCELLED.',
      ),
    )
    const res = await decideRfq(
      req('/api/rfqs/r1/approvals', {
        method: 'POST',
        headers: { 'if-match': 'W/"v1"' },
        body: JSON.stringify({ decision: 'APPROVED' }),
      }),
      params('r1'),
    )
    expect(res.status).toBe(409)
    expect((await body(res)).errors?.[0]?.message).toContain('PENDING_APPROVAL')
  })

  it('lists the decision trail with a count', async () => {
    rfqService.approvalHistory.mockResolvedValue([
      { id: 'a2', sequence: 2, toStatus: 'APPROVED' },
      { id: 'a1', sequence: 1, toStatus: 'PENDING' },
    ])
    const res = await listApprovals(req('/api/rfqs/r1/approvals'), params('r1'))
    expect(res.status).toBe(200)
    expect((await body(res)).meta).toMatchObject({ rfqId: 'r1', count: 2 })
  })

  it('is refused for a role without manage', async () => {
    rfqService.decide.mockRejectedValue(new ForbiddenError('Not permitted.'))
    const res = await decideRfq(
      req('/api/rfqs/r1/approvals', {
        method: 'POST',
        headers: { 'if-match': 'W/"v1"' },
        body: JSON.stringify({ decision: 'APPROVED' }),
      }),
      params('r1'),
    )
    expect(res.status).toBe(403)
  })
})

describe('revisions', () => {
  it('reports the current revision in meta', async () => {
    rfqService.revisionHistory.mockResolvedValue([
      { id: 'v2', revisionNumber: 2 },
      { id: 'v1', revisionNumber: 1 },
    ])
    const res = await listRevisions(req('/api/rfqs/r1/revisions'), params('r1'))
    expect(res.status).toBe(200)
    expect((await body(res)).meta).toMatchObject({ rfqId: 'r1', count: 2, currentRevision: 2 })
  })

  it('reports revision 0 when there are none', async () => {
    rfqService.revisionHistory.mockResolvedValue([])
    const res = await listRevisions(req('/api/rfqs/r1/revisions'), params('r1'))
    expect((await body(res)).meta).toMatchObject({ count: 0, currentRevision: 0 })
  })

  it('reports a missing RFQ as 404', async () => {
    rfqService.revisionHistory.mockRejectedValue(new NotFoundError('RFQ not found.'))
    const res = await listRevisions(req('/api/rfqs/nope/revisions'), params('nope'))
    expect(res.status).toBe(404)
  })
})

describe('GET /api/rfqs/openapi.json', () => {
  it('serves a 3.1 document covering every endpoint', async () => {
    const res = await openapi(req('/api/rfqs/openapi.json'))
    const doc = (await res.json()) as { openapi: string; paths: Record<string, unknown> }
    expect(res.status).toBe(200)
    expect(doc.openapi).toBe('3.1.0')
    expect(Object.keys(doc.paths).sort()).toEqual([
      '/',
      '/{id}',
      '/{id}/approvals',
      '/{id}/close',
      '/{id}/items',
      '/{id}/publish',
      '/{id}/reopen',
      '/{id}/responses',
      '/{id}/revisions',
      '/{id}/suppliers',
      '/{id}/suppliers/{participationId}',
    ])
  })
})

describe('POST /api/rfqs/:id/award', () => {
  const AWARDED = { status: 'AWARDED' as const, awardedSupplierId: 's1', version: 4 }

  it('requires If-Match - two reviewers awarding at once must not both win', async () => {
    const res = await awardRfq(
      req('/api/rfqs/r1/award', {
        method: 'POST',
        body: JSON.stringify({ participationId: 'rs1' }),
      }),
      params('r1'),
    )
    expect(res.status).toBe(428)
    expect(rfqService.award).not.toHaveBeenCalled()
  })

  it('delegates to award() and reports the winner', async () => {
    rfqService.award.mockResolvedValue(rfq(AWARDED))
    const res = await awardRfq(
      req('/api/rfqs/r1/award', {
        method: 'POST',
        headers: { 'if-match': 'W/"v3"', 'content-type': 'application/json' },
        body: JSON.stringify({ participationId: 'rs1' }),
      }),
      params('r1'),
    )
    const b = await body(res)
    expect(res.status).toBe(200)
    expect(res.headers.get('ETag')).toBe('W/"v4"')
    expect(b.meta.status).toBe('AWARDED')
    expect(b.meta.awardedSupplierId).toBe('s1')
    expect(rfqService.award).toHaveBeenCalledWith(expect.anything(), 'r1', 3, 'rs1')
  })

  it('rejects a body with no participationId', async () => {
    const res = await awardRfq(
      req('/api/rfqs/r1/award', {
        method: 'POST',
        headers: { 'if-match': 'W/"v3"', 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
      params('r1'),
    )
    expect(res.status).toBe(422)
    expect(rfqService.award).not.toHaveBeenCalled()
  })

  it('maps a stale version to 412', async () => {
    rfqService.award.mockRejectedValue(new PreconditionFailedError())
    const res = await awardRfq(
      req('/api/rfqs/r1/award', {
        method: 'POST',
        headers: { 'if-match': 'W/"v3"', 'content-type': 'application/json' },
        body: JSON.stringify({ participationId: 'rs1' }),
      }),
      params('r1'),
    )
    expect(res.status).toBe(412)
  })

  it('maps an illegal state or a second award to 409', async () => {
    rfqService.award.mockRejectedValue(new ConflictError('already awarded'))
    const res = await awardRfq(
      req('/api/rfqs/r1/award', {
        method: 'POST',
        headers: { 'if-match': 'W/"v3"', 'content-type': 'application/json' },
        body: JSON.stringify({ participationId: 'rs1' }),
      }),
      params('r1'),
    )
    expect(res.status).toBe(409)
  })

  it('maps an unknown participation to 404', async () => {
    rfqService.award.mockRejectedValue(new NotFoundError('nope'))
    const res = await awardRfq(
      req('/api/rfqs/r1/award', {
        method: 'POST',
        headers: { 'if-match': 'W/"v3"', 'content-type': 'application/json' },
        body: JSON.stringify({ participationId: 'gone' }),
      }),
      params('r1'),
    )
    expect(res.status).toBe(404)
  })

  it('surfaces a non-admin refusal as 403', async () => {
    rfqService.award.mockRejectedValue(new ForbiddenError())
    const res = await awardRfq(
      req('/api/rfqs/r1/award', {
        method: 'POST',
        headers: { 'if-match': 'W/"v3"', 'content-type': 'application/json' },
        body: JSON.stringify({ participationId: 'rs1' }),
      }),
      params('r1'),
    )
    expect(res.status).toBe(403)
  })
})
