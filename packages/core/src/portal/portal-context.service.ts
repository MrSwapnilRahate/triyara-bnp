import { type AuthContext, requireExternalAccountContext } from '@triyara/auth'
import type { AccountRecord, BuyerProfileRecord, SupplierProfileRecord } from '@triyara/db'
import { ForbiddenError } from '@triyara/lib'

/**
 * Trusted portal identity for an external party (TRY-BNP-PORTAL-CTX).
 *
 * Batch B let an external party sign in and reach `/portal`. Nothing verified
 * that the account behind their session still exists, still belongs to this
 * tenant, has been approved, or represents a party the portal knows how to
 * serve - `requireExternalAccountContext` reads the session and stops there. So
 * a login whose account was deleted, blocked, or moved would have rendered the
 * portal exactly like a valid one.
 *
 * This is the single place that answers "who is this, and what are they",
 * against the database, on every request. Future portal features must call it
 * rather than resolving an account themselves: a second implementation is a
 * second chance to forget the organization scope.
 *
 * It grants nothing. EXTERNAL_PARTY still holds no CASL rule, and nothing here
 * consults an ability - the question this asks is ownership ("which account is
 * yours"), which is a different question from capability ("what may your role
 * do"). Keeping them apart is what lets the portal work without the role ever
 * gaining `read all`.
 */

export type PortalContextCtx = AuthContext & { requestId?: string }

/** The narrow slices of the repositories this needs. Nothing wider. */
export interface PortalAccountLookup {
  findById(orgId: string, id: string): Promise<AccountRecord | null>
}

export interface PortalProfileLookup<T> {
  findByAccountId(orgId: string, accountId: string): Promise<T | null>
}

export interface PortalContextDeps {
  accounts: PortalAccountLookup
  buyerProfiles: PortalProfileLookup<BuyerProfileRecord>
  supplierProfiles: PortalProfileLookup<SupplierProfileRecord>
}

/**
 * The party kinds the portal can serve.
 *
 * One member, deliberately. Batch C resolves buyers and refuses everything
 * else, and a union with a `SUPPLIER` or `UNKNOWN` member would let a future
 * caller write `if (partyType === 'BUYER')` and quietly treat the other cases as
 * a valid context that simply renders differently. There is no unsupported
 * value to mishandle here, because an unsupported party never produces a
 * context at all - it throws.
 *
 * Supplier support arrives when suppliers actually have accounts; see
 * `resolve` for why they do not today.
 */
export type PortalPartyType = 'BUYER'

/**
 * What a portal screen may know about the party it is serving.
 *
 * Deliberately not `AccountRecord`. That projection carries `ownerId` and a
 * nested `owner { id, name, email }` - a member of TRIYARA staff - plus
 * `createdById`, `updatedById`, `deletedById`, `version`, `source`,
 * `isSelfRegistered` and the tenant's own `organizationId`. None of that is the
 * buyer's to see, and handing back the record and trusting each caller to pick
 * fields is how one of them eventually will not.
 *
 * `organizationId` is present because callers need it to scope their own
 * queries, and it is the tenant the caller already belongs to - not a
 * disclosure. It must not be rendered.
 */
export interface PortalPartyContext {
  readonly userId: string
  readonly accountId: string
  readonly organizationId: string
  readonly partyType: PortalPartyType
  /** The trading name if the company gave one, otherwise its legal name. */
  readonly companyName: string
  /** ISO 3166-1 alpha-2, or null. Shown so the buyer can confirm who we think they are. */
  readonly country: string | null
}

/**
 * The one message every refusal uses.
 *
 * Identical for "no account", "wrong organization", "not approved", "supplier",
 * "both profiles" and "neither", because the difference between those answers
 * is itself information: distinguishing them would tell a caller whether an
 * account exists in another tenant, or what kind of party somebody else is.
 */
const REFUSED = 'This portal is not available for your account.'

export function createPortalContextService({
  accounts,
  buyerProfiles,
  supplierProfiles,
}: PortalContextDeps) {
  return {
    /**
     * Resolves the party behind the current session, or refuses.
     *
     * Takes the AuthContext and nothing else. There is deliberately no
     * `accountId` parameter: a parameter is something a caller can pass, and a
     * caller that can pass an account id is one route-handler mistake away from
     * passing one that came off a URL. The only account this can resolve is the
     * one the session already carries.
     */
    async resolve(ctx: PortalContextCtx): Promise<PortalPartyContext> {
      // Role and claim first, before any query. Returns `accountId` as a
      // `string` or throws - null, undefined and '' are all refused here, so
      // nothing below can reach Prisma with a value that would omit a filter.
      const { accountId } = requireExternalAccountContext(ctx)

      // Organization inside the query, not compared afterwards. `findById`
      // filters on `{ id, organizationId, deletedAt: null }`, so an account in
      // another tenant - or a deleted one - is simply not found. A global
      // lookup followed by `if (account.organizationId !== ...)` would give the
      // same answer only as long as nobody forgets the second half.
      const account = await accounts.findById(ctx.organizationId, accountId)
      if (!account) throw new ForbiddenError(REFUSED)

      // The onboarding-review axis, and not `relationshipStatus` or
      // `isVerified`. It is the field that records whether anybody has checked
      // this company is real, and it is the same gate provisioning already
      // applies - BLOCKED is a decision to keep somebody out, and a portal that
      // served them anyway would undo it.
      if (account.registrationStatus !== 'APPROVED') throw new ForbiddenError(REFUSED)

      // Both profiles are read before either is judged. Checking the buyer
      // profile alone and returning early would answer BUYER for an account
      // that is also a supplier, which is the ambiguous case below.
      const [buyer, supplier] = await Promise.all([
        buyerProfiles.findByAccountId(ctx.organizationId, accountId),
        supplierProfiles.findByAccountId(ctx.organizationId, accountId),
      ])

      // Any supplier profile refuses the account, and this one condition is
      // deliberately doing both jobs:
      //
      //   - supplier only: unsupported here. A supplier that registered through
      //     the public form has no Account at all (`supplier.create` alone), and
      //     `Supplier.accountId` is a bare scalar with no relation and no
      //     foreign key - so an account carrying a SupplierProfile is a
      //     different aggregate from the supplier master the sourcing workflow
      //     uses. Serving it would assert an identity the data does not
      //     establish.
      //
      //   - supplier AND buyer: ambiguous. The portal would have to decide which
      //     of the two it is serving, and nothing in the domain expresses that
      //     choice. Answering "buyer, because a buyer profile exists" is exactly
      //     the guess that must not be made.
      //
      // Written as one condition rather than two because a separate
      // `if (buyer && supplier)` above it would be unreachable - this line
      // already refuses every account with a supplier profile. Mutation testing
      // found that: negating the dual-specific branch changed no test, because
      // no input could reach it.
      if (supplier) throw new ForbiddenError(REFUSED)

      // Neither. Every account keyed in by staff starts this way, and party
      // type is never inferred from the company name, the registration source,
      // the role, or the shape of the id.
      if (!buyer) throw new ForbiddenError(REFUSED)

      return {
        userId: ctx.user.id,
        accountId: account.id,
        organizationId: account.organizationId,
        partyType: 'BUYER',
        // The trading name a buyer gave us, falling back to the legal one.
        // `displayName` is optional; `legalName` is not.
        companyName: account.displayName ?? account.legalName,
        country: account.country,
      }
    },
  }
}

export type PortalContextService = ReturnType<typeof createPortalContextService>
