import { describe, expect, it } from 'vitest'

import { prisma } from '../client'

/**
 * The role catalogue a migrated and seeded database actually holds.
 *
 * This exists because of a gap nothing else could see. Migration 0023 added
 * EXTERNAL_PARTY to the `RoleName` enum, and every type-level check agreed the
 * value was valid - but no Role ROW was created anywhere, so the first attempt
 * to provision an external login would have failed at runtime with "Role
 * EXTERNAL_PARTY does not exist". Typecheck, lint and 2,288 tests all passed
 * against that database.
 *
 * The distinction the enum hides: `RoleName` is a Postgres type, and the type
 * existing says nothing about whether a row does. Only a query answers that,
 * which is why this test talks to a real database rather than reading a
 * constant.
 *
 * CI runs `migrate deploy` then `db:seed` before the integration suite, so this
 * asserts the outcome of the real setup path rather than a fixture.
 */
describe.skipIf(!process.env.DATABASE_URL)('the role catalogue (integration)', () => {
  it('contains every role the application can name', async () => {
    const names = (await prisma.role.findMany({ select: { name: true } })).map((r) => r.name).sort()

    // Asserted as the whole set rather than "EXTERNAL_PARTY is present", so a
    // role quietly disappearing from the seed fails here too.
    expect(names).toEqual(['ADMIN', 'EXPORT_MANAGER', 'EXTERNAL_PARTY', 'READ_ONLY', 'VERIFIER'])
  })

  it('holds exactly one EXTERNAL_PARTY row', async () => {
    // Migration 0024 inserts it and the seed upserts it. Both run against CI's
    // database, so this is the assertion that proves the two paths do not each
    // create their own row - `ON CONFLICT ("name") DO NOTHING` against the seed's
    // `upsert` on the same unique column.
    expect(await prisma.role.count({ where: { name: 'EXTERNAL_PARTY' } })).toBe(1)
  })

  it('lets the invite primitive resolve EXTERNAL_PARTY by name', async () => {
    // The exact lookup `createWithInvite` performs before creating a user. If
    // this returns null, external provisioning throws NotFoundError no matter
    // how correct the calling code is.
    const role = await prisma.role.findFirst({
      where: { name: 'EXTERNAL_PARTY' },
      select: { id: true },
    })

    expect(role).not.toBeNull()
    expect(role?.id).toBeTruthy()
  })
})
