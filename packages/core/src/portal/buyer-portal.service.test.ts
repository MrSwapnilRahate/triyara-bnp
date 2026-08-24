import type {
  BuyerQuotationItem,
  BuyerQuotationListResult,
  BuyerRfqDetail,
  BuyerRfqListItem,
  BuyerRfqListResult,
} from '@triyara/db'
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

/** A row as the buyer selects return it, plus the scope columns the table needs. */
interface Row extends BuyerRfqListItem {
  organizationId: string
  buyerId: string | null
  deletedAt: Date | null
  items?: BuyerRfqDetail['items']
}

/** One requirement line, as `buyerDetailSelect` returns it. */
function itemRow(
  over: Partial<BuyerRfqDetail['items'][number]> = {},
): BuyerRfqDetail['items'][number] {
  return {
    lineNumber: 1,
    customProductName: null,
    product: { name: 'Basmati rice' },
    quantity: '25' as unknown as never,
    unit: 'MT',
    requiredCertifications: [],
    packaging: '25kg bags',
    ...over,
  } as BuyerRfqDetail['items'][number]
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

/** A quotation as `buyerQuotationSelect` returns it, plus scope columns. */
interface QuotationRow extends BuyerQuotationItem {
  organizationId: string
  buyerId: string
  deletedAt: Date | null
}

function quotationRow(over: Partial<QuotationRow> = {}): QuotationRow {
  return {
    organizationId: ORG,
    buyerId: ACCOUNT,
    deletedAt: null,
    quotationNumber: 'QT-0001',
    revisionNumber: 1,
    status: 'SENT',
    currency: 'USD',
    grandTotal: '12500.0000' as unknown as never,
    sentAt: new Date('2026-08-10'),
    validUntil: new Date('2026-09-10'),
    ...over,
  } as QuotationRow
}

function harness(rows: Row[], quotationRows: QuotationRow[] = []) {
  const calls: { organizationId: string; buyerId: string }[] = []

  const service = createBuyerPortalService({
    quotations: {
      async listQuotationsForBuyer(
        organizationId,
        buyerId,
        limit = 50,
      ): Promise<BuyerQuotationListResult> {
        calls.push({ organizationId, buyerId })
        const found = quotationRows.filter(
          (q) =>
            matches(q.organizationId, organizationId) &&
            matches(q.buyerId, buyerId) &&
            q.deletedAt === null,
        )
        return {
          items: found.slice(0, limit) as BuyerQuotationItem[],
          hasMore: found.length > limit,
        }
      },
    },
    rfqs: {
      async findForBuyer(organizationId, buyerId, rfqNumber): Promise<BuyerRfqDetail | null> {
        calls.push({ organizationId, buyerId })
        const found = rows.find(
          (r) =>
            matches(r.organizationId, organizationId) &&
            matches(r.buyerId, buyerId) &&
            matches(r.rfqNumber, rfqNumber) &&
            r.deletedAt === null,
        )
        return found ? ({ ...found, items: found.items ?? [] } as unknown as BuyerRfqDetail) : null
      },
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

const DETAIL_KEYS = [...APPROVED_KEYS, 'items'].sort()
const ITEM_KEYS = [
  'lineNumber',
  'packaging',
  'productName',
  'quantity',
  'requiredCertifications',
  'unit',
]

describe('opening one of the buyer&rsquo;s own requirements', () => {
  it('returns the requirement they own', async () => {
    const { service } = harness([row({ items: [itemRow()] })])
    const detail = await service.getRequirement(party(), 'RFQ-0001')

    expect(detail.rfqNumber).toBe('RFQ-0001')
    expect(detail.items).toHaveLength(1)
  })

  it('resolves a catalogue product by name', async () => {
    const { service } = harness([row({ items: [itemRow()] })])
    const [item] = (await service.getRequirement(party(), 'RFQ-0001')).items
    expect(item?.productName).toBe('Basmati rice')
  })

  it('falls back to the free-text name when the line names no catalogue product', async () => {
    // `customProductName` is documented as used only when `productId` is null.
    const { service } = harness([
      row({ items: [itemRow({ product: null, customProductName: 'Sona Masoori, unpolished' })] }),
    ])
    const [item] = (await service.getRequirement(party(), 'RFQ-0001')).items
    expect(item?.productName).toBe('Sona Masoori, unpolished')
  })

  it('serialises quantity rather than passing a Decimal on', async () => {
    const { service } = harness([row({ items: [itemRow()] })])
    const [item] = (await service.getRequirement(party(), 'RFQ-0001')).items
    expect(typeof item?.quantity).toBe('string')
  })
})

describe('a requirement that is not theirs is indistinguishable from one that does not exist', () => {
  it.each([
    ['no such number', () => harness([row()]), 'RFQ-NOPE'],
    ['another organization', () => harness([row({ organizationId: 'org2' })]), 'RFQ-0001'],
    ['another buyer', () => harness([row({ buyerId: 'acct-2' })]), 'RFQ-0001'],
    ['an INTERNAL RFQ', () => harness([row({ buyerId: null })]), 'RFQ-0001'],
    ['a soft-deleted RFQ', () => harness([row({ deletedAt: new Date() })]), 'RFQ-0001'],
  ])('refuses %s', async (_label, build, number) => {
    const { service } = build()
    await expect(service.getRequirement(party(), number)).rejects.toThrowError(
      /not available for your account/,
    )
  })

  it('uses one message for every refusal, so none can be told apart', async () => {
    const cases: [() => ReturnType<typeof harness>, string][] = [
      [() => harness([row()]), 'RFQ-NOPE'],
      [() => harness([row({ organizationId: 'org2' })]), 'RFQ-0001'],
      [() => harness([row({ buyerId: 'acct-2' })]), 'RFQ-0001'],
      [() => harness([row({ buyerId: null })]), 'RFQ-0001'],
      [() => harness([row({ deletedAt: new Date() })]), 'RFQ-0001'],
    ]

    const messages = new Set<string>()
    for (const [build, number] of cases) {
      await build()
        .service.getRequirement(party(), number)
        .catch((e: Error) => messages.add(e.message))
    }
    expect(messages.size, 'all refusals must read identically').toBe(1)
  })
})

describe('the detail scope also comes from the party, not the caller', () => {
  it('accepts the party and the identifier, and nothing else', () => {
    const { service } = harness([])
    expect(service.getRequirement.length).toBe(2)
  })

  it('passes the party&rsquo;s organization and account to the repository', async () => {
    const { service, calls } = harness([row({ items: [] })])
    await service.getRequirement(party(), 'RFQ-0001')
    expect(calls).toEqual([{ organizationId: ORG, buyerId: ACCOUNT }])
  })
})

describe('what the detail is allowed to carry', () => {
  it('returns exactly the approved keys plus items', async () => {
    const { service } = harness([row({ items: [itemRow()] })])
    const detail = await service.getRequirement(party(), 'RFQ-0001')
    expect(Object.keys(detail).sort()).toEqual(DETAIL_KEYS)
  })

  it('returns exactly the approved item keys', async () => {
    const { service } = harness([row({ items: [itemRow()] })])
    const [item] = (await service.getRequirement(party(), 'RFQ-0001')).items
    expect(Object.keys(item!).sort()).toEqual(ITEM_KEYS)
  })

  it.each(['id', 'organizationId', 'buyerId', 'awardedSupplierId', 'suppliers', 'description'])(
    'never carries %s at the top level',
    async (key) => {
      const { service } = harness([row({ items: [itemRow()] })])
      expect(await service.getRequirement(party(), 'RFQ-0001')).not.toHaveProperty(key)
    },
  )

  it.each(['id', 'version', 'remarks', 'specifications', 'responses', 'productId', 'product'])(
    'never carries %s on a line',
    async (key) => {
      const { service } = harness([row({ items: [itemRow()] })])
      const [item] = (await service.getRequirement(party(), 'RFQ-0001')).items
      expect(item).not.toHaveProperty(key)
    },
  )

  it('carries no supplier, staff or internal value even when the row holds some', async () => {
    const polluted = {
      ...row(),
      awardedSupplierId: 'sup-99',
      createdById: 'staff-1',
      description: 'internal notes about this buyer',
      items: [
        {
          ...itemRow(),
          id: 'item-internal-id',
          remarks: 'operator remark',
          responses: [{ price: '9.99', supplier: { companyName: 'Acme Rice Mills' } }],
        } as unknown as BuyerRfqDetail['items'][number],
      ],
    } as unknown as Row

    const { service } = harness([polluted])
    const serialized = JSON.stringify(await service.getRequirement(party(), 'RFQ-0001'))

    for (const leak of [
      'sup-99',
      'staff-1',
      'internal notes',
      'item-internal-id',
      'operator remark',
      'Acme Rice Mills',
      '9.99',
    ]) {
      expect(serialized, `must not disclose ${leak}`).not.toContain(leak)
    }
  })
})

const QUOTATION_KEYS = [
  'currency',
  'grandTotal',
  'quotationNumber',
  'revisionNumber',
  'sentAt',
  'status',
  'validUntil',
]

describe('the offers TRIYARA has sent the buyer', () => {
  it('returns the account&rsquo;s quotations', async () => {
    const { service } = harness([], [quotationRow(), quotationRow({ quotationNumber: 'QT-0002' })])
    const list = await service.listQuotations(party())

    expect(list.items.map((q) => q.quotationNumber)).toEqual(['QT-0001', 'QT-0002'])
    expect(list.hasMore).toBe(false)
  })

  it('returns an empty list rather than failing when there are none', async () => {
    const { service } = harness([], [])
    expect(await service.listQuotations(party())).toEqual({ items: [], hasMore: false })
  })

  it('serialises grandTotal rather than passing a Decimal on', async () => {
    const { service } = harness([], [quotationRow()])
    const [q] = (await service.listQuotations(party())).items
    expect(typeof q?.grandTotal).toBe('string')
    expect(q?.grandTotal).toBe('12500.0000')
  })

  it('carries a null grandTotal through as null', async () => {
    // Totals are computed; an offer can exist before they are.
    const { service } = harness([], [quotationRow({ grandTotal: null })])
    const [q] = (await service.listQuotations(party())).items
    expect(q?.grandTotal).toBeNull()
  })

  it.each(['SENT', 'UNDER_NEGOTIATION', 'ACCEPTED', 'REJECTED', 'EXPIRED'])(
    'preserves the %s status it was given',
    async (status) => {
      const { service } = harness([], [quotationRow({ status: status as never })])
      const [q] = (await service.listQuotations(party())).items
      expect(q?.status).toBe(status)
    },
  )
})

describe('isolation for quotations', () => {
  it('never returns another organization&rsquo;s quotations', async () => {
    const { service } = harness([], [quotationRow({ organizationId: 'org2' })])
    expect((await service.listQuotations(party())).items).toEqual([])
  })

  it('never returns another buyer&rsquo;s quotations in the same organization', async () => {
    const { service } = harness([], [quotationRow({ buyerId: 'acct-2' })])
    expect((await service.listQuotations(party())).items).toEqual([])
  })

  it('never returns soft-deleted quotations', async () => {
    const { service } = harness([], [quotationRow({ deletedAt: new Date() })])
    expect((await service.listQuotations(party())).items).toEqual([])
  })

  it('returns only the caller&rsquo;s rows when several parties are present', async () => {
    const { service } = harness(
      [],
      [
        quotationRow({ quotationNumber: 'MINE' }),
        quotationRow({ organizationId: 'org2', quotationNumber: 'FOREIGN-ORG' }),
        quotationRow({ buyerId: 'acct-2', quotationNumber: 'FOREIGN-BUYER' }),
        quotationRow({ deletedAt: new Date(), quotationNumber: 'DELETED' }),
      ],
    )
    expect((await service.listQuotations(party())).items.map((q) => q.quotationNumber)).toEqual([
      'MINE',
    ])
  })
})

describe('the quotation scope comes from the party, not the caller', () => {
  it('accepts exactly one argument, so no account can be passed', () => {
    const { service } = harness([], [])
    expect(service.listQuotations.length).toBe(1)
  })

  it('passes the party&rsquo;s organization and account to the repository', async () => {
    const { service, calls } = harness([], [quotationRow()])
    await service.listQuotations(party())
    expect(calls).toEqual([{ organizationId: ORG, buyerId: ACCOUNT }])
  })

  it('follows the party when it names a different account', async () => {
    const { service, calls } = harness(
      [],
      [quotationRow({ buyerId: 'acct-2', quotationNumber: 'THEIRS' })],
    )
    const list = await service.listQuotations(party({ accountId: 'acct-2' }))

    expect(list.items.map((q) => q.quotationNumber)).toEqual(['THEIRS'])
    expect(calls[0]?.buyerId).toBe('acct-2')
  })
})

describe('what a quotation is allowed to carry', () => {
  it('returns exactly the approved keys', async () => {
    const { service } = harness([], [quotationRow()])
    const [q] = (await service.listQuotations(party())).items
    expect(Object.keys(q!).sort()).toEqual(QUOTATION_KEYS)
  })

  it.each([
    'id',
    'organizationId',
    'buyerId',
    'primaryRfqId',
    'items',
    'sourceOptions',
    'subtotal',
    'chargesTotal',
    'discountTotal',
    'taxTotal',
    'fxRate',
    'baseCurrency',
    'createdById',
    'updatedById',
    'deletedById',
    'version',
    'deletedAt',
    'type',
  ])('never carries %s', async (key) => {
    const { service } = harness([], [quotationRow()])
    const [q] = (await service.listQuotations(party())).items
    expect(q).not.toHaveProperty(key)
  })

  it('carries no supplier, sourcing or internal value even when the row holds some', async () => {
    // The money sentinels share no digits with the legitimate grand total, which
    // is `12500.0000`. A rounder figure such as `500.0000` sits inside it as a
    // substring, and this scan would fail on the total we are supposed to show.
    const polluted = {
      ...quotationRow(),
      id: 'qt-internal-id',
      primaryRfqId: 'rfq-internal-id',
      supplierId: 'sup-99',
      createdById: 'staff-1',
      subtotal: '9111.1111',
      taxTotal: '777.7777',
      items: [{ sourceOptions: [{ supplierId: 'sup-99', landedUnitCost: '6.6666' }] }],
    } as unknown as QuotationRow

    const { service } = harness([], [polluted])
    const serialized = JSON.stringify((await service.listQuotations(party())).items)

    for (const leak of [
      'qt-internal-id',
      'rfq-internal-id',
      'sup-99',
      'staff-1',
      '9111.1111',
      '777.7777',
      '6.6666',
    ]) {
      expect(serialized, `must not disclose ${leak}`).not.toContain(leak)
    }
  })
})
