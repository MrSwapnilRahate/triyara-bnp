// @vitest-environment node
import { buildAbilityFor, type Role } from '@triyara/auth'
import { ForbiddenError, NotFoundError } from '@triyara/lib'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Route layer in isolation: auth context and the service are mocked, so these
// assert the HTTP contract (envelope, status, validation, delegation) rather
// than re-testing service behaviour.

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

const adminService = {
  listAudit: vi.fn(),
  auditForEntity: vi.fn(),
  getOrganization: vi.fn(),
  updateOrganization: vi.fn(),
  getProfile: vi.fn(),
  updateProfile: vi.fn(),
  summary: vi.fn(),
}
vi.mock('@/lib/admin-service', () => ({ adminService }))

const { GET: listAudit } = await import('./audit/route')
const { GET: getOrganization, PATCH: patchOrganization } = await import('./organization/route')
const { GET: getMe, PATCH: patchMe } = await import('./me/route')
const { GET: getSummary } = await import('./dashboard/summary/route')

const req = (url: string, init?: RequestInit) => new Request(`http://t.test${url}`, init)
const body = async (res: Response) =>
  (await res.json()) as {
    success: boolean
    data: never
    meta: { requestId: string; [k: string]: unknown }
    errors: Array<{ code: string; message: string; field?: string }> | null
  }

const auditRow = (over: Record<string, unknown> = {}) => ({
  id: 'a1',
  entityType: 'RFQ',
  entityId: 'r1',
  actorId: 'u1',
  action: 'rfq.issued',
  before: null,
  after: { status: 'ISSUED' },
  requestId: 'req-1',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  authState.roles = ['ADMIN']
})

describe('GET /api/v1/audit', () => {
  it('returns the envelope with pagination and the echoed filters', async () => {
    adminService.listAudit.mockResolvedValue({ items: [auditRow()], nextCursor: 'cur1' })
    const res = await listAudit(req('/api/v1/audit?limit=10&entityType=RFQ'))
    const payload = await body(res)

    expect(res.status).toBe(200)
    expect(payload.success).toBe(true)
    expect(payload.meta.pagination).toEqual({ limit: 10, nextCursor: 'cur1' })
    expect(payload.meta.filters).toMatchObject({ entityType: 'RFQ', actorId: null })
  })

  it('forwards every supported filter to the service', async () => {
    adminService.listAudit.mockResolvedValue({ items: [], nextCursor: null })
    await listAudit(
      req('/api/v1/audit?entityType=Quotation&entityId=q1&actorId=u9&action=quotation.sent&q=sent'),
    )
    expect(adminService.listAudit).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org1' }),
      expect.objectContaining({
        entityType: 'Quotation',
        entityId: 'q1',
        actorId: 'u9',
        action: 'quotation.sent',
        q: 'sent',
      }),
    )
  })

  it('rejects an out-of-range limit with 422 and names the field', async () => {
    const res = await listAudit(req('/api/v1/audit?limit=5000'))
    expect(res.status).toBe(422)
    expect((await body(res)).errors?.[0]?.field).toBe('limit')
    expect(adminService.listAudit).not.toHaveBeenCalled()
  })

  it('surfaces the ADMIN-only refusal as 403', async () => {
    // The trail carries before/after for every entity, so it is gated above
    // ordinary read permission. A non-ADMIN must be refused, not served.
    adminService.listAudit.mockRejectedValue(new ForbiddenError('Not permitted.'))
    const res = await listAudit(req('/api/v1/audit'))
    expect(res.status).toBe(403)
  })

  it('exposes no write verb', async () => {
    const routeModule = await import('./audit/route')
    expect(Object.keys(routeModule).sort()).toEqual(['GET'])
  })

  it('propagates the caller request id', async () => {
    adminService.listAudit.mockResolvedValue({ items: [], nextCursor: null })
    const res = await listAudit(req('/api/v1/audit', { headers: { 'x-request-id': 'req-abc' } }))
    expect((await body(res)).meta.requestId).toBe('req-abc')
  })
})

