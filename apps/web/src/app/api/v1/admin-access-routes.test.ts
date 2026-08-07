// @vitest-environment node
import { buildAbilityFor, type Role } from '@triyara/auth'
import { ConflictError, ForbiddenError, PreconditionFailedError } from '@triyara/lib'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Route layer in isolation: the service and email are mocked, so these assert
// the HTTP contract - envelope, status, If-Match, validation, delegation.

const authState = {
  roles: ['EXPORT_MANAGER'] as Role[],
  organizationId: 'org1',
  userId: 'u1',
  email: 'staff@triyara.test',
}

vi.mock('@/auth/context', () => ({
  requireAuth: vi.fn(async () => ({
    user: {
      id: authState.userId,
      organizationId: authState.organizationId,
      email: authState.email,
      name: 'A Person',
      roles: authState.roles,
    },
    organizationId: authState.organizationId,
    ability: buildAbilityFor(authState.roles),
  })),
}))

const adminAccessRequestService = {
  request: vi.fn(),
  list: vi.fn(),
  approve: vi.fn(),
  reject: vi.fn(),
  revoke: vi.fn(),
  myLatest: vi.fn(),
  exportAll: vi.fn(),
}
vi.mock('@/lib/admin-access-request-service', () => ({ adminAccessRequestService }))

const emailService = { adminAccessRequested: vi.fn() }
vi.mock('@/lib/email', () => ({ emailService }))

const notifyAdminAccessDecision = vi.fn(async () => 'sent')
vi.mock('@/lib/admin-access-notify', () => ({ notifyAdminAccessDecision }))

const { GET: listRequests, POST: createRequest } = await import('./admin-access-requests/route')
const { POST: approveRequest } = await import('./admin-access-requests/[id]/approve/route')
const { POST: rejectRequest } = await import('./admin-access-requests/[id]/reject/route')
const { POST: revokeRequest } = await import('./admin-access-requests/[id]/revoke/route')
const { GET: myRequest } = await import('./admin-access-requests/mine/route')
const { GET: exportCsv } = await import('./admin-access-requests/export/route')

const req = (url: string, init?: RequestInit) => new Request(`http://t.test${url}`, init)
const params = (id: string) => ({ params: Promise.resolve({ id }) })
const body = async (res: Response) =>
  (await res.json()) as {
    success: boolean
    data: never
    meta: { requestId: string; [k: string]: unknown }
    errors: Array<{ code: string; message: string }> | null
  }

const record = (over: Record<string, unknown> = {}) => ({
  id: 'req1',
  organizationId: 'org1',
  userId: 'u1',
  requesterName: 'A Person',
  requesterEmail: 'staff@triyara.test',
  currentRole: 'EXPORT_MANAGER',
  reason: 'I action the supplier review queue every day and need approvals.',
  status: 'PENDING',
  decidedById: null,
  decidedAt: null,
  decisionReason: null,
  version: 1,
  createdAt: new Date('2026-08-01T00:00:00.000Z'),
  updatedAt: new Date('2026-08-01T00:00:00.000Z'),
  ...over,
})

const REASON = 'I action the supplier review queue every day and need approvals.'

beforeEach(() => {
  vi.clearAllMocks()
  emailService.adminAccessRequested.mockResolvedValue({ status: 'sent', id: 'e1', attempts: 1 })
  notifyAdminAccessDecision.mockResolvedValue('sent')
  authState.roles = ['EXPORT_MANAGER']
})

