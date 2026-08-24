import { beforeAll, describe, expect, it } from 'vitest'

import { prisma } from '../client'
import { notificationRepository } from './notification.repository'
import { notificationPreferenceRepository } from './notification-preference.repository'
import { NON_INTERNAL_NOTIFICATION_ROLES, orgUserRepository } from './org-user.repository'

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

  /**
   * Who an internal domain event is allowed to reach.
   *
   * Against a real database, because the audience is decided by a Prisma `where`
   * and nowhere else. The service-level test injects a fake that returns ids
   * directly, so it can prove the fan-out honours the lookup but says nothing
   * about which rows the lookup selects - the same gap Batch E found when a
   * dropped `organizationId` broke no test in the entire suite.
   *
   * The fixture puts an internal user and a portal user in ONE organization, so
   * a dropped filter returns the portal user rather than an empty list: a
   * mistake that reads as somebody appearing, not as data missing.
   */
  describe('the internal notification audience', () => {
    let staffOnly = ''
    let externalUser = ''
    let dualRoleUser = ''
    let suspendedStaff = ''
    let otherOrgStaff = ''
    let otherOrgId = ''
    const tag = Date.now().toString(36)

    beforeAll(async () => {
      const roleId = async (name: 'ADMIN' | 'READ_ONLY' | 'EXTERNAL_PARTY') =>
        (await prisma.role.findUniqueOrThrow({ where: { name }, select: { id: true } })).id

      const other = await prisma.organization.upsert({
        where: { slug: 'notif-itest-other' },
        update: {},
        create: { name: 'Notif IT Other', slug: 'notif-itest-other' },
      })
      otherOrgId = other.id

      const mkUser = async (
        org: string,
        suffix: string,
        status: 'ACTIVE' | 'SUSPENDED' = 'ACTIVE',
      ) =>
        (
          await prisma.user.create({
            data: {
              organizationId: org,
              email: `notif-aud-${tag}-${suffix}@triyara.test`,
              name: suffix,
              passwordHash: 'x',
              status,
            },
            select: { id: true },
          })
        ).id

      staffOnly = await mkUser(orgId, 'staff')
      externalUser = await mkUser(orgId, 'external')
      dualRoleUser = await mkUser(orgId, 'dual')
      suspendedStaff = await mkUser(orgId, 'suspended', 'SUSPENDED')
      otherOrgStaff = await mkUser(otherOrgId, 'otherorg')

      await prisma.userRole.createMany({
        data: [
          { userId: staffOnly, roleId: await roleId('ADMIN') },
          { userId: externalUser, roleId: await roleId('EXTERNAL_PARTY') },
          // Both capacities at once. The ability builder already contemplates
          // this pairing, so the audience has to have an answer for it.
          { userId: dualRoleUser, roleId: await roleId('READ_ONLY') },
          { userId: dualRoleUser, roleId: await roleId('EXTERNAL_PARTY') },
          { userId: suspendedStaff, roleId: await roleId('ADMIN') },
          { userId: otherOrgStaff, roleId: await roleId('ADMIN') },
        ],
      })
    })

    it('still includes internal staff', async () => {
      // The half that must not regress: fixing a leak by sending nothing would
      // pass every negative test and break the product.
      expect(await orgUserRepository.listActiveUserIds(orgId)).toContain(staffOnly)
    })

    it('still includes a user carrying no role at all', async () => {
      // `u1` from the outer fixture holds no role. Unchanged behaviour, and not
      // a leak - a role-less session is refused every namespace by the route
      // policy. Asserted so the fix is not quietly narrower than it claims.
      expect(await orgUserRepository.listActiveUserIds(orgId)).toContain(u1)
    })

    it('excludes an EXTERNAL_PARTY user in the same organization', async () => {
      // The defect. This user is ACTIVE and in this tenant, so only the role
      // clause can be keeping them out.
      expect(await orgUserRepository.listActiveUserIds(orgId)).not.toContain(externalUser)
    })

    it('excludes a user holding EXTERNAL_PARTY alongside an internal role', async () => {
      // Fails towards the missed notification rather than the leak: this person
      // can sign into the portal, so an internal event must not be pushed at
      // them. `none` is what makes this true; a positive `some` over internal
      // roles would have included them.
      expect(await orgUserRepository.listActiveUserIds(orgId)).not.toContain(dualRoleUser)
    })

    it('returns internal staff and no portal user, in one organization holding both', async () => {
      const ids = await orgUserRepository.listActiveUserIds(orgId)
      expect(ids).toContain(staffOnly)
      expect(ids).not.toContain(externalUser)
      expect(ids).not.toContain(dualRoleUser)
      expect(ids.length).toBeGreaterThan(0)
    })

    it('still excludes a suspended internal user', async () => {
      // The status clause predates this change and must survive it.
      expect(await orgUserRepository.listActiveUserIds(orgId)).not.toContain(suspendedStaff)
    })

    it('still returns nobody from another organization', async () => {
      const ids = await orgUserRepository.listActiveUserIds(orgId)
      expect(ids).not.toContain(otherOrgStaff)
    })

    it('does not leak this organization&rsquo;s staff into another organization&rsquo;s audience', async () => {
      const ids = await orgUserRepository.listActiveUserIds(otherOrgId)
      expect(ids).toContain(otherOrgStaff)
      expect(ids).not.toContain(staffOnly)
      expect(ids).not.toContain(u1)
    })

    it('treats exactly EXTERNAL_PARTY as non-internal, and nothing else', () => {
      // Pinned so that widening the list - excluding VERIFIER, say - is a
      // failing test rather than a silent change in who hears about anything.
      expect([...NON_INTERNAL_NOTIFICATION_ROLES]).toEqual(['EXTERNAL_PARTY'])
    })
  })
})
