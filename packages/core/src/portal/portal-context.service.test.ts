import { buildAbilityFor, type Role } from '@triyara/auth'
import type { AccountRecord, BuyerProfileRecord, SupplierProfileRecord } from '@triyara/db'
import { describe, expect, it } from 'vitest'

import { createPortalContextService, type PortalContextCtx } from './portal-context.service'

/**
 * Trusted portal identity resolution.
 *
 * Backed by fakes that behave like the real repositories in the one way these
 * cases turn on: the organization is part of the lookup, not something checked
 * afterwards. A fake that ignored `orgId` would let the cross-tenant case pass
 * against an implementation that had dropped the scope, which is precisely the
 * mutation these tests exist to catch.
 */

const ORG = 'org1'
const ACCOUNT = 'acct-1'

function ctxFor(roles: Role[], accountId?: string | null): PortalContextCtx {
  const user = {
    id: 'u1',
    organizationId: ORG,
    email: 'buyer@example.test',
    name: 'A Buyer',
    roles,
    ...(accountId === undefined ? {} : { accountId }),
  }
  return {
    user,
    organizationId: ORG,
    ...(accountId === undefined ? {} : { accountId }),
    ability: buildAbilityFor(roles),
    requestId: 'r1',
  }
}

function accountRow(over: Partial<AccountRecord> = {}): AccountRecord {
  return {
    id: ACCOUNT,
    organizationId: ORG,
    legalName: 'Global Foods Limited',
    displayName: 'Global Foods',
    country: 'GB',
    registrationStatus: 'APPROVED',
    // Deliberately included: these are the internal fields the DTO must not
    // carry through. If the service ever returns the record, the shape test
    // below sees them.
    ownerId: 'staff-1',
    owner: { id: 'staff-1', name: 'A Manager', email: 'manager@triyara.test' },
    relationshipStatus: 'ACTIVE',
    source: 'PUBLIC_REGISTRATION',
    isSelfRegistered: true,
    isVerified: true,
    createdById: 'staff-1',
    updatedById: 'staff-1',
    deletedById: null,
    version: 3,
    deletedAt: null,
    ...over,
  } as AccountRecord
}

/**
 * Compares one `where` key the way Prisma does.
 *
 * The important case is `undefined`: Prisma OMITS a filter whose value is
 * undefined, so `where: { id: undefined }` is not "find nothing", it is "do not
 * filter on id at all". A fake that compared strictly would answer `null` for a
 * missing id and make the fail-closed tests pass against an implementation that
 * had dropped the guard - which is exactly the false assurance these tests
 * exist to avoid. `null` is modelled faithfully too: it compiles to `IS NULL`,
 * which matches no row here.
 */
function matches(actual: string, filter: string | null | undefined): boolean {
  if (filter === undefined) return true // filter omitted - matches everything
  if (filter === null) return false // IS NULL - matches nothing
  return actual === filter
}

/**
 * Fakes that scope by organization exactly as the repositories do - `findById`
 * filters on `{ id, organizationId }`, so a mismatch returns null rather than a
 * record the caller is expected to check.
 */
function harness(
  options: {
    account?: AccountRecord | null
    buyer?: boolean
    supplier?: boolean
  } = {},
) {
  const { account = accountRow(), buyer = true, supplier = false } = options

  return createPortalContextService({
    accounts: {
      async findById(orgId: string, id: string) {
        if (!account) return null
        return matches(account.organizationId, orgId) && matches(account.id, id) ? account : null
      },
    },
    buyerProfiles: {
      async findByAccountId(orgId: string, accountId: string) {
        if (!buyer) return null
        return matches(ORG, orgId) && matches(ACCOUNT, accountId)
          ? ({ id: 'bp1', accountId, organizationId: orgId } as BuyerProfileRecord)
          : null
      },
    },
    supplierProfiles: {
      async findByAccountId(orgId: string, accountId: string) {
        if (!supplier) return null
        return matches(ORG, orgId) && matches(ACCOUNT, accountId)
          ? ({ id: 'sp1', accountId, organizationId: orgId } as SupplierProfileRecord)
          : null
      },
    },
  })
}

const REFUSED = /not available for your account/

