import { beforeAll, describe, expect, it } from 'vitest'

import { prisma } from '../client'
import { notificationRepository } from './notification.repository'
import { notificationPreferenceRepository } from './notification-preference.repository'
import { orgUserRepository } from './org-user.repository'

describe.skipIf(!process.env.DATABASE_URL)('notification repositories (integration)', () => {
  let orgId = ''
  let u1 = ''
  beforeAll(async () => {
    const org = await prisma.organization.upsert({
      where: { slug: 'notif-itest' },
      update: {},
      create: { name: 'Notif IT', slug: 'notif-itest' },
    })
    orgId = org.id
    const user = await prisma.user.upsert({
      where: { email: 'notif-it@triyara.test' },
      update: {},
      create: {
        organizationId: orgId,
        email: 'notif-it@triyara.test',
        name: 'IT',
        passwordHash: 'x',
      },
    })
    u1 = user.id
  })

  it('creates per-recipient notifications, lists, reads, archives; prefs upsert', async () => {
    const ids = await orgUserRepository.listActiveUserIds(orgId)
    expect(ids).toContain(u1)

    await notificationRepository.createWithRecipients(
      {
        organizationId: orgId,
        type: 'DOCUMENT',
        priority: 'NORMAL',
        actorId: u1,
        entityType: 'Document',
        entityId: 'd1',
        accountId: 'a1',
        eventName: 'document.uploaded',
        title: 'Document uploaded',
        body: 'A document was uploaded.',
        metadata: { documentId: 'd1' },
      },
      [{ userId: u1, channels: ['IN_APP', 'EMAIL'] }],
    )

    const list = await notificationRepository.listForRecipient(orgId, u1, {
      limit: 50,
      filter: 'all',
    })
    expect(list.items.length).toBeGreaterThanOrEqual(1)
    const first = list.items[0]!
    expect(first.notification.title).toBe('Document uploaded')

    // deliveries: IN_APP delivered, EMAIL queued
    const deliveries = await prisma.notificationDelivery.findMany({
      where: { recipientRowId: first.id },
    })
    expect(deliveries.some((d) => d.channel === 'IN_APP' && d.status === 'DELIVERED')).toBe(true)
    expect(deliveries.some((d) => d.channel === 'EMAIL' && d.status === 'QUEUED')).toBe(true)

    const before = await notificationRepository.unreadCount(orgId, u1)
    expect(before).toBeGreaterThanOrEqual(1)
    await notificationRepository.markRead(orgId, u1, first.id)
    expect(await notificationRepository.unreadCount(orgId, u1)).toBe(before - 1)

    await notificationRepository.archive(orgId, u1, first.id)
    const archived = await notificationRepository.listForRecipient(orgId, u1, {
      limit: 50,
      filter: 'archived',
    })
    expect(archived.items.some((i) => i.id === first.id)).toBe(true)

    // recipient isolation: another user sees nothing of u1's
    const other = await notificationRepository.listForRecipient(orgId, 'someone-else', {
      limit: 50,
      filter: 'all',
    })
    expect(other.items).toHaveLength(0)

    await notificationPreferenceRepository.upsert(orgId, u1, 'VERIFICATION', { muted: true })
    const prefMap = await notificationPreferenceRepository.getForUsers(orgId, [u1], 'VERIFICATION')
    expect(prefMap.get(u1)?.muted).toBe(true)
  })
})
