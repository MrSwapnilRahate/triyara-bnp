import type { Prisma, PrismaClient as PrismaClientType, RoleName } from '@prisma/client'
import { PrismaClient } from '@prisma/client'
import { hashPassword } from '@triyara/auth'

/**
 * Staging-only provisioning for the load-test identity.
 *
 *   DATABASE_URL=…                       \
 *   LOADTEST_EXPECTED_DB_HOST=ep-…-pooler.us-east-2.aws.neon.tech \
 *   LOADTEST_EMAIL=…  LOADTEST_PASSWORD=…                          \
 *   pnpm --filter @triyara/db db:seed-loadtest -- --confirm
 *
 * WHY THIS EXISTS RATHER THAN A REUSED MECHANISM: nothing in the platform
 * produces the state the load test needs. `bootstrapAdmin` creates an ACTIVE
 * user with a real password but grants ADMIN, which is the opposite of a
 * read-only load-test identity. The invite flow grants any role but writes an
 * unusable password hash, so the invitee cannot sign in until they accept -
 * and a k6 run cannot accept an invitation. This fills exactly that gap and
 * nothing more.
 *
 * WHY THE GUARD IS ON THE HOST, NOT THE DATABASE NAME: the end-to-end suite
 * refuses a target by inspecting the database name (see
 * e2e/support/database-guard.ts), which works because its database is called
 * something with "e2e" in it. That test cannot work here. The staging branch
 * lives inside the PRODUCTION Neon project, and Neon branches keep the same
 * database name - so production and staging are indistinguishable by name and
 * differ only in the endpoint host. The host is therefore the only thing worth
 * checking, and it must be stated explicitly rather than pattern-matched:
 * "contains staging" would pass a production host belonging to a project that
 * happened to have the word in it.
 *
 * Nothing here prints a password, a hash, a username or a connection string.
 */

/* eslint-disable no-console -- a CLI's entire output is console. */

/** Every role row, because a database missing one cannot be granted it later. */
const ROLE_CATALOGUE: RoleName[] = ['ADMIN', 'EXPORTER', 'VERIFIER', 'READ_ONLY', 'EXTERNAL_PARTY']

/** The one role this identity gets. Read-only, so a mistake cannot write. */
const GRANTED_ROLE: RoleName = 'READ_ONLY'

interface LoadTestConfig {
  email: string
  password: string
  name: string
  orgSlug: string
  orgName: string
}

/**
 * Host and database only, so the operator can see which server they hit.
 *
 * Parsed with `URL` rather than a regular expression, for the reason the
 * end-to-end guard gives: a password containing `/` or `@` would otherwise
 * shift the boundaries and make the wrong target look right.
 */
function describeTarget(raw: string | undefined): string {
  if (!raw) return '(DATABASE_URL is not set)'
  try {
    const u = new URL(raw)
    return `${u.hostname}/${u.pathname.replace(/^\//, '')}`
  } catch {
    return '(DATABASE_URL is not a parseable URL)'
  }
}

function hostnameOf(raw: string): string | null {
  try {
    return new URL(raw).hostname
  } catch {
    return null
  }
}

/**
 * Refuses anything that is not the host the operator named.
 *
 * Exact equality, never a substring: this is the only thing standing between a
 * load-test seed and the production database, and it is asked to be boring.
 */
function assertExpectedHost(databaseUrl: string, expectedHost: string): void {
  const actual = hostnameOf(databaseUrl)
  if (actual === null) {
    throw new Error('DATABASE_URL is not a parseable URL. Refusing to run.')
  }
  if (actual !== expectedHost) {
    throw new Error(
      [
        'Refusing to run: DATABASE_URL does not point at the host you named.',
        `  expected host : ${expectedHost}`,
        `  actual host   : ${actual}`,
        '',
        'The staging branch and the production branch of a Neon project share a',
        'database name and differ only here, so this is the check that matters.',
      ].join('\n'),
    )
  }
}

/** Required, every one of them. Nothing here has a default. */
function parseConfig(env: NodeJS.ProcessEnv): LoadTestConfig {
  const required = {
    LOADTEST_EMAIL: (env.LOADTEST_EMAIL ?? '').trim().toLowerCase(),
    LOADTEST_PASSWORD: env.LOADTEST_PASSWORD ?? '',
    LOADTEST_NAME: (env.LOADTEST_NAME ?? '').trim(),
    LOADTEST_ORG_SLUG: (env.LOADTEST_ORG_SLUG ?? '').trim(),
    LOADTEST_ORG_NAME: (env.LOADTEST_ORG_NAME ?? '').trim(),
  }

  // Deliberately no defaults, for either the credential or the tenant. A default
  // password would be a committed credential wearing a different hat, and a
  // default slug would let a mistyped one silently write into a real tenant.
  const missing = Object.entries(required)
    .filter(([, value]) => !value)
    .map(([name]) => name)

  if (missing.length > 0) {
    throw new Error(
      `Refusing to run: ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} not set.`,
    )
  }

  return {
    email: required.LOADTEST_EMAIL,
    password: required.LOADTEST_PASSWORD,
    name: required.LOADTEST_NAME,
    orgSlug: required.LOADTEST_ORG_SLUG,
    orgName: required.LOADTEST_ORG_NAME,
  }
}

