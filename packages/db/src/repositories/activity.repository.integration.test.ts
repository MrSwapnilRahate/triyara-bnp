import { beforeAll, describe, expect, it } from 'vitest'

import { prisma } from '../client'
import { activityRepository } from './activity.repository'

describe.skipIf(!process.env.DATABASE_URL)('activityRepository (integration)', () => {
  let orgId = ''
  beforeAll(async () => {
    const org = await prisma.organization.upsert({
      where: { slug: 'act-itest' },
      update: {},
      create: { name: 'Act IT', slug: 'act-itest' },
    })
    orgId = org.id
    await prisma.activity.deleteMany({ where: { organizationId: orgId } })
  })

  it('creates and lists activities with filters + cursor', async () => {
    const acc = `acc-${Date.now()}`
    await activityRepository.create({
      organizationId: orgId,
      accountId: acc,
      actorId: 'u1',
      actorType: 'user',
      entityType: 'Account',
      entityId: acc,
      eventName: 'account.created',
      activityType: 'CREATED',
      description: 'Account created',
      metadata: { accountId: acc },
    })
    await activityRepository.create({
      organizationId: orgId,
      accountId: acc,
      actorId: 'u1',
      actorType: 'user',
      entityType: 'Document',
      entityId: 'd1',
      eventName: 'document.uploaded',
      activityType: 'UPLOADED',
      description: 'Document uploaded (GST)',
    })
    await activityRepository.create({
      organizationId: orgId,
      accountId: acc,
      actorId: null,
      actorType: 'system',
      entityType: 'Verification',
      entityId: 'v1',
      eventName: 'verification.approved',
      activityType: 'APPROVED',
      description: 'Verification approved',
    })

    const all = await activityRepository.list(orgId, { limit: 50 })
    expect(all.items.length).toBeGreaterThanOrEqual(3)

    const docs = await activityRepository.list(orgId, { limit: 50, entityType: 'Document' })
    expect(docs.items.every((a) => a.entityType === 'Document')).toBe(true)

    const approved = await activityRepository.list(orgId, { limit: 50, activityType: 'APPROVED' })
    expect(approved.items.every((a) => a.activityType === 'APPROVED')).toBe(true)

    const page1 = await activityRepository.list(orgId, { limit: 2 })
    expect(page1.items).toHaveLength(2)
    expect(page1.hasMore).toBe(true)
    const page2 = await activityRepository.list(orgId, { limit: 2, cursor: page1.nextCursor! })
    expect(page2.items[0]!.id).not.toBe(page1.items[0]!.id)

    const one = await activityRepository.findById(orgId, all.items[0]!.id)
    expect(one).not.toBeNull()
  })
})
