// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The helper in isolation, because the field under test - who a decision is
// attributed to - is only distinguishable when the approver and the revoker
// are different people. Stage-1 has one super administrator, so an end-to-end
// run cannot tell `decidedById` and `revokedById` apart.

const createWithRecipients = vi.fn(async () => undefined)
vi.mock('@triyara/db', () => ({
  notificationRepository: {
    createWithRecipients: (...a: unknown[]) => createWithRecipients(...(a as [])),
  },
}))

const emailService = {
  adminAccessApproved: vi.fn(async () => ({ status: 'sent', id: 'e', attempts: 1 })),
  adminAccessRejected: vi.fn(async () => ({ status: 'sent', id: 'e', attempts: 1 })),
  adminAccessRevoked: vi.fn(async () => ({ status: 'sent', id: 'e', attempts: 1 })),
}
vi.mock('@/lib/email', () => ({ emailService }))

const { notifyAdminAccessDecision } = await import('../admin-access-notify')

const result = (over: Record<string, unknown> = {}) =>
  ({
    request: {
      id: 'req1',
      organizationId: 'org1',
      userId: 'u1',
      requesterName: 'Priya Nair',
      requesterEmail: 'priya@triyara.test',
      currentRole: 'EXPORT_MANAGER',
      reason: 'Needs the review queue.',
      status: 'REVOKED',
      // Deliberately different people.
      decidedById: 'approver-1',
      decidedAt: new Date('2026-08-02T00:00:00.000Z'),
      decisionReason: null,
      revokedById: 'revoker-2',
      revokedAt: new Date('2026-08-09T00:00:00.000Z'),
      revocationReason: 'Left the sourcing team.',
      version: 3,
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      updatedAt: new Date('2026-08-09T00:00:00.000Z'),
      ...over,
    },
    requesterUserId: 'u1',
  }) as never

beforeEach(() => {
  vi.clearAllMocks()
})

describe('decision attribution', () => {
  it('credits a revocation to whoever revoked it, not whoever approved it', async () => {
    await notifyAdminAccessDecision(result(), 'revoked')
    const [input] = createWithRecipients.mock.calls[0] as unknown as [{ actorId: string }]
    expect(input.actorId).toBe('revoker-2')
    expect(input.actorId).not.toBe('approver-1')
  })

  it('credits an approval to whoever approved it', async () => {
    await notifyAdminAccessDecision(result({ status: 'APPROVED', revokedById: null }), 'approved')
    const [input] = createWithRecipients.mock.calls[0] as unknown as [{ actorId: string }]
    expect(input.actorId).toBe('approver-1')
  })

  it('credits a rejection to whoever decided it', async () => {
    await notifyAdminAccessDecision(
      result({ status: 'REJECTED', revokedById: null, decisionReason: 'Not needed.' }),
      'rejected',
    )
    const [input] = createWithRecipients.mock.calls[0] as unknown as [{ actorId: string }]
    expect(input.actorId).toBe('approver-1')
  })
})

describe('addressing', () => {
  it('notifies only the person the decision is about', async () => {
    // A decision about one person's privileges is not organisation news.
    await notifyAdminAccessDecision(result(), 'revoked')
    const [, recipients] = createWithRecipients.mock.calls[0] as unknown as [
      unknown,
      { userId: string }[],
    ]
    expect(recipients).toEqual([{ userId: 'u1', channels: ['IN_APP'] }])
  })

  it('carries the revocation reason into the notification body', async () => {
    await notifyAdminAccessDecision(result(), 'revoked')
    const [input] = createWithRecipients.mock.calls[0] as unknown as [{ body: string }]
    expect(input.body).toContain('Left the sourcing team.')
  })
})

describe('resilience', () => {
  it('reports failed rather than throwing when the transport throws', async () => {
    // The decision and the role change are already committed by this point.
    emailService.adminAccessRevoked.mockRejectedValueOnce(new Error('socket hang up'))
    await expect(notifyAdminAccessDecision(result(), 'revoked')).resolves.toBe('failed')
  })

  it('still emails when the notification write fails', async () => {
    createWithRecipients.mockRejectedValueOnce(new Error('db down'))
    await expect(notifyAdminAccessDecision(result(), 'revoked')).resolves.toBe('sent')
    expect(emailService.adminAccessRevoked).toHaveBeenCalled()
  })
})