describe('a buyer account resolves', () => {
  it('returns the trusted party context', async () => {
    const party = await harness().resolve(ctxFor(['EXTERNAL_PARTY'], ACCOUNT))

    expect(party.partyType).toBe('BUYER')
    expect(party.accountId).toBe(ACCOUNT)
    expect(party.organizationId).toBe(ORG)
    expect(party.userId).toBe('u1')
  })

  it('prefers the trading name over the legal name', async () => {
    const party = await harness().resolve(ctxFor(['EXTERNAL_PARTY'], ACCOUNT))
    expect(party.companyName).toBe('Global Foods')
  })

  it('falls back to the legal name when no trading name was given', async () => {
    const service = harness({ account: accountRow({ displayName: null }) })
    const party = await service.resolve(ctxFor(['EXTERNAL_PARTY'], ACCOUNT))
    expect(party.companyName).toBe('Global Foods Limited')
  })
})

describe('the identity claim must be usable', () => {
  it('refuses an internal role', async () => {
    // Staff act across the tenant through CASL, never through an account scope.
    for (const role of ['ADMIN', 'EXPORT_MANAGER', 'VERIFIER', 'READ_ONLY'] as Role[]) {
      await expect(harness().resolve(ctxFor([role], ACCOUNT)), role).rejects.toThrowError()
    }
  })

  it('refuses an external party whose accountId is null', async () => {
    await expect(harness().resolve(ctxFor(['EXTERNAL_PARTY'], null))).rejects.toThrowError()
  })

  it('refuses an external party whose accountId is missing entirely', async () => {
    // The dangerous one: `undefined` is what Prisma silently drops from a
    // `where`, turning a scoped query into an unscoped one.
    await expect(harness().resolve(ctxFor(['EXTERNAL_PARTY']))).rejects.toThrowError()
  })

  it('refuses an empty accountId', async () => {
    await expect(harness().resolve(ctxFor(['EXTERNAL_PARTY'], ''))).rejects.toThrowError()
  })
})

describe('the account must be findable, in this organization, and approved', () => {
  it('refuses when the account does not exist', async () => {
    await expect(
      harness({ account: null }).resolve(ctxFor(['EXTERNAL_PARTY'], ACCOUNT)),
    ).rejects.toThrowError(REFUSED)
  })

  it('refuses an account belonging to another organization', async () => {
    // The scope is applied inside the lookup, so a foreign account is simply
    // not found - there is no record to compare against afterwards, and no
    // branch that could forget to.
    const service = harness({ account: accountRow({ organizationId: 'org2' }) })
    await expect(service.resolve(ctxFor(['EXTERNAL_PARTY'], ACCOUNT))).rejects.toThrowError(REFUSED)
  })

  it.each(['PENDING_REVIEW', 'REJECTED', 'BLOCKED', 'INACTIVE', 'DRAFT'] as const)(
    'refuses a %s account',
    async (registrationStatus) => {
      // Every non-approved state, not a sample. BLOCKED in particular is a
      // decision to keep somebody out; serving them would undo it.
      const service = harness({ account: accountRow({ registrationStatus }) })
      await expect(service.resolve(ctxFor(['EXTERNAL_PARTY'], ACCOUNT))).rejects.toThrowError(
        REFUSED,
      )
    },
  )
})

describe('party identity must be unambiguous', () => {
  it('refuses an account carrying both profiles', async () => {
    // Not resolved as BUYER just because a buyer profile exists. Nothing in the
    // domain says which party such an account is acting as.
    const service = harness({ buyer: true, supplier: true })
    await expect(service.resolve(ctxFor(['EXTERNAL_PARTY'], ACCOUNT))).rejects.toThrowError(REFUSED)
  })

  it('refuses a supplier-only account', async () => {
    // Batch C is buyer-resolvable only, and this is refused rather than served
    // as some other party type.
    const service = harness({ buyer: false, supplier: true })
    await expect(service.resolve(ctxFor(['EXTERNAL_PARTY'], ACCOUNT))).rejects.toThrowError(REFUSED)
  })

  it('refuses an account with neither profile', async () => {
    // Every account keyed in by staff starts this way. Party type is never
    // inferred from the company name, the source, or the role.
    const service = harness({ buyer: false, supplier: false })
    await expect(service.resolve(ctxFor(['EXTERNAL_PARTY'], ACCOUNT))).rejects.toThrowError(REFUSED)
  })
})

