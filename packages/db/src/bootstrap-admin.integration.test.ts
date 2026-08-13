import { randomUUID } from 'node:crypto'

import { verifyPassword } from '@triyara/auth'
import { beforeAll, describe, expect, it } from 'vitest'

import { bootstrapAdmin } from './bootstrap-admin'
import { prisma } from './client'

/**
 * The bootstrap against a real database, because the properties that matter -
 * idempotency, the transaction, and creating nothing beyond the administrator -
 * are properties of the writes, not of the code shape.
 */
describe.skipIf(!process.env.DATABASE_URL)('bootstrap admin (integration)', () => {
  const slug = `bootstrap-${randomUUID().slice(0, 8)}`
  const password = 'Bootstrap-Test-1'

  function config(email: string) {
    return { email, password, name: 'Test Administrator', organizationSlug: slug }
  }

  beforeAll(async () => {
    await prisma.organization.create({ data: { name: 'Bootstrap Test Org', slug } })
    for (const name of ['ADMIN'] as const) {
      await prisma.role.upsert({ where: { name }, update: {}, create: { name } })
    }
  })

  it('creates the user, the ADMIN role link, and an ACTIVE account', async () => {
    const email = `new-${randomUUID().slice(0, 8)}@example.com`

    const result = await bootstrapAdmin(prisma, config(email))

    expect(result.outcome).toBe('created')
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        status: true,
        passwordHash: true,
        roles: { select: { role: { select: { name: true } } } },
      },
    })
    expect(user?.status).toBe('ACTIVE')
    expect(user?.roles.map((r) => r.role.name)).toEqual(['ADMIN'])
    // The account has to be usable, which means the stored hash must verify.
    expect(await verifyPassword(password, user!.passwordHash)).toBe(true)
  })

  it('is idempotent: a second run creates no duplicate and changes nothing', async () => {
    const email = `twice-${randomUUID().slice(0, 8)}@example.com`

    const first = await bootstrapAdmin(prisma, config(email))
    const before = await prisma.user.findUniqueOrThrow({
      where: { email },
      select: { passwordHash: true, name: true },
    })

    const second = await bootstrapAdmin(prisma, config(email))

    expect(first.outcome).toBe('created')
    expect(second.outcome).toBe('already-existed')
    expect(second.userId).toBe(first.userId)
    expect(await prisma.user.count({ where: { email } })).toBe(1)
    const after = await prisma.user.findUniqueOrThrow({
      where: { email },
      select: { passwordHash: true, name: true },
    })
    expect(after.passwordHash).toBe(before.passwordHash)
    expect(after.name).toBe(before.name)
  })

  it('never overwrites an existing password, even when a different one is supplied', async () => {
    // Someone re-running this after rotating the password must not silently
    // undo the rotation.
    const email = `rotated-${randomUUID().slice(0, 8)}@example.com`
    await bootstrapAdmin(prisma, config(email))
    const original = await prisma.user.findUniqueOrThrow({
      where: { email },
      select: { passwordHash: true },
    })

    await bootstrapAdmin(prisma, { ...config(email), password: 'Totally-Different-9' })

    const after = await prisma.user.findUniqueOrThrow({
      where: { email },
      select: { passwordHash: true },
    })
    expect(after.passwordHash).toBe(original.passwordHash)
    expect(await verifyPassword(password, after.passwordHash)).toBe(true)
  })

  it('links ADMIN to a user who exists without it', async () => {
    const email = `roleless-${randomUUID().slice(0, 8)}@example.com`
    const org = await prisma.organization.findUniqueOrThrow({
      where: { slug },
      select: { id: true },
    })
    await prisma.user.create({
      data: {
        organizationId: org.id,
        email,
        name: 'Existing Person',
        passwordHash: 'placeholder-not-a-real-hash',
        status: 'ACTIVE',
      },
    })

    const result = await bootstrapAdmin(prisma, config(email))

    expect(result.outcome).toBe('role-linked')
    const roles = await prisma.userRole.findMany({
      where: { user: { email } },
      select: { role: { select: { name: true } } },
    })
    expect(roles.map((r) => r.role.name)).toEqual(['ADMIN'])
  })

  it('grants ADMIN and nothing else', async () => {
    const email = `scoped-${randomUUID().slice(0, 8)}@example.com`
    await bootstrapAdmin(prisma, config(email))

    const roles = await prisma.userRole.findMany({
      where: { user: { email } },
      select: { role: { select: { name: true } } },
    })
    expect(roles).toHaveLength(1)
    expect(roles[0]!.role.name).toBe('ADMIN')
  })

  it('creates no demo catalog, supplier or buyer data', async () => {
    // The reason this command exists instead of `db:seed`: the seed plants a
    // published password and a fake catalogue.
    const email = `clean-${randomUUID().slice(0, 8)}@example.com`
    const org = await prisma.organization.findUniqueOrThrow({
      where: { slug },
      select: { id: true },
    })

    await bootstrapAdmin(prisma, config(email))

    const [products, categories, suppliers, accounts] = await Promise.all([
      prisma.product.count({ where: { organizationId: org.id } }),
      prisma.category.count({ where: { organizationId: org.id } }),
      prisma.supplier.count({ where: { organizationId: org.id } }),
      prisma.account.count({ where: { organizationId: org.id } }),
    ])
    expect({ products, categories, suppliers, accounts }).toEqual({
      products: 0,
      categories: 0,
      suppliers: 0,
      accounts: 0,
    })
  })

  it('refuses an organization that does not exist rather than inventing one', async () => {
    // The slug is what public registration resolves against; a stray tenant
    // would silently collect real submissions.
    await expect(
      bootstrapAdmin(prisma, {
        ...config('nowhere@example.com'),
        organizationSlug: 'no-such-tenant',
      }),
    ).rejects.toThrow(/No organization with slug/)
  })
})
