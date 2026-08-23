import type { Prisma, PrismaClient, RoleName } from '@prisma/client'
import { hashPassword } from '@triyara/auth'

/**
 * Creates the first administrator, once, by hand.
 *
 * Every other way into the system assumes someone is already inside it. An
 * invitation needs an administrator to send it; a password reset needs an
 * account to reset; `db:seed` creates an administrator whose password is
 * published in this repository and is therefore unusable in production. That
 * left a live deployment with no way for its owner to sign in at all.
 *
 * Deliberately not wired into startup, build, deploy, CI or `db:seed`. It runs
 * when a person runs it and at no other time - creating an administrator is not
 * something that should ever happen as a side effect.
 *
 * It does not contradict the rule in `admin-users.service` that ADMIN cannot be
 * assigned through the API. That rule exists so the role is granted only by a
 * Super Admin approving a request, and it is exactly what makes an out-of-band
 * first grant necessary: without one there is nobody to approve the first
 * request.
 */

export interface BootstrapConfig {
  email: string
  password: string
  name: string
  organizationSlug: string
}

export interface BootstrapResult {
  /** What happened, for a caller that wants to report it. Never a credential. */
  outcome: 'created' | 'already-existed' | 'role-linked'
  userId: string
  email: string
  organizationSlug: string
}

/**
 * The password rules the application already enforces.
 *
 * Kept in step with `changePasswordSchema` in @triyara/validation deliberately:
 * a bootstrap password that the change-password form would later reject would
 * be a trap, not a convenience. Restated rather than imported because this
 * package does not depend on the validation package and adding that dependency
 * to create one account would be the larger change.
 */
const MIN_PASSWORD_LENGTH = 12

/**
 * The role catalogue.
 *
 * These rows are names, not grants: creating them gives nobody anything, and a
 * role only reaches a person through a UserRole row. They are listed here for
 * the same reason the seed lists them - `RoleName` is a Postgres enum, so the
 * type existing says nothing about whether the rows do.
 *
 * The bootstrap has to create the whole catalogue rather than only the one it
 * assigns. `createWithInvite` resolves the requested role by name and throws if
 * the row is absent, so a database holding only ADMIN gives an administrator who
 * can sign in and then cannot invite anybody - which is the one thing they need
 * to do next.
 *
 * EXTERNAL_PARTY is here for that same reason and no other. It holds no CASL
 * rule and is absent from ASSIGNABLE_ROLES and GRANTABLE_ROLES, so no
 * administrator can hand it out; only external provisioning names it, and that
 * path needs the row to exist.
 */
const ROLE_CATALOGUE: RoleName[] = [
  'ADMIN',
  'EXPORT_MANAGER',
  'VERIFIER',
  'READ_ONLY',
  'EXTERNAL_PARTY',
]

/**
 * How long the write is allowed to take, against Prisma's 5s default.
 *
 * Headroom for a slow link and a cold database, not permission to do more work
 * inside the transaction - the statement count is what actually keeps this
 * fast, and the regression test holds it there.
 */
const TRANSACTION_TIMEOUT_MS = { timeout: 20_000 }

/** Deliberately narrow. A bootstrap that guesses at input is a bootstrap that surprises. */
export function parseBootstrapConfig(env: NodeJS.ProcessEnv): BootstrapConfig {
  const email = (env.BOOTSTRAP_ADMIN_EMAIL ?? '').trim().toLowerCase()
  const password = env.BOOTSTRAP_ADMIN_PASSWORD ?? ''
  const name = (env.BOOTSTRAP_ADMIN_NAME ?? '').trim() || 'Triyara Administrator'
  const organizationSlug = (env.BOOTSTRAP_ADMIN_ORG_SLUG ?? '').trim() || 'triyara'

  const problems: string[] = []

  if (!email) problems.push('BOOTSTRAP_ADMIN_EMAIL is required.')
  // Good enough to catch a typo or a shell that expanded to nothing; the column
  // is unique and the login form is the real authority on what works.
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    problems.push('BOOTSTRAP_ADMIN_EMAIL is not a valid email address.')
  }

  if (!password) problems.push('BOOTSTRAP_ADMIN_PASSWORD is required.')
  else {
    if (password.length < MIN_PASSWORD_LENGTH) {
      problems.push(`BOOTSTRAP_ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`)
    }
    if (!/[a-z]/.test(password)) problems.push('BOOTSTRAP_ADMIN_PASSWORD needs a lowercase letter.')
    if (!/[A-Z]/.test(password))
      problems.push('BOOTSTRAP_ADMIN_PASSWORD needs an uppercase letter.')
    if (!/[0-9]/.test(password)) problems.push('BOOTSTRAP_ADMIN_PASSWORD needs a digit.')
  }

  if (problems.length > 0) {
    // The messages name the variables, never their values - this text reaches a
    // terminal and, if someone is unlucky, a shell history file.
    throw new Error(`Bootstrap configuration is incomplete:\n  - ${problems.join('\n  - ')}`)
  }

  return { email, password, name, organizationSlug }
}