describe('what the caller is allowed to see', () => {
  it('returns only the agreed fields, and no internal ones', async () => {
    const party = await harness().resolve(ctxFor(['EXTERNAL_PARTY'], ACCOUNT))

    // Asserted as the whole key set rather than a list of absences: a field
    // added to the DTO later fails here rather than reaching a buyer unnoticed.
    expect(Object.keys(party).sort()).toEqual([
      'accountId',
      'companyName',
      'country',
      'organizationId',
      'partyType',
      'userId',
    ])
  })

  it('carries no staff, audit or workflow data from the account record', async () => {
    const party = await harness().resolve(ctxFor(['EXTERNAL_PARTY'], ACCOUNT))
    const serialized = JSON.stringify(party)

    // The account row in this suite deliberately carries all of these. Scanning
    // the payload catches them wherever they might appear, including nested.
    for (const leak of [
      'staff-1',
      'A Manager',
      'manager@triyara.test',
      'PUBLIC_REGISTRATION',
      'ACTIVE',
    ]) {
      expect(serialized, `must not disclose ${leak}`).not.toContain(leak)
    }
    for (const key of [
      'ownerId',
      'owner',
      'relationshipStatus',
      'source',
      'isSelfRegistered',
      'isVerified',
      'createdById',
      'updatedById',
      'deletedById',
      'version',
      'deletedAt',
      'registrationStatus',
      'legalName',
    ]) {
      expect(party, `must not carry ${key}`).not.toHaveProperty(key)
    }
  })

  it('refuses every case with one message, so refusals are indistinguishable', async () => {
    // Telling "no account" apart from "wrong organization" or "supplier" would
    // disclose whether an account exists elsewhere, and what somebody else is.
    const cases = [
      harness({ account: null }),
      harness({ account: accountRow({ organizationId: 'org2' }) }),
      harness({ account: accountRow({ registrationStatus: 'BLOCKED' }) }),
      harness({ buyer: false, supplier: true }),
      harness({ buyer: true, supplier: true }),
      harness({ buyer: false, supplier: false }),
    ]

    const messages = new Set<string>()
    for (const service of cases) {
      await service.resolve(ctxFor(['EXTERNAL_PARTY'], ACCOUNT)).catch((e: Error) => {
        messages.add(e.message)
      })
    }

    expect(messages.size, 'all refusals must read identically').toBe(1)
  })
})

describe('the account cannot be chosen by the caller', () => {
  it('accepts exactly one argument, so there is no account to pass', async () => {
    // The structural half of the guarantee. `resolve(ctx)` takes the context and
    // nothing else, so a route handler cannot hand it an id that came off a URL
    // - there is no parameter to hand it to. Asserted on arity rather than left
    // to the type signature alone, because a second parameter added later would
    // compile fine and silently reopen the question.
    expect(harness().resolve.length).toBe(1)
  })

  it('resolves the session account even when a different one exists', async () => {
    // `resolve` takes only the AuthContext. This asserts the consequence: an
    // account the session does not name is not reachable, because there is no
    // parameter through which to name it.
    const service = harness({ account: accountRow({ id: 'acct-other' }) })
    await expect(service.resolve(ctxFor(['EXTERNAL_PARTY'], ACCOUNT))).rejects.toThrowError(REFUSED)
  })

  it('scopes by the organization on the context, not the one on the account', async () => {
    const service = harness({ account: accountRow({ organizationId: 'org2' }) })
    const ctx = ctxFor(['EXTERNAL_PARTY'], ACCOUNT)
    await expect(service.resolve(ctx)).rejects.toThrowError(REFUSED)
    expect(ctx.organizationId).toBe(ORG)
  })
})

describe('resolving grants nothing', () => {
  it('leaves EXTERNAL_PARTY with no abilities', async () => {
    // The invariant this batch must not erode: a resolved portal context is an
    // identity, not a permission.
    const ctx = ctxFor(['EXTERNAL_PARTY'], ACCOUNT)
    await harness().resolve(ctx)

    expect(ctx.ability.can('read', 'all')).toBe(false)
    expect(ctx.ability.can('read', 'Account')).toBe(false)
    expect(ctx.ability.can('read', 'RFQ')).toBe(false)
    expect(ctx.ability.can('read', 'Quotation')).toBe(false)
  })
})
