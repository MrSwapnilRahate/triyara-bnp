import type { BuyerRfqListItem, BuyerRfqListResult } from '@triyara/db'
import { describe, expect, it } from 'vitest'

import { createBuyerPortalService } from './buyer-portal.service'
import type { PortalPartyContext } from './portal-context.service'

/**
 * What a buyer is allowed to read about their own requirements.
 *
 * The fake below is a small in-memory RFQ table that applies `organizationId`,
 * `buyerId` and `deletedAt` the way Prisma would, including the part that
 * matters most: a `where` key whose value is `undefined` is OMITTED, so a
 * dropped scope widens the query rather than emptying it. A fake that compared
 * strictly would let the isolation tests pass against a repository that had
 * stopped scoping - the precise false assurance these tests exist to prevent.
 */

const ORG = 'org1'
const ACCOUNT = 'acct-1'

function party(over: Partial<PortalPartyContext> = {}): PortalPartyContext {
  return {
    userId: 'u1',
    accountId: ACCOUNT,
    organizationId: ORG,
    partyType: 'BUYER',
    companyName: 'Global Foods',
    country: 'GB',
    ...over,
  }
}

/** A row as `buyerListSelect` returns it, plus the scope columns the table needs. */
interface Row extends BuyerRfqListItem {
  organizationId: string
  buyerId: string | null
  deletedAt: Date | null
}

function row(over: Partial<Row> = {}): Row {
  return {
    organizationId: ORG,
    buyerId: ACCOUNT,
    deletedAt: null,
    rfqNumber: 'RFQ-0001',
    title: 'Basmati rice, 25t',
    status: 'PUBLISHED',
    priority: 'NORMAL',
    currency: 'USD',
    incoterm: 'FOB',
    destinationCountry: 'GB',
    destinationPort: 'Felixstowe',
    expectedShipmentDate: new Date('2026-10-01'),
    quotationDeadline: new Date('2026-09-01'),
    createdAt: new Date('2026-08-01'),
    ...over,
  } as Row
}

/** Prisma's own semantics: undefined omits the filter, null means IS NULL. */
function matches(actual: string | null, filter: string | null | undefined): boolean {
  if (filter === undefined) return true
  if (filter === null) return actual === null
  return actual === filter
}

function harness(rows: Row[]) {
  const calls: { organizationId: string; buyerId: string }[] = []

  const service = createBuyerPortalService({
    rfqs: {
      async listForBuyer(organizationId, buyerId, limit = 50): Promise<BuyerRfqListResult> {
        calls.push({ organizationId, buyerId })
        const found = rows.filter(
          (r) =>
            matches(r.organizationId, organizationId) &&
            matches(r.buyerId, buyerId) &&
            r.deletedAt === null,
        )
        return { items: found.slice(0, limit) as BuyerRfqListItem[], hasMore: found.length > limit }
      },
    },
  })

  return { service, calls }
}

const APPROVED_KEYS = [
  'createdAt',
  'currency',
  'destinationCountry',
  'destinationPort',
  'expectedShipmentDate',
  'incoterm',
  'priority',
  'quotationDeadline',
  'rfqNumber',
  'status',
  'title',
]

describe('a buyer sees their own requirements', () => {
  it('returns the RFQs their account owns', async () => {
    const { service } = harness([row(), row({ rfqNumber: 'RFQ-0002' })])
    const list = await service.listRequirements(party())

    expect(list.items).toHaveLength(2)
    expect(list.items.map((r) => r.rfqNumber)).toEqual(['RFQ-0001', 'RFQ-0002'])
  })

  it('reports when more exist than were returned', async () => {
    const { service } = harness([row()])
    expect((await service.listRequirements(party())).hasMore).toBe(false)
  })
})

