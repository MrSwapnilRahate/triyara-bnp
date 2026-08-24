import { randomUUID } from 'node:crypto'

import { PrismaClient } from '@prisma/client'
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
    // Only the organization. The roles are deliberately NOT created here: this
    // suite used to upsert ADMIN itself, which meant it set up the very state
    // it should have been asserting the bootstrap produces, and a database with
    // no role catalogue at all still looked healthy.
    await prisma.organization.create({ data: { name: 'Bootstrap Test Org', slug } })
  })

  it('stays within a round-trip budget the default timeout can afford', async () => {
    // The failure this guards: the catalogue was first written as four
    // `upsert` calls, which Prisma compiles into select-insert-select each.
    // Twenty statements is nothing locally and five wide-area round trips too
    // many against a database in another region - production timed out at
    // 5258ms against Prisma's 5s default.
    //
    // Counted rather than timed, because a timing assertion on a machine with
    // a millisecond-away database measures nothing and fails at random.
    const counter = new PrismaClient({ log: [{ emit: 'event', level: 'query' }] })
    const statements: string[] = []
    counter.$on('query', (e) => statements.push(e.query.trim().toUpperCase()))

    try {
      await bootstrapAdmin(counter, config(`budget-${randomUUID().slice(0, 8)}@example.com`))
    } finally {
      await counter.$disconnect()
    }

    // DEALLOCATE is prepared-statement housekeeping, not work we asked for.
    const issued = statements.filter((s) => !s.startsWith('DEALLOCATE'))
    expect(issued.filter((s) => s.startsWith('BEGIN'))).toHaveLength(1)
    expect(issued.filter((s) => s.startsWith('COMMIT'))).toHaveLength(1)
    // One INSERT for the whole catalogue, not one per role.
    expect(issued.filter((s) => s.includes('INSERT') && s.includes('"ROLE"'))).toHaveLength(1)
    expect(issued.length).toBeLessThanOrEqual(12)
  })

  it('creates the whole role catalogue, not only the role it grants', async () => {
    // The regression this suite missed: production held ADMIN and nothing else,
    // so the first administrator could sign in and then invite nobody.
    await bootstrapAdmin(prisma, config(`catalogue-${randomUUID().slice(0, 8)}@example.com`))

    const roles = await prisma.role.findMany({ select: { name: true } })
    expect(roles.map((r) => r.name).sort()).toEqual([
      'ADMIN',
      'EXPORTER',
      'EXTERNAL_PARTY',
      'READ_ONLY',
      'VERIFIER',
    ])
  })

  it('leaves the invite flow able to resolve every non-admin role', async () => {
    // The exact lookup `createWithInvite` performs. If this returns null the
    // invitation fails with a 404 that reads "this record no longer exists".
    await bootstrapAdmin(prisma, config(`resolve-${randomUUID().slice(0, 8)}@example.com`))

    // EXTERNAL_PARTY included: external provisioning performs the same lookup,
    // and the row missing is what would make it fail at runtime on a value the
    // type system calls valid.
    for (const name of ['EXPORTER', 'VERIFIER', 'READ_ONLY', 'EXTERNAL_PARTY'] as const) {
      const role = await prisma.role.findFirst({ where: { name }, select: { id: true } })
      expect(role, `${name} must be resolvable`).not.toBeNull()
    }
  })

  it('does not duplicate roles when run twice', async () => {
    await bootstrapAdmin(prisma, config(`dup1-${randomUUID().slice(0, 8)}@example.com`))
    const before = await prisma.role.count()

    await bootstrapAdmin(prisma, config(`dup2-${randomUUID().slice(0, 8)}@example.com`))

    expect(await prisma.role.count()).toBe(before)
    expect(before).toBe(5)
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
    // Linking a role must not quietly re-create the account underneath it.
    const after = await prisma.user.findUniqueOrThrow({
      where: { email },
      select: { passwordHash: true, name: true },
    })
    expect(after.passwordHash).toBe('placeholder-not-a-real-hash')
    expect(after.name).toBe('Existing Person')
  })

  it('keeps role memberships the bootstrap did not grant', async () => {
    // Someone already carrying EXPORTER must not lose it by being made an
    // administrator - the bootstrap adds ADMIN, it does not reset the person.
    const email = `keeps-${randomUUID().slice(0, 8)}@example.com`
    const org = await prisma.organization.findUniqueOrThrow({
      where: { slug },
      select: { id: true },
    })
    const existingRole = await prisma.role.upsert({
      where: { name: 'EXPORTER' },
      update: {},
      create: { name: 'EXPORTER' },
      select: { id: true },
    })
    await prisma.user.create({
      data: {
        organizationId: org.id,
        email,
        name: 'Already Staff',
        passwordHash: 'placeholder-not-a-real-hash',
        status: 'ACTIVE',
        roles: { create: { roleId: existingRole.id } },
      },
    })

    await bootstrapAdmin(prisma, config(email))

    const roles = await prisma.userRole.findMany({
      where: { user: { email } },
      select: { role: { select: { name: true } } },
    })
    expect(roles.map((r) => r.role.name).sort()).toEqual(['ADMIN', 'EXPORTER'])
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
