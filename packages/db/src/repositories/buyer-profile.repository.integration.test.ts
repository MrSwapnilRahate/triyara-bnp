import { beforeAll, describe, expect, it } from 'vitest'

import { prisma } from '../client'
import { accountRepository } from './account.repository'
import { buyerProfileRepository } from './buyer-profile.repository'

describe.skipIf(!process.env.DATABASE_URL)('buyerProfileRepository (integration)', () => {
  let orgId = ''
  let userId = ''
  beforeAll(async () => {
    const org = await prisma.organization.upsert({
      where: { slug: 'buyer-itest' },
      update: {},
      create: { name: 'Buyer IT', slug: 'buyer-itest' },
    })
    orgId = org.id
    const u = await prisma.user.upsert({
      where: { email: 'buyer-it@triyara.test' },
      update: {},
      create: {
        organizationId: orgId,
        email: 'buyer-it@triyara.test',
        name: 'IT',
        passwordHash: 'x',
      },
    })
    userId = u.id
  })

  it('creates one profile per account, versions, products, delete, restore, audit', async () => {
    const ctx = { actorId: userId, organizationId: orgId, requestId: 'r1' }
    const account = await accountRepository.create(ctx, { legalName: `Buyer ${Date.now()}` })

    const profile = await buyerProfileRepository.create(ctx, account.id, {
      businessType: 'IMPORTER',
      destinationCountries: ['AE', 'SA'],
    })
    expect(profile.version).toBe(1)
    expect(profile.destinationCountries).toContain('AE')

    await expect(buyerProfileRepository.create(ctx, account.id, {})).rejects.toThrow(/already has/i)
    await expect(
      buyerProfileRepository.mutate(
        ctx,
        account.id,
        99,
        { annualRequirement: '10 MT' },
        'buyer.updated',
      ),
    ).rejects.toThrow()

    const updated = await buyerProfileRepository.mutate(
      ctx,
      account.id,
      1,
      { annualRequirement: '50 MT' },
      'buyer.updated',
    )
    expect(updated.version).toBe(2)

    const withProduct = await buyerProfileRepository.addProduct(ctx, account.id, updated.version, {
      product: 'Onion Powder',
      targetVolume: '100 MT',
    })
    expect(withProduct.products).toHaveLength(1)

    const removed = await buyerProfileRepository.removeProduct(
      ctx,
      account.id,
      withProduct.version,
      withProduct.products[0]!.id,
    )
    expect(removed.products).toHaveLength(0)

    const deleted = await buyerProfileRepository.softDelete(ctx, account.id, removed.version)
    expect(deleted.deletedAt).not.toBeNull()
    const restored = await buyerProfileRepository.restore(ctx, account.id, deleted.version)
    expect(restored.deletedAt).toBeNull()

    const audits = await prisma.auditLog.count({
      where: { entityType: 'BuyerProfile', entityId: profile.id },
    })
    expect(audits).toBeGreaterThanOrEqual(6)
  })
})