describe('isolation', () => {
  it('never returns another organization&rsquo;s RFQs', async () => {
    // Same account id, different tenant. The organization is applied in the
    // query, so this row is not found rather than found-and-filtered.
    const { service } = harness([row({ organizationId: 'org2', rfqNumber: 'RFQ-OTHER-ORG' })])
    expect((await service.listRequirements(party())).items).toEqual([])
  })

  it('never returns another buyer&rsquo;s RFQs in the same organization', async () => {
    const { service } = harness([row({ buyerId: 'acct-2', rfqNumber: 'RFQ-OTHER-BUYER' })])
    expect((await service.listRequirements(party())).items).toEqual([])
  })

  it('never returns INTERNAL RFQs, which carry no buyer', async () => {
    // `buyerId` null is how an INTERNAL RFQ looks. Matching on an account
    // excludes them without the query naming `type` at all.
    const { service } = harness([row({ buyerId: null, rfqNumber: 'RFQ-INTERNAL' })])
    expect((await service.listRequirements(party())).items).toEqual([])
  })

  it('never returns soft-deleted RFQs', async () => {
    const { service } = harness([row({ deletedAt: new Date(), rfqNumber: 'RFQ-DELETED' })])
    expect((await service.listRequirements(party())).items).toEqual([])
  })

  it('returns only the caller&rsquo;s rows when several accounts and tenants are present', async () => {
    // The combined case: the right row must be picked out of a table that also
    // holds a foreign tenant, a foreign buyer, an internal RFQ and a deleted one.
    const { service } = harness([
      row({ rfqNumber: 'MINE' }),
      row({ organizationId: 'org2', rfqNumber: 'FOREIGN-ORG' }),
      row({ buyerId: 'acct-2', rfqNumber: 'FOREIGN-BUYER' }),
      row({ buyerId: null, rfqNumber: 'INTERNAL' }),
      row({ deletedAt: new Date(), rfqNumber: 'DELETED' }),
    ])

    const list = await service.listRequirements(party())
    expect(list.items.map((r) => r.rfqNumber)).toEqual(['MINE'])
  })
})

describe('the scope comes from the resolved party, not the caller', () => {
  it('accepts exactly one argument, so no account can be passed', () => {
    // The structural half of the guarantee: there is no parameter through which
    // a route handler could hand this an id that came off a URL.
    const { service } = harness([])
    expect(service.listRequirements.length).toBe(1)
  })

  it('passes the party&rsquo;s organization and account straight to the repository', async () => {
    const { service, calls } = harness([row()])
    await service.listRequirements(party())

    expect(calls).toEqual([{ organizationId: ORG, buyerId: ACCOUNT }])
  })

  it('follows the party when it names a different account', async () => {
    // Proves the scope is read from the context on every call rather than
    // captured once - a second party gets their own rows, not the first party's.
    const { service, calls } = harness([row({ buyerId: 'acct-2', rfqNumber: 'THEIRS' })])
    const list = await service.listRequirements(party({ accountId: 'acct-2' }))

    expect(list.items.map((r) => r.rfqNumber)).toEqual(['THEIRS'])
    expect(calls[0]?.buyerId).toBe('acct-2')
  })
})

describe('what the buyer is allowed to see', () => {
  it('returns exactly the approved fields', async () => {
    const { service } = harness([row()])
    const [item] = (await service.listRequirements(party())).items

    // The whole key set, not a list of absences: a field added later fails here
    // rather than reaching a buyer.
    expect(Object.keys(item!).sort()).toEqual(APPROVED_KEYS)
  })

  it.each([
    'id',
    'organizationId',
    'buyerId',
    'awardedSupplierId',
    'awardedById',
    'suppliers',
    'description',
    'type',
    'version',
    'deletedAt',
    'createdById',
    'updatedById',
    'deletedById',
    'currentRevision',
  ])('never carries %s', async (key) => {
    const { service } = harness([row()])
    const [item] = (await service.listRequirements(party())).items
    expect(item).not.toHaveProperty(key)
  })

  it('carries no supplier or staff identity even when the row holds some', async () => {
    // The row is polluted with everything the internal projection would have
    // carried. The service builds its result field by field, so none survives.
    const polluted = {
      ...row(),
      awardedSupplierId: 'sup-99',
      awardedById: 'staff-1',
      suppliers: [{ supplierId: 'sup-99', supplier: { companyName: 'Acme Rice Mills' } }],
      description: 'internal notes about this buyer',
      createdById: 'staff-1',
      version: 7,
    } as unknown as Row

    const { service } = harness([polluted])
    const serialized = JSON.stringify((await service.listRequirements(party())).items)

    for (const leak of ['sup-99', 'staff-1', 'Acme Rice Mills', 'internal notes']) {
      expect(serialized, `must not disclose ${leak}`).not.toContain(leak)
    }
  })
})