/**
 * Creates or completes the administrator, and is safe to run twice.
 *
 * An existing account is never touched: no password is overwritten, no name is
 * changed, no status is reset. Someone re-running this after a rotation must
 * not silently undo it. The one thing it will still do for an existing user is
 * add the ADMIN link if it is missing, because a user without the role is the
 * half-finished state this command exists to resolve.
 *
 * Written to be frugal with round trips rather than merely correct. Unlike
 * every other transaction in this codebase, this one runs from an operator's
 * laptop against a database in another region, so each statement costs a
 * wide-area round trip instead of a local one and the default 5s budget buys
 * far fewer of them. An earlier version issued twenty and timed out against
 * production at 5258ms.
 */
export async function bootstrapAdmin(
  prisma: PrismaClient,
  config: BootstrapConfig,
): Promise<BootstrapResult> {
  // Hashed before the transaction opens, never inside it. bcrypt at cost 12 is
  // a few hundred milliseconds of pure CPU, and spending that while holding an
  // open transaction spends the timeout budget on work the database is not
  // even waiting for.
  const passwordHash = await hashPassword(config.password)

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const organization = await tx.organization.findUnique({
      where: { slug: config.organizationSlug },
      select: { id: true },
    })
    if (!organization) {
      // Deliberately not created here. The organization is tenant data with a
      // slug that public registration resolves against; inventing one would
      // file every future submission under a tenant nobody meant to exist.
      throw new Error(
        `No organization with slug "${config.organizationSlug}". ` +
          `Create it first, or set BOOTSTRAP_ADMIN_ORG_SLUG to an existing one.`,
      )
    }

    // The whole catalogue, because the invite flow resolves every role by name
    // and cannot create a missing one.
    //
    // One statement, not four upserts. Prisma compiles `upsert` on this shape
    // into select-insert-select, so the loop it replaces cost twelve round
    // trips; `skipDuplicates` gets the same idempotence from a single
    // INSERT ... ON CONFLICT DO NOTHING and leaves existing rows untouched.
    await tx.role.createMany({
      data: ROLE_CATALOGUE.map((name) => ({ name })),
      skipDuplicates: true,
    })

    // Only ADMIN is granted. Creating the other three above is not granting
    // them: a bootstrap that handed out more than it was asked for would be the
    // wrong kind of convenient.
    const adminRole = await tx.role.findUniqueOrThrow({
      where: { name: 'ADMIN' },
      select: { id: true },
    })

    const existing = await tx.user.findUnique({
      where: { email: config.email },
      select: { id: true, roles: { select: { roleId: true } } },
    })

    if (existing) {
      const hasAdmin = existing.roles.some((r) => r.roleId === adminRole.id)
      if (hasAdmin) {
        return {
          outcome: 'already-existed' as const,
          userId: existing.id,
          email: config.email,
          organizationSlug: config.organizationSlug,
        }
      }
      await tx.userRole.create({ data: { userId: existing.id, roleId: adminRole.id } })
      return {
        outcome: 'role-linked' as const,
        userId: existing.id,
        email: config.email,
        organizationSlug: config.organizationSlug,
      }
    }

    const user = await tx.user.create({
      data: {
        organizationId: organization.id,
        email: config.email,
        name: config.name,
        passwordHash,
        status: 'ACTIVE',
        roles: { create: { roleId: adminRole.id } },
      },
      select: { id: true },
    })

    return {
      outcome: 'created' as const,
      userId: user.id,
      email: config.email,
      organizationSlug: config.organizationSlug,
    }
    // An explicit budget, which no other transaction in this codebase sets and
    // which none of them should copy. They run inside the same region as the
    // database and the 5s default is right for them. This one runs wherever the
    // operator happens to be, over a link nobody controls, against a Neon
    // compute that may be waking from suspend - so the work being small is not
    // by itself enough, and a one-off command that has to be re-run is worse
    // than one that waits.
  }, TRANSACTION_TIMEOUT_MS)
}
