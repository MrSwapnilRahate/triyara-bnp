import { createHash, randomBytes } from 'node:crypto'

import { assertAbility, type AuthContext } from '@triyara/auth'
import type { AccountRecord, UserRepository, UserWithRoles } from '@triyara/db'
import { type EventBus, makeEvent } from '@triyara/events'
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@triyara/lib'
import type { ProvisionAccountLoginDto } from '@triyara/validation'

/**
 * Portal login provisioning for an external party (TRY-BNP-EXT-PROVISION).
 *
 * Turns an approved Account into something a person can sign in as. Batch A made
 * "this login belongs to that Account" expressible; this is the one operation
 * that says it.
 *
 * Deliberately NOT part of `adminUsersService.invite`. That endpoint validates
 * its role against `grantableRoleSchema`, which refuses EXTERNAL_PARTY, and it
 * must keep refusing it - widening it would make the internal staff invite a
 * second way to mint external identities, with no account behind them. This
 * service names EXTERNAL_PARTY itself and accepts no role from the caller, so
 * there is exactly one way to produce an external login and it always has an
 * Account.
 *
 * What it does not do: grant anything. The provisioned user holds
 * EXTERNAL_PARTY, which carries no CASL rule, so they can authenticate and reach
 * nothing but `/portal`. Record-level access is a later batch.
 */

export type ExternalProvisioningCtx = AuthContext & { requestId?: string }

/** The narrow slice of the account repository this needs. */
export interface AccountLookup {
  findById(
    orgId: string,
    id: string,
    opts?: { includeDeleted?: boolean },
  ): Promise<AccountRecord | null>
}

/** The narrow slice of the user repository this needs. */
export interface ExternalUserLookup {
  findByEmail(email: string): Promise<UserWithRoles | null>
}

export interface ExternalProvisioningDeps {
  accounts: AccountLookup
  users: UserRepository & ExternalUserLookup
  events: EventBus
  /** Injected so core never imports bcrypt directly, as the admin invite does. */
  hashPassword: (plain: string) => Promise<string>
  /** Invitation lifetime. Defaults to 48 hours, matching the staff invite. */
  inviteTtlMs?: number
}

const DEFAULT_INVITE_TTL_MS = 48 * 60 * 60 * 1000

/**
 * The one role an external login may hold. A constant rather than a parameter:
 * a caller that could choose would be a caller that could choose wrong.
 */
const EXTERNAL_ROLE = 'EXTERNAL_PARTY' as const

/**
 * The outcome, discriminated so a repeat is distinguishable from a first call.
 *
 * `already_linked` carries no token. Re-issuing one on every repeat would mean a
 * second live credential for the same person each time somebody pressed the
 * button twice, and would invite the existing invitation to be replaced by
 * anyone who could call this.
 */
export type ProvisionOutcome =
  | {
      status: 'provisioned'
      user: { id: string; email: string; name: string }
      /** Plaintext invitation token. Returned once, never retrievable again. */
      token: string
      expiresAt: Date
    }
  | { status: 'already_linked'; user: { id: string; email: string; name: string } }

/** Every internal role. A user holding any of these is staff, not an external party. */
const INTERNAL_ROLES = new Set(['ADMIN', 'EXPORTER', 'VERIFIER', 'READ_ONLY'])

