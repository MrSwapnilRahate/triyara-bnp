// @vitest-environment node
import { buildAbilityFor, type Role } from '@triyara/auth'
import { ConflictError, NotFoundError, PreconditionFailedError } from '@triyara/lib'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The review decision route (TRY-BNP-SUPPLIER-REG). The workflow itself is
// tested where it lives; these assert the HTTP contract of the door onto it.

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

const supplierMasterService = { decide: vi.fn() }
vi.mock('@/lib/supplier-master-service', () => ({
  supplierMasterService,
  supplierOfferingService: {},
  supplierContactService: {},
  supplierCertificationService: {},
  supplierDocumentService: {},
  supplierNoteService: {},
}))

const { POST: decide } = await import('./route')

const params = (id: string) => ({ params: Promise.resolve({ id }) })
const req = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('http://t.test/api/suppliers/s1/approval', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })

const approved = {
  id: 's1',
  supplierCode: 'REG-ABCDEF0123',
  status: 'APPROVED',
  isVerified: true,
  version: 3,
}

beforeEach(() => {
  vi.clearAllMocks()
  authState.roles = ['ADMIN']
})

describe('POST /api/suppliers/:id/approval', () => {
  it('requires If-Match and answers 428 without it', async () => {
    const res = await decide(req({ decision: 'APPROVED' }), params('s1'))
    expect(res.status).toBe(428)
    expect(supplierMasterService.decide).not.toHaveBeenCalled()
  })

  it('approves, forwarding the version from If-Match', async () => {
    supplierMasterService.decide.mockResolvedValue(approved)
    const res = await decide(
      req({ decision: 'APPROVED', comments: 'Documents check out.' }, { 'If-Match': 'W/"v2"' }),
      params('s1'),
    )

    expect(res.status).toBe(200)
    expect(res.headers.get('ETag')).toBe('W/"v3"')
    expect(supplierMasterService.decide).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org1' }),
      's1',
      2,
      expect.objectContaining({ decision: 'APPROVED', comments: 'Documents check out.' }),
    )
  })

  it('rejects with a reason', async () => {
    supplierMasterService.decide.mockResolvedValue({ ...approved, status: 'REJECTED' })
    const res = await decide(
      req({ decision: 'REJECTED', comments: 'No IEC on file.' }, { 'If-Match': 'W/"v2"' }),
      params('s1'),
    )
    expect(res.status).toBe(200)
  })

  it('refuses a decision the state machine does not allow', async () => {
    // An already-approved supplier cannot be approved again. The service owns
    // that rule; the route must surface it as a conflict rather than a 500.
    supplierMasterService.decide.mockRejectedValue(
      new ConflictError('Cannot move an APPROVED supplier to APPROVED.'),
    )
    const res = await decide(req({ decision: 'APPROVED' }, { 'If-Match': 'W/"v2"' }), params('s1'))
    expect(res.status).toBe(409)
  })

  it('maps a second reviewer working from a stale page to 412', async () => {
    supplierMasterService.decide.mockRejectedValue(new PreconditionFailedError())
    const res = await decide(req({ decision: 'APPROVED' }, { 'If-Match': 'W/"v1"' }), params('s1'))
    expect(res.status).toBe(412)
  })

  it('treats a supplier in another organization as absent', async () => {
    supplierMasterService.decide.mockRejectedValue(new NotFoundError('Supplier not found.'))
    const res = await decide(req({ decision: 'APPROVED' }, { 'If-Match': 'W/"v2"' }), params('sX'))
    expect(res.status).toBe(404)
  })

  it('refuses an unknown decision with 422', async () => {
    const res = await decide(req({ decision: 'MAYBE' }, { 'If-Match': 'W/"v2"' }), params('s1'))
    expect(res.status).toBe(422)
    expect(supplierMasterService.decide).not.toHaveBeenCalled()
  })
})