describe('/api/v1/organization', () => {
  it('returns the caller own organization', async () => {
    adminService.getOrganization.mockResolvedValue({ id: 'org1', name: 'Triyara', slug: 'triyara' })
    const res = await getOrganization(req('/api/v1/organization'))
    expect(res.status).toBe(200)
    expect((await body(res)).data).toMatchObject({ name: 'Triyara' })
  })

  it('renames it', async () => {
    adminService.updateOrganization.mockResolvedValue({ id: 'org1', name: 'Triyara Exports' })
    const res = await patchOrganization(
      req('/api/v1/organization', {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Triyara Exports' }),
      }),
    )
    expect(res.status).toBe(200)
    expect(adminService.updateOrganization).toHaveBeenCalledWith(expect.anything(), {
      name: 'Triyara Exports',
    })
  })

  it('rejects an empty name', async () => {
    const res = await patchOrganization(
      req('/api/v1/organization', { method: 'PATCH', body: JSON.stringify({ name: '   ' }) }),
    )
    expect(res.status).toBe(422)
    expect(adminService.updateOrganization).not.toHaveBeenCalled()
  })

  it('ignores a slug in the payload rather than applying it', async () => {
    // slug is the tenant's stable handle; the schema strips it.
    adminService.updateOrganization.mockResolvedValue({ id: 'org1', name: 'Renamed' })
    await patchOrganization(
      req('/api/v1/organization', {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Renamed', slug: 'hijacked' }),
      }),
    )
    const [, dto] = adminService.updateOrganization.mock.calls[0]!
    expect(dto).toEqual({ name: 'Renamed' })
  })

  it('surfaces a non-ADMIN write as 403', async () => {
    adminService.updateOrganization.mockRejectedValue(new ForbiddenError('Not permitted.'))
    const res = await patchOrganization(
      req('/api/v1/organization', { method: 'PATCH', body: JSON.stringify({ name: 'X' }) }),
    )
    expect(res.status).toBe(403)
  })
})

describe('/api/v1/me', () => {
  const profile = {
    id: 'u1',
    email: 'a@b.com',
    name: 'A',
    roles: ['ADMIN'],
    organizationId: 'org1',
    lastLoginAt: null,
  }

  it('returns the signed-in user profile', async () => {
    adminService.getProfile.mockResolvedValue(profile)
    const res = await getMe(req('/api/v1/me'))
    expect(res.status).toBe(200)
    expect((await body(res)).data).toMatchObject({ email: 'a@b.com', roles: ['ADMIN'] })
  })

  it('renames the caller', async () => {
    adminService.updateProfile.mockResolvedValue({ ...profile, name: 'Ada' })
    const res = await patchMe(
      req('/api/v1/me', { method: 'PATCH', body: JSON.stringify({ name: 'Ada' }) }),
    )
    expect(res.status).toBe(200)
    expect(adminService.updateProfile).toHaveBeenCalledWith(expect.anything(), { name: 'Ada' })
  })

  it('refuses to let a caller change their own email or roles', async () => {
    // Both would be privilege escalation on an endpoint that carries no ability
    // check, so the schema drops them rather than the service having to.
    adminService.updateProfile.mockResolvedValue(profile)
    await patchMe(
      req('/api/v1/me', {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Ada', email: 'root@evil.test', roles: ['ADMIN'] }),
      }),
    )
    const [, dto] = adminService.updateProfile.mock.calls[0]!
    expect(dto).toEqual({ name: 'Ada' })
  })

  it('rejects an empty name', async () => {
    const res = await patchMe(
      req('/api/v1/me', { method: 'PATCH', body: JSON.stringify({ name: '' }) }),
    )
    expect(res.status).toBe(422)
  })

  it('reports a missing user as 404', async () => {
    adminService.getProfile.mockRejectedValue(new NotFoundError('User not found.'))
    expect((await getMe(req('/api/v1/me'))).status).toBe(404)
  })
})

describe('GET /api/v1/dashboard/summary', () => {
  const summary = {
    rfqs: { total: 3, draft: 1, pendingApproval: 1, issued: 1, awarded: 0 },
    quotations: { total: 3, draft: 1, pendingApproval: 0, sent: 1, accepted: 0 },
    suppliers: { total: 3, approved: 2, pendingReview: 1 },
    products: { total: 5, active: 4 },
    pendingApprovals: 1,
  }

  it('returns the counts', async () => {
    adminService.summary.mockResolvedValue(summary)
    const res = await getSummary(req('/api/v1/dashboard/summary'))
    expect(res.status).toBe(200)
    expect((await body(res)).data).toMatchObject({ pendingApprovals: 1 })
  })

  it('is available to a read-only role', async () => {
    // These are counts of records the caller can already list; withholding the
    // count while serving the rows would protect nothing.
    authState.roles = ['READ_ONLY']
    adminService.summary.mockResolvedValue(summary)
    expect((await getSummary(req('/api/v1/dashboard/summary'))).status).toBe(200)
  })

  it('exposes no write verb', async () => {
    const routeModule = await import('./dashboard/summary/route')
    expect(Object.keys(routeModule).sort()).toEqual(['GET'])
  })
})
