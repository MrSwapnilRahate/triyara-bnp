import { beforeAll, describe, expect, it } from 'vitest'

import { prisma } from '../client'
import { accountRepository } from './account.repository'
import { verificationRepository } from './verification.repository'

describe.skipIf(!process.env.DATABASE_URL)('verificationRepository (integration)', () => {
  let orgId = ''
  let userId = ''
  beforeAll(async () => {
    const org = await prisma.organization.upsert({
      where: { slug: 'ver-itest' },
      update: {},
      create: { name: 'Ver IT', slug: 'ver-itest' },
    })
    orgId = org.id
    const u = await prisma.user.upsert({
      where: { email: 'ver-it@triyara.test' },
      update: {},
      create: {
        organizationId: orgId,
        email: 'ver-it@triyara.test',
        name: 'IT',
        passwordHash: 'x',
      },
    })
    userId = u.id
  })

  it('creates, enforces one-active, transitions with version + history + audit', async () => {
    const ctx = { actorId: userId, organizationId: orgId, requestId: 'r1' }
    const account = await accountRepository.create(ctx, { legalName: `Ver ${Date.now()}` })

    const v = await verificationRepository.create(ctx, {
      accountId: account.id,
      requiredDocumentTypes: ['GST'],
    })
    expect(v.status).toBe('DRAFT')

    // active check
    const active = await verificationRepository.findActiveForAccount(orgId, account.id)
    expect(active?.id).toBe(v.id)

    // stale version rejected
    await expect(
      verificationRepository.transition(
        ctx,
        v.id,
        99,
        { status: 'PENDING_REVIEW' },
        { fromStatus: 'DRAFT', toStatus: 'PENDING_REVIEW', action: 'verification.submitted' },
      ),
    ).rejects.toThrow()

    const submitted = await verificationRepository.transition(
      ctx,
      v.id,
      v.version,
      { status: 'PENDING_REVIEW', submittedAt: new Date() },
      { fromStatus: 'DRAFT', toStatus: 'PENDING_REVIEW', action: 'verification.submitted' },
    )
    expect(submitted.status).toBe('PENDING_REVIEW')
    expect(submitted.version).toBe(2)

    const inReview = await verificationRepository.transition(
      ctx,
      v.id,
      submitted.version,
      { status: 'IN_REVIEW', reviewerId: userId },
      { fromStatus: 'PENDING_REVIEW', toStatus: 'IN_REVIEW', action: 'verification.assigned' },
    )

    const reviewed = await verificationRepository.reviewDocument(ctx, v.id, inReview.version, {
      documentId: 'doc-x',
      documentType: 'GST',
      status: 'ACCEPTED',
    })
    expect(reviewed.reviews).toHaveLength(1)

    await verificationRepository.addNote(ctx, v.id, 'Looks good')

    const hist = await verificationRepository.history(orgId, v.id)
    expect(hist.length).toBeGreaterThanOrEqual(3)

    const audits = await prisma.auditLog.count({
      where: { entityType: 'Verification', entityId: v.id },
    })
    expect(audits).toBeGreaterThanOrEqual(4)
  })
})