export function createExternalProvisioningService({
  accounts,
  users,
  events,
  hashPassword,
  inviteTtlMs = DEFAULT_INVITE_TTL_MS,
}: ExternalProvisioningDeps) {
  return {
    /**
     * Provisions a portal login for `accountId`, or explains why it cannot.
     *
     * Two abilities rather than one. `manage User` because this creates a
     * credential, and `manage Account` because it decides something about a
     * customer record - the same gate the approval decision uses. Both resolve
     * to ADMIN through `manage all`, so this is not a new permission; it names
     * both authorities the operation actually exercises.
     */
    async provision(
      ctx: ExternalProvisioningCtx,
      accountId: string,
      dto: ProvisionAccountLoginDto,
    ): Promise<ProvisionOutcome> {
      assertAbility(ctx, 'manage', 'User')
      assertAbility(ctx, 'manage', 'Account')

      // Scoped to the caller's tenant inside the query, not filtered after: an
      // account in another organization is not found rather than refused, which
      // is also the answer that discloses least.
      const account = await accounts.findById(ctx.organizationId, accountId)
      if (!account) throw new NotFoundError('Account not found.')

      if (account.registrationStatus !== 'APPROVED') {
        // The gate. `registrationStatus` and not `relationshipStatus` or
        // `isVerified`: it is the onboarding-review axis, the one that records
        // whether anybody has checked this company is real. A PENDING_REVIEW
        // account is a stranger who filled in a form, and BLOCKED is a decision
        // to keep them out - handing either a credential would undo the review.
        throw new ValidationError(
          `Account is ${account.registrationStatus}. Only an APPROVED account may be given a portal login.`,
        )
      }

      // Normalised again here, not only in the DTO. The lookup below decides
      // whether somebody already exists, and a lookup that disagrees with the
      // write's own normalisation would answer "no" for a user who does.
      const email = dto.email.trim().toLowerCase()

      const existing = await users.findByEmail(email)
      if (existing) {
        return resolveExisting(existing, accountId)
      }

      // 48 random bytes nobody ever sees, so the row has a password hash and the
      // account cannot be signed into. The invitation is the only route in, and
      // the invitee chooses their own password before their first sign-in.
      const unusableSecret = randomBytes(48).toString('hex')
      const token = randomBytes(32).toString('hex')
      const expiresAt = new Date(Date.now() + inviteTtlMs)

      // One transaction, in the repository: user, role and invitation are all
      // true together or none of them are. A user without the role signs in and
      // sees nothing; a user without the token can never sign in at all.
      const user = await users.createWithInvite(
        { actorId: ctx.user.id, organizationId: ctx.organizationId, requestId: ctx.requestId },
        {
          email,
          name: dto.name,
          passwordHash: await hashPassword(unusableSecret),
          roleName: EXTERNAL_ROLE,
          tokenHash: createHash('sha256').update(token).digest('hex'),
          tokenExpiresAt: expiresAt,
          accountId,
        },
      )

      await events.emit(
        makeEvent({
          type: 'account.login_provisioned',
          organizationId: ctx.organizationId,
          actorId: ctx.user.id,
          // No token and no hash: this payload reaches the activity feed, the
          // notification generator and the logs.
          data: { userId: user.id, accountId, email: user.email },
        }),
      )

      return { status: 'provisioned', user, token, expiresAt }
    },
  }
}

/**
 * What to do about an email that already belongs to somebody.
 *
 * Split out because the four answers are the security contract of this service,
 * and they read better as one list than as branches inside the flow. Every
 * branch that is not the account's own external user refuses: none of them can
 * be resolved without changing who somebody is.
 */
function resolveExisting(existing: UserWithRoles, accountId: string): ProvisionOutcome {
  const roles = existing.roles.map((r) => r.role.name)

  if (roles.some((r) => INTERNAL_ROLES.has(r))) {
    // A member of staff. Not converted, not given a second role beside the one
    // they hold, and not linked to the account. An internal user who quietly
    // became external - or worse, both - would carry internal abilities into a
    // customer's portal, and `read all` is among them.
    throw new ForbiddenError(
      'That email belongs to an internal user. Use a different address for the portal login.',
    )
  }

  if (existing.accountId === accountId) {
    // Already provisioned for this very account. The safe repeat: no second
    // user, no second UserRole - the composite primary key would refuse one
    // anyway - and no fresh invitation.
    return {
      status: 'already_linked',
      user: { id: existing.id, email: existing.email, name: existing.name },
    }
  }

  if (existing.accountId) {
    // Belongs to a different external party. Moving them would hand this
    // account's records to someone the other account chose, and take them from
    // whoever still expects that login to work. Relinking is a workflow with its
    // own decisions - who authorises it, what happens to the old session - and
    // it does not exist yet.
    throw new ConflictError('That email is already linked to a different account.')
  }

  // An external-role user with no account at all. It should not occur - this
  // service is the only thing that creates one, and it always sets the link -
  // so adopting it would mean guessing at how it came about. Refused rather
  // than repaired.
  throw new ConflictError('That email belongs to a user who is not linked to any account.')
}

export type ExternalProvisioningService = ReturnType<typeof createExternalProvisioningService>