describe('POST /api/v1/admin-access-requests', () => {
  const post = (payload: unknown) =>
    createRequest(
      req('/api/v1/admin-access-requests', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    )

  it('records the request and returns 201', async () => {
    adminAccessRequestService.request.mockResolvedValue(record())
    const res = await post({ reason: REASON })
    const b = await body(res)

    expect(res.status).toBe(201)
    expect(res.headers.get('ETag')).toBe('W/"v1"')
    expect(b.data).toMatchObject({ status: 'PENDING' })
  })

  it('emails the super administrator', async () => {
    adminAccessRequestService.request.mockResolvedValue(record())
    await post({ reason: REASON })
    expect(emailService.adminAccessRequested).toHaveBeenCalledWith(
      expect.objectContaining({
        requesterEmail: 'staff@triyara.test',
        currentRole: 'EXPORT_MANAGER',
      }),
    )
  })

  it('still returns 201 when the email fails, and says so', async () => {
    adminAccessRequestService.request.mockResolvedValue(record())
    emailService.adminAccessRequested.mockResolvedValue({
      status: 'failed',
      error: 'no key',
      attempts: 1,
      retryable: false,
    })
    const res = await post({ reason: REASON })
    expect(res.status).toBe(201)
    expect((await body(res)).meta.notificationEmail).toBe('failed')
  })

  it.each([
    ['no reason', {}],
    ['blank reason', { reason: '   ' }],
    ['reason too short to judge', { reason: 'please' }],
  ])('rejects %s with 422', async (_label, payload) => {
    const res = await post(payload)
    expect(res.status).toBe(422)
    expect(adminAccessRequestService.request).not.toHaveBeenCalled()
  })

  it('maps an existing pending request to 409', async () => {
    adminAccessRequestService.request.mockRejectedValue(new ConflictError('already pending'))
    expect((await post({ reason: REASON })).status).toBe(409)
  })

  it('maps an already-admin requester to 409', async () => {
    adminAccessRequestService.request.mockRejectedValue(
      new ConflictError('You already have administrator access.'),
    )
    expect((await post({ reason: REASON })).status).toBe(409)
  })
})

describe('GET /api/v1/admin-access-requests', () => {
  it('returns the queue for the super administrator', async () => {
    adminAccessRequestService.list.mockResolvedValue({
      items: [record()],
      nextCursor: null,
      counts: { pending: 1, approved: 0, rejected: 0, revoked: 0, total: 1 },
    })
    const res = await listRequests(req('/api/v1/admin-access-requests?status=PENDING'))
    expect(res.status).toBe(200)
    expect((await body(res)).meta.filters).toMatchObject({ status: 'PENDING' })
  })

  it('surfaces a non-super-admin refusal as 403', async () => {
    adminAccessRequestService.list.mockRejectedValue(new ForbiddenError('Only the super admin'))
    expect((await listRequests(req('/api/v1/admin-access-requests'))).status).toBe(403)
  })
})

describe('POST /api/v1/admin-access-requests/:id/approve', () => {
  const post = (headers: Record<string, string> = {}) =>
    approveRequest(
      req('/api/v1/admin-access-requests/req1/approve', { method: 'POST', headers }),
      params('req1'),
    )

  it('requires If-Match', async () => {
    expect((await post()).status).toBe(428)
    expect(adminAccessRequestService.approve).not.toHaveBeenCalled()
  })

  it('approves and reports the new status', async () => {
    adminAccessRequestService.approve.mockResolvedValue({
      request: record({ status: 'APPROVED', version: 2 }),
      requesterUserId: 'u1',
    })
    const res = await post({ 'if-match': 'W/"v1"' })
    const b = await body(res)

    expect(res.status).toBe(200)
    expect(res.headers.get('ETag')).toBe('W/"v2"')
    expect(b.meta.status).toBe('APPROVED')
    expect(adminAccessRequestService.approve).toHaveBeenCalledWith(expect.anything(), 'req1', 1)
    expect(notifyAdminAccessDecision).toHaveBeenCalledWith(expect.anything(), 'approved')
  })

  it('maps a stale version to 412', async () => {
    adminAccessRequestService.approve.mockRejectedValue(new PreconditionFailedError())
    expect((await post({ 'if-match': 'W/"v1"' })).status).toBe(412)
  })

  it('maps a second approval to 409', async () => {
    adminAccessRequestService.approve.mockRejectedValue(new ConflictError('already approved'))
    expect((await post({ 'if-match': 'W/"v1"' })).status).toBe(409)
  })

  it('maps a non-super-admin to 403 and notifies nobody', async () => {
    adminAccessRequestService.approve.mockRejectedValue(new ForbiddenError('not super'))
    expect((await post({ 'if-match': 'W/"v1"' })).status).toBe(403)
    expect(notifyAdminAccessDecision).not.toHaveBeenCalled()
  })
})

describe('POST /api/v1/admin-access-requests/:id/reject', () => {
  const post = (payload: unknown, headers: Record<string, string> = {}) =>
    rejectRequest(
      req('/api/v1/admin-access-requests/req1/reject', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(payload),
      }),
      params('req1'),
    )

  it('requires If-Match', async () => {
    expect((await post({ reason: 'Not needed for this role.' })).status).toBe(428)
  })

  it('requires a reason', async () => {
    // A refusal with no grounds is unusable to the person who receives it.
    const res = await post({}, { 'if-match': 'W/"v1"' })
    expect(res.status).toBe(422)
    expect(adminAccessRequestService.reject).not.toHaveBeenCalled()
  })

  it('requires a reason of substance', async () => {
    expect((await post({ reason: 'no' }, { 'if-match': 'W/"v1"' })).status).toBe(422)
  })

  it('rejects and reports the new status', async () => {
    adminAccessRequestService.reject.mockResolvedValue({
      request: record({ status: 'REJECTED', version: 2, decisionReason: 'Not needed.' }),
      requesterUserId: 'u1',
    })
    const res = await post({ reason: 'Not needed for this role.' }, { 'if-match': 'W/"v1"' })

    expect(res.status).toBe(200)
    expect((await body(res)).meta.status).toBe('REJECTED')
    expect(notifyAdminAccessDecision).toHaveBeenCalledWith(expect.anything(), 'rejected')
  })
})

