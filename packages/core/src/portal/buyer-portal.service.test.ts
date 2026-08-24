import type {
  BuyerDocumentItem,
  BuyerDocumentListResult,
  BuyerQuotationDetail,
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

/** One offer as `buyerQuotationDetailSelect` returns it, plus the scope columns. */
interface QuotationDetailRow extends BuyerQuotationDetail {
  organizationId: string
  buyerId: string
  deletedAt: Date | null
}

function detailRow(over: Partial<QuotationDetailRow> = {}): QuotationDetailRow {
  return {
    organizationId: ORG,
    buyerId: ACCOUNT,
    deletedAt: null,
    quotationNumber: 'QT-0001',
    revisionNumber: 2,
    type: 'FIRM',
    status: 'SENT',
    title: 'Basmati rice, 25t FOB Nhava Sheva',
    currency: 'USD',
    subtotal: '11000.0000' as unknown as never,
    chargesTotal: '1200.0000' as unknown as never,
    discountTotal: '200.0000' as unknown as never,
    taxTotal: '500.0000' as unknown as never,
    grandTotal: '12500.0000' as unknown as never,
    incoterm: 'FOB',
    namedPlace: 'Nhava Sheva',
    destinationCountry: 'GB',
    destinationPort: 'Felixstowe',
    paymentTermsText: '30% advance, balance against BL copy',
    leadTimeDays: 45,
    packingSummary: '25kg PP bags, 40 per pallet',
    samplingTerms: 'Pre-shipment sample on request',
    sentAt: new Date('2026-08-10'),
    validFrom: new Date('2026-08-10'),
    validUntil: new Date('2026-10-10'),
    acceptedAt: null,
    rejectedAt: null,
    items: [detailLine()],
    charges: [detailCharge()],
    ...over,
  } as QuotationDetailRow
}

function detailLine(
  over: Partial<BuyerQuotationDetail['items'][number]> = {},
): BuyerQuotationDetail['items'][number] {
  return {
    lineNumber: 1,
    customProductName: null,
    product: { name: 'Sona Masoori, unpolished' },
    quantity: '25' as unknown as never,
    unit: 'MT',
    unitPrice: '440.0000' as unknown as never,
    lineSubtotal: '11000.0000' as unknown as never,
    packaging: '25kg PP bags',
    hsCode: '10063020',
    countryOfOrigin: 'IN',
    requiredCertifications: ['ORGANIC'],
    leadTimeDays: 45,
    ...over,
  } as BuyerQuotationDetail['items'][number]
}

function detailCharge(
  over: Partial<BuyerQuotationDetail['charges'][number]> = {},
): BuyerQuotationDetail['charges'][number] {
  return {
    type: 'FREIGHT',
    label: 'Ocean freight',
    amount: '1200.0000' as unknown as never,
    currency: 'USD',
    isDeduction: false,
    ...over,
  } as BuyerQuotationDetail['charges'][number]
}

/** A document as `buyerDocumentSelect` returns it, plus the scope columns. */
interface DocumentRow extends BuyerDocumentItem {
  organizationId: string
  accountId: string
  deletedAt: Date | null
}

function documentRow(over: Partial<DocumentRow> = {}): DocumentRow {
  return {
    organizationId: ORG,
    accountId: ACCOUNT,
    deletedAt: null,
    title: 'GST certificate',
    type: 'GST',
    status: 'RECEIVED',
    issuedDate: new Date('2026-01-15'),
    expiryDate: new Date('2027-01-15'),
    currentOriginalFilename: 'gst-certificate.pdf',
    currentFileSize: 248_512,
    currentMimeType: 'application/pdf',
    createdAt: new Date('2026-02-01'),
    ...over,
  } as DocumentRow
}

function harness(
  rows: Row[],
  quotationRows: QuotationRow[] = [],
  detailRows: QuotationDetailRow[] = [],
  documentRows: DocumentRow[] = [],
) {
  const calls: { organizationId: string; buyerId: string }[] = []

  const service = createBuyerPortalService({
    documents: {
      async listDocumentsForBuyer(
        organizationId,
        accountId,
        limit = 50,
      ): Promise<BuyerDocumentListResult> {
        calls.push({ organizationId, buyerId: accountId })
        const found = documentRows.filter(
          (d) =>
            matches(d.organizationId, organizationId) &&
            matches(d.accountId, accountId) &&
            d.deletedAt === null,
        )
        return {
          items: found.slice(0, limit) as BuyerDocumentItem[],
          hasMore: found.length > limit,
        }
      },
    },
    quotations: {
      async findQuotationForBuyer(
        organizationId,
        buyerId,
        quotationNumber,
      ): Promise<BuyerQuotationDetail | null> {
        calls.push({ organizationId, buyerId })
        // Newest revision first, as the real query orders it.
        const found = detailRows
          .filter(
            (q) =>
              matches(q.organizationId, organizationId) &&
              matches(q.buyerId, buyerId) &&
              matches(q.quotationNumber, quotationNumber) &&
              q.deletedAt === null,
          )
          .sort((a, b) => b.revisionNumber - a.revisionNumber)
        return (found[0] as BuyerQuotationDetail | undefined) ?? null
      },
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

/**
 * One offer, opened by the buyer we made it to.
 *
 * The same fake table as above, keyed by number rather than listed, and applying
 * Prisma's `undefined` semantics for the same reason: a dropped scope must widen
 * the query in the fake exactly as it would in the database, or these tests pass
 * against a repository that has stopped scoping.
 */
describe('the quotation detail scope comes from the party, not the caller', () => {
  it('accepts exactly two arguments, so no account can be passed', () => {
    const { service } = harness([], [], [detailRow()])
    expect(service.getQuotation.length).toBe(2)
  })

  it('passes the party organization to the repository', async () => {
    const { service, calls } = harness([], [], [detailRow()])
    await service.getQuotation(party(), 'QT-0001')
    expect(calls[0]?.organizationId).toBe(ORG)
  })

  it('passes the party account as the buyer', async () => {
    const { service, calls } = harness([], [], [detailRow()])
    await service.getQuotation(party(), 'QT-0001')
    expect(calls[0]?.buyerId).toBe(ACCOUNT)
  })

  it('follows the signed-in party when it changes, never a stored value', async () => {
    const { service, calls } = harness([], [], [detailRow()])
    await service
      .getQuotation(party({ organizationId: 'org9', accountId: 'acct-9' }), 'QT-0001')
      .catch(() => null)
    expect(calls[0]).toEqual({ organizationId: 'org9', buyerId: 'acct-9' })
  })
})

describe('isolation for one quotation', () => {
  it('refuses another organization&rsquo;s offer', async () => {
    const { service } = harness([], [], [detailRow({ organizationId: 'org2' })])
    await expect(service.getQuotation(party(), 'QT-0001')).rejects.toThrow(
      /not available for your account/,
    )
  })

  it('refuses another buyer&rsquo;s offer in the same organization', async () => {
    const { service } = harness([], [], [detailRow({ buyerId: 'acct-2' })])
    await expect(service.getQuotation(party(), 'QT-0001')).rejects.toThrow(
      /not available for your account/,
    )
  })

  it('refuses a soft-deleted offer', async () => {
    const { service } = harness([], [], [detailRow({ deletedAt: new Date() })])
    await expect(service.getQuotation(party(), 'QT-0001')).rejects.toThrow(
      /not available for your account/,
    )
  })

  it('refuses a number that does not exist', async () => {
    const { service } = harness([], [], [detailRow()])
    await expect(service.getQuotation(party(), 'QT-9999')).rejects.toThrow(
      /not available for your account/,
    )
  })

  it('refuses with the same message in every case', async () => {
    // The point of the refusal, not an incidental detail: four different
    // reasons, one sentence, so the answer never says whether somebody else's
    // offer exists.
    const cases = [
      harness([], [], [detailRow({ organizationId: 'org2' })]),
      harness([], [], [detailRow({ buyerId: 'acct-2' })]),
      harness([], [], [detailRow({ deletedAt: new Date() })]),
      harness([], [], []),
    ]

    const messages: string[] = []
    for (const { service } of cases) {
      await service.getQuotation(party(), 'QT-0001').catch((e: Error) => messages.push(e.message))
    }

    expect(messages).toHaveLength(4)
    expect(new Set(messages).size).toBe(1)
  })

  it('refuses with the same message the requirement detail uses', async () => {
    // One portal, one refusal. If these ever diverge, the pair of messages
    // becomes a way to tell the two lookups apart.
    const quotation = harness([], [], [])
    const requirement = harness([], [], [])

    const a = await quotation.service
      .getQuotation(party(), 'QT-0001')
      .catch((e: Error) => e.message)
    const b = await requirement.service
      .getRequirement(party(), 'RFQ-0001')
      .catch((e: Error) => e.message)

    expect(a).toBe(b)
  })
})

describe('which revision the buyer is shown', () => {
  it('returns the newest revision when more than one is visible', async () => {
    // `quotationNumber` is unique only WITH `revisionNumber`, so the order is
    // part of the contract rather than an accident of insertion.
    const { service } = harness(
      [],
      [],
      [detailRow({ revisionNumber: 2 }), detailRow({ revisionNumber: 5 })],
    )
    expect((await service.getQuotation(party(), 'QT-0001')).revisionNumber).toBe(5)
  })

  it('does not cross to another number', async () => {
    const { service } = harness(
      [],
      [],
      [detailRow(), detailRow({ quotationNumber: 'QT-0002', revisionNumber: 9 })],
    )
    expect((await service.getQuotation(party(), 'QT-0001')).quotationNumber).toBe('QT-0001')
  })
})

describe('what a quotation detail is allowed to carry', () => {
  it('returns exactly the approved header keys', async () => {
    const { service } = harness([], [], [detailRow()])
    const detail = await service.getQuotation(party(), 'QT-0001')

    expect(Object.keys(detail).sort()).toEqual([
      'acceptedAt',
      'charges',
      'chargesTotal',
      'currency',
      'destinationCountry',
      'destinationPort',
      'discountTotal',
      'grandTotal',
      'incoterm',
      'leadTimeDays',
      'lines',
      'namedPlace',
      'packingSummary',
      'paymentTermsText',
      'quotationNumber',
      'rejectedAt',
      'revisionNumber',
      'samplingTerms',
      'sentAt',
      'status',
      'subtotal',
      'taxTotal',
      'title',
      'type',
      'validFrom',
      'validUntil',
    ])
  })

  it('returns exactly the approved line keys', async () => {
    const { service } = harness([], [], [detailRow()])
    const [line] = (await service.getQuotation(party(), 'QT-0001')).lines

    expect(Object.keys(line!).sort()).toEqual([
      'countryOfOrigin',
      'hsCode',
      'leadTimeDays',
      'lineNumber',
      'lineSubtotal',
      'packaging',
      'productName',
      'quantity',
      'requiredCertifications',
      'unit',
      'unitPrice',
    ])
  })

  it('returns exactly the approved charge keys', async () => {
    const { service } = harness([], [], [detailRow()])
    const [charge] = (await service.getQuotation(party(), 'QT-0001')).charges

    expect(Object.keys(charge!).sort()).toEqual([
      'amount',
      'currency',
      'isDeduction',
      'label',
      'type',
    ])
  })

  it.each([
    'id',
    'organizationId',
    'buyerId',
    'primaryRfqId',
    'previousRevisionId',
    'supersededAt',
    'description',
    'baseCurrency',
    'fxRate',
    'fxRateDate',
    'paymentTermId',
    'costTotal',
    'marginPercent',
    'rejectionReason',
    'createdById',
    'updatedById',
    'deletedById',
    'version',
    'createdAt',
    'updatedAt',
    'deletedAt',
    'items',
  ])('never carries %s at the header', async (key) => {
    const { service } = harness([], [], [detailRow()])
    expect(await service.getQuotation(party(), 'QT-0001')).not.toHaveProperty(key)
  })

  it.each([
    'id',
    'quotationId',
    'organizationId',
    'productId',
    'rfqItemId',
    'description',
    'unitCost',
    'marginPercent',
    'lineTotal',
    'remarks',
    'version',
    'deletedAt',
    'product',
    'sourceOptions',
    'charges',
    'taxes',
  ])('never carries %s on a line', async (key) => {
    const { service } = harness([], [], [detailRow()])
    const [line] = (await service.getQuotation(party(), 'QT-0001')).lines
    expect(line).not.toHaveProperty(key)
  })

  it('serialises every money field as a string, never a Decimal object', async () => {
    const { service } = harness([], [], [detailRow()])
    const detail = await service.getQuotation(party(), 'QT-0001')

    for (const key of [
      'subtotal',
      'chargesTotal',
      'discountTotal',
      'taxTotal',
      'grandTotal',
    ] as const) {
      expect(typeof detail[key], key).toBe('string')
    }
    expect(typeof detail.lines[0]!.unitPrice).toBe('string')
    expect(typeof detail.lines[0]!.lineSubtotal).toBe('string')
    expect(typeof detail.lines[0]!.quantity).toBe('string')
    expect(typeof detail.charges[0]!.amount).toBe('string')
  })

  it('keeps a null total null rather than inventing a zero', async () => {
    const { service } = harness([], [], [detailRow({ grandTotal: null as unknown as never })])
    expect((await service.getQuotation(party(), 'QT-0001')).grandTotal).toBeNull()
  })

  it('names a line by its catalogue product when it has one', async () => {
    const { service } = harness([], [], [detailRow()])
    expect((await service.getQuotation(party(), 'QT-0001')).lines[0]?.productName).toBe(
      'Sona Masoori, unpolished',
    )
  })

  it('falls back to the free-text name when the line names no product', async () => {
    const { service } = harness(
      [],
      [],
      [
        detailRow({
          items: [
            detailLine({ product: null, customProductName: 'Unlisted parboiled rice' }),
          ] as unknown as BuyerQuotationDetail['items'],
        }),
      ],
    )
    expect((await service.getQuotation(party(), 'QT-0001')).lines[0]?.productName).toBe(
      'Unlisted parboiled rice',
    )
  })

  it('carries an offer with no lines rather than refusing it', async () => {
    const { service } = harness(
      [],
      [],
      [detailRow({ items: [] as unknown as BuyerQuotationDetail['items'] })],
    )
    expect((await service.getQuotation(party(), 'QT-0001')).lines).toEqual([])
  })

  it('carries an offer with no visible charges', async () => {
    const { service } = harness(
      [],
      [],
      [detailRow({ charges: [] as unknown as BuyerQuotationDetail['charges'] })],
    )
    expect((await service.getQuotation(party(), 'QT-0001')).charges).toEqual([])
  })

  it('carries no supplier, sourcing or internal value even when the row holds some', async () => {
    // The money sentinels share no digits with any legitimate total on this
    // fixture - 11000.0000, 1200.0000, 200.0000, 500.0000, 12500.0000,
    // 440.0000 - because a rounder decoy would sit inside one as a substring
    // and fail the scan on a number we are supposed to show.
    const polluted = {
      ...detailRow(),
      id: 'qt-internal-id',
      primaryRfqId: 'rfq-internal-id',
      createdById: 'staff-1',
      costTotal: '9111.1111',
      marginPercent: '27.7777',
      rejectionReason: 'internal rejection note',
      items: [
        {
          ...detailLine(),
          id: 'qti-internal-id',
          rfqItemId: 'rfqi-internal-id',
          unitCost: '333.3333',
          marginPercent: '18.8888',
          lineTotal: '66666.6666',
          remarks: 'operator remark that must not be mapped',
          sourceOptions: [
            { supplierId: 'sup-99', companyName: 'Acme Rice Mills', landedUnitCost: '6.6666' },
          ],
        },
      ],
    } as unknown as QuotationDetailRow

    const { service } = harness([], [], [polluted])
    const serialized = JSON.stringify(await service.getQuotation(party(), 'QT-0001'))

    for (const leak of [
      'qt-internal-id',
      'rfq-internal-id',
      'qti-internal-id',
      'rfqi-internal-id',
      'staff-1',
      '9111.1111',
      '27.7777',
      '333.3333',
      '18.8888',
      '66666.6666',
      'internal rejection note',
      'operator remark',
      'sup-99',
      'Acme Rice Mills',
      '6.6666',
    ]) {
      expect(serialized, `must not disclose ${leak}`).not.toContain(leak)
    }
  })
})

/**
 * The documents on the buyer's own account.
 *
 * The same in-memory table as everywhere else in this file, applying Prisma's
 * `undefined` semantics: a dropped scope WIDENS the query rather than emptying
 * it. That is what makes the isolation cases below meaningful - against a fake
 * that compared strictly they would pass even if the repository had stopped
 * scoping.
 */
describe('the document scope comes from the party, not the caller', () => {
  it('accepts exactly one argument, so no account can be passed', () => {
    const { service } = harness([], [], [], [documentRow()])
    expect(service.listDocuments.length).toBe(1)
  })

  it('passes the party organization to the repository', async () => {
    const { service, calls } = harness([], [], [], [documentRow()])
    await service.listDocuments(party())
    expect(calls[0]?.organizationId).toBe(ORG)
  })

  it('passes the party account as the owner', async () => {
    const { service, calls } = harness([], [], [], [documentRow()])
    await service.listDocuments(party())
    expect(calls[0]?.buyerId).toBe(ACCOUNT)
  })

  it('follows the signed-in party when it changes, never a stored value', async () => {
    const { service, calls } = harness([], [], [], [documentRow()])
    await service.listDocuments(party({ organizationId: 'org9', accountId: 'acct-9' }))
    expect(calls[0]).toEqual({ organizationId: 'org9', buyerId: 'acct-9' })
  })
})

describe('isolation for documents', () => {
  it('never returns another organization&rsquo;s documents', async () => {
    const { service } = harness([], [], [], [documentRow({ organizationId: 'org2' })])
    expect((await service.listDocuments(party())).items).toEqual([])
  })

  it('never returns another account&rsquo;s documents in the same organization', async () => {
    const { service } = harness([], [], [], [documentRow({ accountId: 'acct-2' })])
    expect((await service.listDocuments(party())).items).toEqual([])
  })

  it('never returns a soft-deleted document', async () => {
    const { service } = harness([], [], [], [documentRow({ deletedAt: new Date() })])
    expect((await service.listDocuments(party())).items).toEqual([])
  })

  it('returns an empty list for an account with nothing, rather than refusing', async () => {
    // An account with no documents is a true answer, not an error. The refusals
    // that matter happened in `resolve`, before this was reached.
    const { service } = harness([], [], [], [])
    expect(await service.listDocuments(party())).toEqual({ items: [], hasMore: false })
  })

  it('returns every document the account does own', async () => {
    const { service } = harness(
      [],
      [],
      [],
      [documentRow(), documentRow({ title: 'IEC certificate', type: 'IEC' })],
    )
    expect((await service.listDocuments(party())).items).toHaveLength(2)
  })
})

describe('what a document is allowed to carry', () => {
  it('returns exactly the approved keys', async () => {
    const { service } = harness([], [], [], [documentRow()])
    const [doc] = (await service.listDocuments(party())).items

    expect(Object.keys(doc!).sort()).toEqual([
      'expiryDate',
      'fileName',
      'fileSize',
      'issuedDate',
      'mimeType',
      'status',
      'title',
      'type',
      'uploadedAt',
    ])
  })

  it.each([
    'id',
    'organizationId',
    'accountId',
    'supplierProfileId',
    'currentStorageKey',
    'currentChecksum',
    'currentOriginalFilename',
    'currentFileSize',
    'currentMimeType',
    'currentFileVersion',
    'createdById',
    'updatedById',
    'deletedById',
    'version',
    'deletedAt',
    'createdAt',
    'updatedAt',
  ])('never carries %s', async (key) => {
    const { service } = harness([], [], [], [documentRow()])
    const [doc] = (await service.listDocuments(party())).items
    expect(doc).not.toHaveProperty(key)
  })

  it('carries no storage key, checksum or staff name even when the row holds some', async () => {
    // The storage key is the one that matters most: it is the path that would
    // fetch the file, and a key in a payload is a key in the DOM.
    const polluted = {
      ...documentRow(),
      id: 'doc-internal-id',
      supplierProfileId: 'sp-internal-1',
      currentStorageKey: 'org1/acct-1/9111111/gst-certificate.pdf',
      currentChecksum: 'sha256-7777777777',
      createdById: 'staff-1',
      updatedById: 'staff-2',
      deletedById: 'staff-3',
      version: 7,
    } as unknown as DocumentRow

    const { service } = harness([], [], [], [polluted])
    const serialized = JSON.stringify((await service.listDocuments(party())).items)

    for (const leak of [
      'doc-internal-id',
      'sp-internal-1',
      '9111111/gst-certificate.pdf',
      'sha256-7777777777',
      'staff-1',
      'staff-2',
      'staff-3',
    ]) {
      expect(serialized, `must not disclose ${leak}`).not.toContain(leak)
    }
  })

  it('renames the current* columns to buyer-facing names', async () => {
    const { service } = harness([], [], [], [documentRow()])
    const [doc] = (await service.listDocuments(party())).items
    expect(doc?.fileName).toBe('gst-certificate.pdf')
    expect(doc?.fileSize).toBe(248_512)
    expect(doc?.mimeType).toBe('application/pdf')
    expect(doc?.uploadedAt).toEqual(new Date('2026-02-01'))
  })

  it.each(['PENDING', 'RECEIVED', 'VERIFIED', 'EXPIRED', 'REJECTED'])(
    'preserves the %s status it was given',
    async (status) => {
      const { service } = harness([], [], [], [documentRow({ status: status as never })])
      const [doc] = (await service.listDocuments(party())).items
      expect(doc?.status).toBe(status)
    },
  )

  it('keeps a missing date null rather than inventing one', async () => {
    const { service } = harness([], [], [], [documentRow({ issuedDate: null, expiryDate: null })])
    const [doc] = (await service.listDocuments(party())).items
    expect(doc?.issuedDate).toBeNull()
    expect(doc?.expiryDate).toBeNull()
  })
})
