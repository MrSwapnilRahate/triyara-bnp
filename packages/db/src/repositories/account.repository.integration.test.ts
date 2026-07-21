import { beforeAll, describe, expect, it } from 'vitest'

import { prisma } from '../client'
import { accountRepository } from './account.repository'

// Runs only with a configured + migrated database. Skipped otherwise.
describe.skipIf(!process.env.DATABASE_URL)('accountRepository (integration)', () => {
  let orgId = ''
  let userId = ''

  beforeAll(async () => {
    const org = await prisma.organization.upsert({
      where: { slug: 'itest' },
      update: {},
      create: { name: 'Integration Org', slug: 'itest' },
    })
    orgId = org.id
    const user = await prisma.user.upsert({
      where: { email: 'it@triyara.test' },
      update: {},
      create: { organizationId: orgId, email: 'it@triyara.test', name: 'IT', passwordHash: 'x' },
    })
    userId = user.id
  })

  it('supports create, uniqueness, versioned update, soft delete, restore, and audit', async () => {
    const ctx = { actorId: userId, organizationId: orgId, requestId: 'r1' }
    const legalName = `Acme ${Date.now()}`

    const created = await accountRepository.create(ctx, { legalName, country: 'IN' })
    expect(created.version).toBe(1)

    await expect(accountRepository.create(ctx, { legalName })).rejects.toThrow(/already exists/i)

    await expect(
      accountRepository.mutate(ctx, created.id, 999, { source: 'x' }, 'account.updated'),
    ).rejects.toThrow()

    const updated = await accountRepository.mutate(
      ctx,
      created.id,
      1,
      { source: 'web' },
      'account.updated',
    )
    expect(updated.version).toBe(2)

    const deleted = await accountRepository.softDelete(ctx, created.id, 2)
    expect(deleted.deletedAt).not.toBeNull()

    const restored = await accountRepository.restore(ctx, created.id, deleted.version)
    expect(restored.deletedAt).toBeNull()

    const audits = await prisma.auditLog.count({ where: { entityId: created.id } })
    expect(audits).toBeGreaterThanOrEqual(4)
  })

  it('isolates by organization', async () => {
    const found = await accountRepository.findById('some-other-org', 'nope')
    expect(found).toBeNull()
  })
})