type Outcome = 'created' | 'updated'

/**
 * Idempotent: rerunning resets the password and re-asserts the role rather than
 * creating a second identity. A load test that had to be re-provisioned by hand
 * after every run would get provisioned wrong eventually.
 */
async function provision(
  prisma: PrismaClientType,
  config: LoadTestConfig,
): Promise<{
  outcome: Outcome
  userId: string
}> {
  // Hashed before the transaction opens, never inside it - bcrypt at cost 12 is
  // hundreds of milliseconds of pure CPU, and spending it while holding a
  // transaction spends the timeout budget on work the database is not waiting
  // for. The same reasoning `bootstrapAdmin` records.
  const passwordHash = await hashPassword(config.password)

  return prisma.$transaction(
    async (tx: Prisma.TransactionClient) => {
      const organization = await tx.organization.upsert({
        where: { slug: config.orgSlug },
        update: {},
        create: { name: config.orgName, slug: config.orgSlug },
        select: { id: true },
      })

      await tx.role.createMany({
        data: ROLE_CATALOGUE.map((name) => ({ name })),
        skipDuplicates: true,
      })

      const role = await tx.role.findUniqueOrThrow({
        where: { name: GRANTED_ROLE },
        select: { id: true },
      })

      const existing = await tx.user.findUnique({
        where: { email: config.email },
        select: { id: true },
      })

      const user = await tx.user.upsert({
        where: { email: config.email },
        // ACTIVE is set explicitly on both paths. The column defaults to ACTIVE,
        // but an identity that silently arrived SUSPENDED would fail login with
        // the same "Invalid email or password" as a wrong password, which is the
        // single most expensive thing to debug on this screen.
        update: { passwordHash, status: 'ACTIVE', name: config.name },
        create: {
          organizationId: organization.id,
          email: config.email,
          name: config.name,
          passwordHash,
          status: 'ACTIVE',
        },
        select: { id: true },
      })

      await tx.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: role.id } },
        update: {},
        create: { userId: user.id, roleId: role.id },
      })

      return { outcome: existing ? ('updated' as const) : ('created' as const), userId: user.id }
    },
    {
      // Prisma's default interactive-transaction budget is 5s, and this ran out
      // at 5,277ms on the last userRole upsert. Nothing here is slow: six
      // round trips over the network to a pooled Neon endpoint, against a
      // compute that may still be resuming from autosuspend, is simply more
      // than five seconds sometimes.
      //
      // Raised only for this one-off provisioning transaction, which a person
      // runs by hand with --confirm and waits on. It is not a runtime path and
      // no application code shares it, so the usual reason to keep this budget
      // tight - a stuck transaction holding locks while requests queue behind
      // it - does not apply.
      timeout: 30_000,
    },
  )
}

async function main() {
  const confirmed = process.argv.includes('--confirm')
  const databaseUrl = process.env.DATABASE_URL
  const expectedHost = (process.env.LOADTEST_EXPECTED_DB_HOST ?? '').trim()

  if (!databaseUrl) {
    console.error('DATABASE_URL is not set. Refusing to run.')
    process.exit(1)
  }
  if (!expectedHost) {
    console.error(
      'LOADTEST_EXPECTED_DB_HOST is not set. Refusing to run.\n' +
        'Name the Neon staging endpoint host explicitly, so a shell still pointed at\n' +
        'production cannot be written to by accident.',
    )
    process.exit(1)
  }

  let config: LoadTestConfig
  try {
    assertExpectedHost(databaseUrl, expectedHost)
    config = parseConfig(process.env)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }

  console.log('Provision load-test identity (staging only)')
  console.log(`  database     : ${describeTarget(databaseUrl)}`)
  console.log(`  expected host: ${expectedHost}  (matched)`)
  console.log(`  organization : ${config.orgSlug} (${config.orgName})`)
  console.log(`  email        : ${config.email}`)
  console.log(`  name         : ${config.name}`)
  console.log(`  role         : ${GRANTED_ROLE}`)
  console.log('  status       : ACTIVE')
  console.log('  password     : (supplied via environment, not shown)')

  if (!confirmed) {
    console.log('\nDry run. Nothing was written.')
    console.log('Re-run with --confirm once the database above is the one you mean.')
    return
  }

  const prisma = new PrismaClient()
  try {
    const result = await provision(prisma, config)
    console.log(
      result.outcome === 'created'
        ? '\nCreated the load-test user and granted READ_ONLY.'
        : '\nThat user already existed; password reset and READ_ONLY re-asserted.',
    )
    console.log(`  user id: ${result.userId}`)
    console.log('\nSign in at /login with the address above to confirm the credentials flow.')
    console.log('Then remove LOADTEST_* from your shell and any local env file.')
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error: unknown) => {
  // The message, never the stack: a Prisma stack can carry the connection
  // string, and this output is the thing most likely to be pasted somewhere.
  console.error(`\nProvisioning failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
