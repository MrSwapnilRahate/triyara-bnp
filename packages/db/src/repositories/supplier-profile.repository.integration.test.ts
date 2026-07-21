import { beforeAll, describe, expect, it } from 'vitest'

import { prisma } from '../client'
import { accountRepository } from './account.repository'
import { supplierProfileRepository } from './supplier-profile.repository'

describe.skipIf(!process.env.DATABASE_URL)('supplierProfileRepository (integration)', () => {
  let orgId = ''
  let userId = ''

  beforeAll(async () => {
    const org = await prisma.organization.upsert({
      where: { slug: 'sup-itest' },
      update: {},
      create: { name: 'Supplier IT Org', slug: 'sup-itest' },
    })
    orgId = org.id
    const user = await prisma.user.upsert({
      where: { email: 'sup-it@triyara.test' },
      update: {},
      create: {
        organizationId: orgId,
        email: 'sup-it@triyara.test',
        name: 'IT',
        passwordHash: 'x',
      },
    })
    userId = user.id
  })

  it('creates one profile per account, versions, capabilities, delete, restore, audit', async () => {
    const ctx = { actorId: userId, organizationId: orgId, requestId: 'r1' }
    const account = await accountRepository.create(ctx, { legalName: `Sup ${Date.now()}` })

    const profile = await supplierProfileRepository.create(ctx, account.id, {
      manufacturingType: 'MANUFACTURER',
      primaryMarkets: ['AE', 'SA'],
    })
    expect(profile.version).toBe(1)
    expect(profile.primaryMarkets).toContain('AE')

    // exactly one per account
    await expect(supplierProfileRepository.create(ctx, account.id, {})).rejects.toThrow(
      /already has/i,
    )

    // stale version rejected
    await expect(
      supplierProfileRepository.mutate(ctx, account.id, 99, { moq: '1 MT' }, 'supplier.updated'),
    ).rejects.toThrow()

    const updated = await supplierProfileRepository.mutate(
      ctx,
      account.id,
      1,
      { moq: '5 MT' },
      'supplier.updated',
    )
    expect(updated.version).toBe(2)

    const withProduct = await supplierProfileRepository.addProduct(
      ctx,
      account.id,
      updated.version,
      {
        product: 'Onion Powder',
        capacityPerMonth: '100 MT',
      },
    )
    expect(withProduct.products).toHaveLength(1)
    expect(withProduct.version).toBe(3)

    const removed = await supplierProfileRepository.removeProduct(
      ctx,
      account.id,
      withProduct.version,
      withProduct.products[0]!.id,
    )
    expect(removed.products).toHaveLength(0)

    const deleted = await supplierProfileRepository.softDelete(ctx, account.id, removed.version)
    expect(deleted.deletedAt).not.toBeNull()

    const restored = await supplierProfileRepository.restore(ctx, account.id, deleted.version)
    expect(restored.deletedAt).toBeNull()

    const audits = await prisma.auditLog.count({
      where: { entityType: 'SupplierProfile', entityId: profile.id },
    })
    expect(audits).toBeGreaterThanOrEqual(6)
  })
})
