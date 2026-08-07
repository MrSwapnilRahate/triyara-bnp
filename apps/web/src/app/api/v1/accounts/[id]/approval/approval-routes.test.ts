// @vitest-environment node
import { buildAbilityFor, type Role } from '@triyara/auth'
import { ConflictError, ForbiddenError, NotFoundError, PreconditionFailedError } from '@triyara/lib'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The buyer review decision route. The workflow is tested where it lives; these
// assert the HTTP contract of the door onto it.

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

const buyerRegistrationService = { decide: vi.fn(), approvalHistory: vi.fn() }
vi.mock('@/lib/buyer-registration-service', () => ({ buyerRegistrationService }))

const { POST: decide, GET: history } = await import('./route')

const params = (id: string) => ({ params: Promise.resolve({ id }) })
const req = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('http://t.test/api/v1/accounts/acc1/approval', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })

const approved = { id: 'acc1', registrationStatus: 'APPROVED', isVerified: true, version: 3 }

beforeEach(() => {
  vi.clearAllMocks()
  authState.roles = ['ADMIN']
})

describe('POST /v1/accounts/:id/approval', () => {
  it('requires If-Match and answers 428 without it', async () => {
    const res = await decide(req({ decision: 'APPROVED' }), params('acc1'))
    expect(res.status).toBe(428)
    expect(buyerRegistrationService.decide).not.toHaveBeenCalled()
  })

  it('approves and verifies, forwarding the version from If-Match', async () => {
    buyerRegistrationService.decide.mockResolvedValue(approved)
    const res = await decide(
      req({ decision: 'APPROVED', comments: 'Documents check out.' }, { 'If-Match': 'W/"v2"' }),
      params('acc1'),
    )

    expect(res.status).toBe(200)
    expect(res.headers.get('ETag')).toBe('W/"v3"')
    expect(buyerRegistrationService.decide).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org1' }),
      'acc1',
      2,
      expect.objectContaining({ decision: 'APPROVED', comments: 'Documents check out.' }),
    )
  })

  it('refuses a decision the state machine does not allow', async () => {
    buyerRegistrationService.decide.mockRejectedValue(
      new ConflictError('Cannot move an APPROVED buyer to APPROVED.'),
    )
    const res = await decide(
      req({ decision: 'APPROVED' }, { 'If-Match': 'W/"v2"' }),
      params('acc1'),
    )
    expect(res.status).toBe(409)
  })

  it('maps a second reviewer working from a stale page to 412', async () => {
    buyerRegistrationService.decide.mockRejectedValue(new PreconditionFailedError())
    const res = await decide(
      req({ decision: 'APPROVED' }, { 'If-Match': 'W/"v1"' }),
      params('acc1'),
    )
    expect(res.status).toBe(412)
  })

  it('treats an account in another organization as absent', async () => {
    buyerRegistrationService.decide.mockRejectedValue(new NotFoundError('Account not found.'))
    const res = await decide(
      req({ decision: 'APPROVED' }, { 'If-Match': 'W/"v2"' }),
      params('accX'),
    )
    expect(res.status).toBe(404)
  })

  it('refuses an unknown decision with 422', async () => {
    const res = await decide(req({ decision: 'MAYBE' }, { 'If-Match': 'W/"v2"' }), params('acc1'))
    expect(res.status).toBe(422)
    expect(buyerRegistrationService.decide).not.toHaveBeenCalled()
  })

  it('refuses a reviewer who may edit accounts but not decide them', async () => {
    authState.roles = ['EXPORT_MANAGER']
    buyerRegistrationService.decide.mockRejectedValue(new ForbiddenError())
    const res = await decide(
      req({ decision: 'APPROVED' }, { 'If-Match': 'W/"v2"' }),
      params('acc1'),
    )
    expect(res.status).toBe(403)
  })
})

describe('GET /v1/accounts/:id/approval', () => {
  it('returns the decision trail', async () => {
    buyerRegistrationService.approvalHistory.mockResolvedValue([
      { id: 'a1', fromStatus: null, toStatus: 'PENDING_REVIEW', decision: 'SUBMITTED' },
      { id: 'a2', fromStatus: 'PENDING_REVIEW', toStatus: 'APPROVED', decision: 'APPROVED' },
    ])
    const res = await history(
      new Request('http://t.test/api/v1/accounts/acc1/approval'),
      params('acc1'),
    )
    const b = (await res.json()) as { data: unknown[]; meta: { accountId: string } }

    expect(res.status).toBe(200)
    expect(b.data).toHaveLength(2)
    expect(b.meta.accountId).toBe('acc1')
  })
})