describe('POST /api/v1/admin-access-requests/:id/revoke', () => {
  const post = (payload: unknown, headers: Record<string, string> = {}) =>
    revokeRequest(
      req('/api/v1/admin-access-requests/req1/revoke', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(payload),
      }),
      params('req1'),
    )

  it('requires If-Match', async () => {
    expect((await post({ reason: 'Left the sourcing team.' })).status).toBe(428)
    expect(adminAccessRequestService.revoke).not.toHaveBeenCalled()
  })

  it('requires a reason of substance', async () => {
    // The person is told why they lost access, so "no" is not enough.
    expect((await post({}, { 'if-match': 'W/"v2"' })).status).toBe(422)
    expect((await post({ reason: 'no' }, { 'if-match': 'W/"v2"' })).status).toBe(422)
    expect(adminAccessRequestService.revoke).not.toHaveBeenCalled()
  })

  it('revokes and reports the new status', async () => {
    adminAccessRequestService.revoke.mockResolvedValue({
      request: record({ status: 'REVOKED', version: 3, revocationReason: 'Left the team.' }),
      requesterUserId: 'u1',
    })
    const res = await post({ reason: 'Left the sourcing team.' }, { 'if-match': 'W/"v2"' })
    const b = await body(res)

    expect(res.status).toBe(200)
    expect(res.headers.get('ETag')).toBe('W/"v3"')
    expect(b.meta.status).toBe('REVOKED')
    expect(adminAccessRequestService.revoke).toHaveBeenCalledWith(expect.anything(), 'req1', 2, {
      reason: 'Left the sourcing team.',
    })
    expect(notifyAdminAccessDecision).toHaveBeenCalledWith(expect.anything(), 'revoked')
  })

  it('maps a stale version to 412', async () => {
    adminAccessRequestService.revoke.mockRejectedValue(new PreconditionFailedError())
    expect((await post({ reason: 'Left the team.' }, { 'if-match': 'W/"v2"' })).status).toBe(412)
  })

  it('maps a non-super-admin to 403 and notifies nobody', async () => {
    adminAccessRequestService.revoke.mockRejectedValue(new ForbiddenError('not super'))
    expect((await post({ reason: 'Left the team.' }, { 'if-match': 'W/"v2"' })).status).toBe(403)
    expect(notifyAdminAccessDecision).not.toHaveBeenCalled()
  })

  it('maps revoking a non-approved request to 409', async () => {
    adminAccessRequestService.revoke.mockRejectedValue(new ConflictError('only approved'))
    expect((await post({ reason: 'Left the team.' }, { 'if-match': 'W/"v2"' })).status).toBe(409)
  })
})

describe('GET /api/v1/admin-access-requests/mine', () => {
  it('returns the caller own latest request', async () => {
    adminAccessRequestService.myLatest.mockResolvedValue(record({ status: 'REVOKED' }))
    const res = await myRequest(req('/api/v1/admin-access-requests/mine'))
    expect(res.status).toBe(200)
    expect((await body(res)).data).toMatchObject({ status: 'REVOKED' })
  })

  it('returns null when they have never asked', async () => {
    adminAccessRequestService.myLatest.mockResolvedValue(null)
    const res = await myRequest(req('/api/v1/admin-access-requests/mine'))
    expect(res.status).toBe(200)
    expect((await body(res)).data).toBeNull()
  })
})

describe('GET /api/v1/admin-access-requests/export', () => {
  const exported = (over: Record<string, unknown> = {}) => ({
    ...record(over),
    organizationName: 'Triyara Exports LLP',
    decidedByName: 'Swapnil Rahate',
    revokedByName: null,
  })

  it('returns a CSV attachment', async () => {
    adminAccessRequestService.exportAll.mockResolvedValue([exported()])
    const res = await exportCsv()

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/csv')
    expect(res.headers.get('content-disposition')).toMatch(
      /attachment; filename="admin-access-requests-\d{4}-\d{2}-\d{2}\.csv"/,
    )
  })

  it('carries a header row and every lifecycle column', async () => {
    adminAccessRequestService.exportAll.mockResolvedValue([
      exported({ status: 'REVOKED', revocationReason: 'Left the team.' }),
    ])
    const text = await (await exportCsv()).text()
    const [header] = text.split('\r\n')

    for (const column of [
      'Requested At',
      'Approved At',
      'Rejected At',
      'Revoked At',
      'Revocation Reason',
    ]) {
      expect(header).toContain(column)
    }
    expect(text).toContain('Left the team.')
  })

  it('escapes quotes and commas rather than breaking the row', async () => {
    adminAccessRequestService.exportAll.mockResolvedValue([
      exported({ reason: 'Because "urgent", and overdue' }),
    ])
    const text = await (await exportCsv()).text()
    expect(text).toContain('"Because ""urgent"", and overdue"')
  })

  it('neutralises a reason that would execute as a spreadsheet formula', async () => {
    // Reasons are written by users. A cell that runs on open is a real hazard.
    adminAccessRequestService.exportAll.mockResolvedValue([exported({ reason: '=cmd|/c calc' })])
    const text = await (await exportCsv()).text()
    expect(text).toContain('"\'=cmd|/c calc"')
  })

  it('refuses a non-super-admin with 403 and no file', async () => {
    adminAccessRequestService.exportAll.mockRejectedValue(new ForbiddenError('not super'))
    const res = await exportCsv()
    expect(res.status).toBe(403)
    expect(res.headers.get('content-type')).not.toContain('text/csv')
  })
})
