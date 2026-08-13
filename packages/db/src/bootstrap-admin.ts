import type { Prisma, PrismaClient } from '@prisma/client'
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
 */
export async function bootstrapAdmin(
  prisma: PrismaClient,
  config: BootstrapConfig,
): Promise<BootstrapResult> {
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

    // Only ADMIN. The other three roles are created by the seed and by the
    // admin screens; a bootstrap that granted more than it was asked for would
    // be the wrong kind of convenient.
    const adminRole = await tx.role.upsert({
      where: { name: 'ADMIN' },
      update: {},
      create: { name: 'ADMIN' },
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
        passwordHash: await hashPassword(config.password),
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
  })
}
