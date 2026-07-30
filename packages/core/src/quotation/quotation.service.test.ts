import { buildAbilityFor, type Role } from '@triyara/auth'
import type {
  ExchangeRateRecord,
  QuotationRecord,
  QuotationReferenceRepository,
  QuotationRepository,
  QuotationSourcingRepository,
} from '@triyara/db'
import type { DomainEvent, EventBus } from '@triyara/events'
import { describe, expect, it } from 'vitest'

import { createQuotationService, type QuotationServiceCtx } from './quotation.service'

function ctxFor(roles: Role[]): QuotationServiceCtx {
  const user = { id: 'u1', organizationId: 'org1', email: 'a@b.com', name: 'A', roles }
  return { user, organizationId: 'org1', ability: buildAbilityFor(roles), requestId: 'r1' }
}

function makeQuotation(over: Partial<QuotationRecord> = {}): QuotationRecord {
  return {
    id: 'q1',
    organizationId: 'org1',
    quotationNumber: 'QT-2026-0001',
    revisionNumber: 1,
    previousRevisionId: null,
    supersededAt: null,
    type: 'FIRM',
    status: 'DRAFT',
    buyerId: 'acc1',
    primaryRfqId: null,
    title: 'Q3 spices',
    description: null,
    currency: 'USD',
    baseCurrency: 'USD',
    fxRate: 1,
    fxRateDate: new Date(),
    incoterm: 'CIF',
    namedPlace: null,
    destinationCountry: 'AE',
    destinationPort: 'Jebel Ali',
    paymentTermId: null,
    paymentTermsText: null,
    leadTimeDays: 21,
    packingSummary: null,
    samplingTerms: null,
    validFrom: null,
    validUntil: new Date('2026-12-31'),
    sentAt: null,
    subtotal: 1000,
    chargesTotal: 0,
    discountTotal: 0,
    taxTotal: 0,
    grandTotal: 1000,
    costTotal: 800,
    marginPercent: 20,
    createdById: 'u1',
    updatedById: null,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    items: [
      {
        id: 'li1',
        lineNumber: 1,
        quantity: 10,
        unitPrice: 100,
        unitCost: 80,
        marginPercent: 20,
      },
    ],
    charges: [],
    taxes: [],
    paymentTerm: null,
    ...over,
  } as unknown as QuotationRecord
}

const events = (sink: DomainEvent[] = []): EventBus =>
  ({
    emit: async (e: DomainEvent) => {
      sink.push(e)
    },
    subscribe: () => undefined,
  }) as unknown as EventBus

const repo = (over: Partial<QuotationRepository> = {}): QuotationRepository =>
  ({
    create: async () => makeQuotation(),
    findById: async () => makeQuotation(),
    findCurrentByNumber: async () => makeQuotation(),
    revisionChain: async () => [],
    list: async () => ({ items: [], nextCursor: null }),
    mutate: async () => makeQuotation({ version: 2 }),
    replaceItems: async () => makeQuotation({ version: 2 }),
    revise: async () => makeQuotation({ id: 'q2', revisionNumber: 2, previousRevisionId: 'q1' }),
    transition: async () => makeQuotation({ status: 'APPROVED', version: 2 }),
    approvalHistory: async () => [],
    revisionHistory: async () => [],
    softDelete: async () => makeQuotation({ status: 'WITHDRAWN', deletedAt: new Date() }),
    restore: async () => makeQuotation({ status: 'DRAFT', version: 3 }),
    ...over,
  }) as unknown as QuotationRepository

const sourcing = (over: Partial<QuotationSourcingRepository> = {}): QuotationSourcingRepository =>
  ({
    replaceOptions: async () => [],
    compareLine: async () => [],
    findOption: async () => null,
    selectOption: async () => ({}),
    replaceConditions: async () => ({ charges: [], taxes: [] }),
    listConditions: async () => ({ charges: [], taxes: [] }),
    ...over,
  }) as unknown as QuotationSourcingRepository

const rate = (over: Partial<ExchangeRateRecord> = {}): ExchangeRateRecord =>
  ({
    id: 'fx1',
    organizationId: 'org1',
    fromCurrency: 'USD',
    toCurrency: 'INR',
    rate: 83.45,
    effectiveFrom: new Date('2026-01-01'),
    effectiveTo: null,
    source: 'RBI',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  }) as unknown as ExchangeRateRecord

const reference = (
  over: Partial<QuotationReferenceRepository> = {},
): QuotationReferenceRepository =>
  ({
    createPaymentTerm: async () => ({}),
    findPaymentTerm: async () => null,
    findPaymentTermByCode: async () => null,
    listPaymentTerms: async () => ({ items: [], nextCursor: null }),
    mutatePaymentTerm: async () => ({}),
    createExchangeRate: async () => ({}),
    findRateOn: async () => rate(),
    listExchangeRates: async () => ({ items: [], nextCursor: null }),
    ...over,
  }) as unknown as QuotationReferenceRepository

function service(
  over: {
    repo?: Partial<QuotationRepository>
    sourcing?: Partial<QuotationSourcingRepository>
    reference?: Partial<QuotationReferenceRepository>
    sink?: DomainEvent[]
    approvalThreshold?: number
    minMarginPercent?: number
  } = {},
) {
  return createQuotationService({
    repo: repo(over.repo),
    sourcing: sourcing(over.sourcing),
    reference: reference(over.reference),
    events: events(over.sink),
    ...(over.approvalThreshold === undefined ? {} : { approvalThreshold: over.approvalThreshold }),
    ...(over.minMarginPercent === undefined ? {} : { minMarginPercent: over.minMarginPercent }),
  })
}

const validItems = {
  items: [
    {
      productId: 'p1',
      quantity: 10,
      unit: 'MT',
      unitPrice: 100,
      unitCost: 80,
      requiredCertifications: [],
    },
  ],
} as never

const draft = {
  quotationNumber: 'QT-2026-0001',
  type: 'FIRM',
  buyerId: 'acc1',
  currency: 'USD',
  baseCurrency: 'USD',
} as never

describe('quotation authorization', () => {
  it('lets every role read', async () => {
    const svc = service()
    await expect(svc.get(ctxFor(['READ_ONLY']), 'q1')).resolves.toBeTruthy()
  })

  it('refuses creation to a read-only actor', async () => {
    const svc = service()
    await expect(svc.create(ctxFor(['READ_ONLY']), draft, validItems)).rejects.toThrow()
  })

  it('allows an export manager to create', async () => {
    const svc = service()
    await expect(svc.create(ctxFor(['EXPORT_MANAGER']), draft, validItems)).resolves.toBeTruthy()
  })

  it('refuses restore to anyone but an admin', async () => {
    const svc = service()
    await expect(svc.restore(ctxFor(['EXPORT_MANAGER']), 'q1', 1)).rejects.toThrow()
    await expect(svc.restore(ctxFor(['ADMIN']), 'q1', 1)).resolves.toBeTruthy()
  })
})

describe('internal cost visibility', () => {
  it('hides cost and margin from a non-admin', async () => {
    const svc = service()
    const q = await svc.get(ctxFor(['EXPORT_MANAGER']), 'q1')
    expect(q.costTotal).toBeNull()
    expect(q.marginPercent).toBeNull()
    expect(q.items[0]?.unitCost).toBeNull()
  })

  it('shows cost and margin to an admin', async () => {
    const svc = service()
    const q = await svc.get(ctxFor(['ADMIN']), 'q1')
    expect(Number(q.costTotal)).toBe(800)
    expect(Number(q.marginPercent)).toBe(20)
    expect(Number(q.items[0]?.unitCost)).toBe(80)
  })
})

describe('line validation', () => {
  it('rejects a line that is neither a catalog product nor a named custom item', async () => {
    const svc = service()
    await expect(
      svc.create(ctxFor(['ADMIN']), draft, {
        items: [{ quantity: 1, unit: 'MT', unitPrice: 10, requiredCertifications: [] }],
      } as never),
    ).rejects.toThrow(/productId or customProductName/)
  })

  it('rejects a zero unit price', async () => {
    const svc = service()
    await expect(
      svc.create(ctxFor(['ADMIN']), draft, {
        items: [
          { productId: 'p1', quantity: 1, unit: 'MT', unitPrice: 0, requiredCertifications: [] },
        ],
      } as never),
    ).rejects.toThrow(/unit price above zero/)
  })

  it('rejects a validity window that closes before it opens', async () => {
    const svc = service()
    await expect(
      svc.create(
        ctxFor(['ADMIN']),
        {
          ...(draft as object),
          validFrom: new Date('2026-06-01'),
          validUntil: new Date('2026-05-01'),
        } as never,
        validItems,
      ),
    ).rejects.toThrow(/must fall after/)
  })
})

describe('fx freezing', () => {
  it('stores the rate in force so a later read cannot drift', async () => {
    let stored: unknown
    const svc = service({
      repo: {
        create: async (_ctx, data) => {
          stored = data
          return makeQuotation()
        },
      },
    })
    await svc.create(
      ctxFor(['ADMIN']),
      { ...(draft as object), currency: 'USD', baseCurrency: 'INR' } as never,
      validItems,
    )
    expect((stored as { fxRate: number }).fxRate).toBe(83.45)
  })

  it('refuses to quote across currencies with no rate on file', async () => {
    const svc = service({ reference: { findRateOn: async () => null } })
    await expect(
      svc.create(
        ctxFor(['ADMIN']),
        { ...(draft as object), currency: 'GBP', baseCurrency: 'INR' } as never,
        validItems,
      ),
    ).rejects.toThrow(/No exchange rate is on file/)
  })

  it('uses a rate of 1 when quote and base currency match', async () => {
    let stored: unknown
    const svc = service({
      repo: {
        create: async (_ctx, data) => {
          stored = data
          return makeQuotation()
        },
      },
    })
    await svc.create(ctxFor(['ADMIN']), draft, validItems)
    expect((stored as { fxRate: number }).fxRate).toBe(1)
  })
})

describe('immutability after send', () => {
  for (const status of ['SENT', 'ACCEPTED', 'UNDER_NEGOTIATION', 'EXPIRED'] as const) {
    it(`refuses to edit a ${status} quotation`, async () => {
      const svc = service({ repo: { findById: async () => makeQuotation({ status }) } })
      await expect(svc.update(ctxFor(['ADMIN']), 'q1', 1, {} as never)).rejects.toThrow(
        /cannot be edited|revision/,
      )
    })

    it(`refuses to replace lines on a ${status} quotation`, async () => {
      const svc = service({ repo: { findById: async () => makeQuotation({ status }) } })
      await expect(svc.replaceItems(ctxFor(['ADMIN']), 'q1', 1, validItems)).rejects.toThrow(
        /frozen|revision/,
      )
    })

    it(`refuses to reprice a ${status} quotation`, async () => {
      const svc = service({ repo: { findById: async () => makeQuotation({ status }) } })
      await expect(svc.setConditions(ctxFor(['ADMIN']), 'q1', 1, [], [])).rejects.toThrow(
        /frozen|revision/,
      )
    })
  }

  it('allows edits while the quotation is still a draft', async () => {
    const svc = service()
    await expect(svc.update(ctxFor(['ADMIN']), 'q1', 1, {} as never)).resolves.toBeTruthy()
  })
})

describe('status transitions', () => {
  it('moves a draft to pending approval', async () => {
    const sink: DomainEvent[] = []
    const svc = service({ sink })
    await svc.transition(ctxFor(['ADMIN']), 'q1', 1, { decision: 'PENDING' } as never)
    expect(sink.map((e) => e.type)).toContain('quotation.pending_approval')
  })

  it('rejects a transition that is not on the lifecycle', async () => {
    const svc = service({ repo: { findById: async () => makeQuotation({ status: 'ACCEPTED' }) } })
    await expect(
      svc.transition(ctxFor(['ADMIN']), 'q1', 1, { decision: 'APPROVED' } as never),
    ).rejects.toThrow(/cannot move to/)
  })

  it('never lets SUPERSEDED be set by hand', async () => {
    const svc = service()
    await expect(
      svc.transition(ctxFor(['ADMIN']), 'q1', 1, { decision: 'SUPERSEDED' } as never),
    ).rejects.toThrow(/Unsupported decision/)
  })

  it('refuses to send a quotation with no lines', async () => {
    const svc = service({
      repo: { findById: async () => makeQuotation({ status: 'APPROVED', items: [] as never }) },
    })
    await expect(svc.send(ctxFor(['ADMIN']), 'q1', 1)).rejects.toThrow(/no lines/)
  })

  it('refuses to send a quotation with no validity date', async () => {
    const svc = service({
      repo: { findById: async () => makeQuotation({ status: 'APPROVED', validUntil: null }) },
    })
    await expect(svc.send(ctxFor(['ADMIN']), 'q1', 1)).rejects.toThrow(/validity date/)
  })

  it('refuses to send from a status that has not been approved', async () => {
    const svc = service({ repo: { findById: async () => makeQuotation({ status: 'DRAFT' }) } })
    await expect(svc.send(ctxFor(['ADMIN']), 'q1', 1)).rejects.toThrow(/cannot be sent/)
  })

  it('sends an approved quotation and announces it', async () => {
    const sink: DomainEvent[] = []
    const svc = service({
      repo: { findById: async () => makeQuotation({ status: 'APPROVED' }) },
      sink,
    })
    await svc.send(ctxFor(['ADMIN']), 'q1', 1)
    expect(sink.map((e) => e.type)).toContain('quotation.sent')
  })
})

describe('approval thresholds', () => {
  it('lets an export manager approve an ordinary quotation', async () => {
    const svc = service({ approvalThreshold: 1_000_000, minMarginPercent: 10 })
    await expect(
      svc.transition(ctxFor(['EXPORT_MANAGER']), 'q1', 1, { decision: 'APPROVED' } as never),
    ).resolves.toBeTruthy()
  })

  it('demands an admin above the value threshold', async () => {
    const high = {
      repo: { findById: async () => makeQuotation({ grandTotal: 5_000_000 as never }) },
    }
    await expect(
      service({ ...high, approvalThreshold: 1_000_000 }).transition(
        ctxFor(['EXPORT_MANAGER']),
        'q1',
        1,
        { decision: 'APPROVED' } as never,
      ),
    ).rejects.toThrow()
    await expect(
      service({ ...high, approvalThreshold: 1_000_000 }).transition(ctxFor(['ADMIN']), 'q1', 1, {
        decision: 'APPROVED',
      } as never),
    ).resolves.toBeTruthy()
  })

  it('demands an admin below the margin floor', async () => {
    const thin = { repo: { findById: async () => makeQuotation({ marginPercent: 3 as never }) } }
    await expect(
      service({ ...thin, minMarginPercent: 10 }).transition(ctxFor(['EXPORT_MANAGER']), 'q1', 1, {
        decision: 'APPROVED',
      } as never),
    ).rejects.toThrow()
    await expect(
      service({ ...thin, minMarginPercent: 10 }).transition(ctxFor(['ADMIN']), 'q1', 1, {
        decision: 'APPROVED',
      } as never),
    ).resolves.toBeTruthy()
  })

  it('does not gate a rejection behind the approval threshold', async () => {
    const svc = service({
      repo: {
        findById: async () => makeQuotation({ status: 'SENT', grandTotal: 5_000_000 as never }),
      },
      approvalThreshold: 1_000_000,
    })
    await expect(
      svc.transition(ctxFor(['EXPORT_MANAGER']), 'q1', 1, { decision: 'REJECTED' } as never),
    ).resolves.toBeTruthy()
  })
})

describe('repricing', () => {
  it('recomputes and persists totals when conditions change', async () => {
    let applied: unknown
    const svc = service({
      repo: {
        mutate: async (_ctx, _id, _v, _data, totals) => {
          applied = totals
          return makeQuotation({ version: 2 })
        },
      },
    })
    await svc.setConditions(
      ctxFor(['ADMIN']),
      'q1',
      1,
      [
        {
          type: 'FREIGHT',
          scope: 'HEADER',
          basis: 'FIXED_AMOUNT',
          amount: 200,
          currency: 'USD',
          isDeduction: false,
          sequence: 0,
        },
      ] as never,
      [
        {
          type: 'IGST',
          ratePercent: 18,
          taxableAmount: 0,
          amount: 0,
          currency: 'USD',
          isCompound: false,
          isReverseCharge: false,
          sequence: 0,
        },
      ] as never,
    )
    // 1000 subtotal + 200 freight, taxed at 18% => 1416.
    expect(applied).toMatchObject({
      subtotal: 1000,
      chargesTotal: 200,
      taxTotal: 216,
      grandTotal: 1416,
    })
  })

  it('rejects a charge aimed at a line on another quotation', async () => {
    const svc = service()
    await expect(
      svc.setConditions(
        ctxFor(['ADMIN']),
        'q1',
        1,
        [
          {
            quotationItemId: 'not-mine',
            type: 'FREIGHT',
            scope: 'LINE',
            basis: 'FIXED_AMOUNT',
            amount: 1,
            currency: 'USD',
            isDeduction: false,
            sequence: 0,
          },
        ] as never,
        [],
      ),
    ).rejects.toThrow(/not on this quotation/)
  })

  it('rejects a tax aimed at a line on another quotation', async () => {
    const svc = service()
    await expect(
      svc.setConditions(ctxFor(['ADMIN']), 'q1', 1, [], [
        {
          quotationItemId: 'not-mine',
          type: 'IGST',
          ratePercent: 5,
          taxableAmount: 0,
          amount: 0,
          currency: 'USD',
          isCompound: false,
          isReverseCharge: false,
          sequence: 0,
        },
      ] as never),
    ).rejects.toThrow(/not on this quotation/)
  })

  it('carries header conditions into a line replacement', async () => {
    let applied: unknown
    const svc = service({
      repo: {
        replaceItems: async (_ctx, _id, _v, _items, totals) => {
          applied = totals
          return makeQuotation({ version: 2 })
        },
      },
      sourcing: {
        listConditions: async () =>
          ({
            charges: [
              {
                quotationItemId: null,
                basis: 'FIXED_AMOUNT',
                rate: null,
                amount: 500,
                isDeduction: false,
                sequence: 0,
              },
            ],
            // A line-scoped condition cannot survive: its target line is gone.
            taxes: [
              {
                quotationItemId: 'old-line',
                ratePercent: 18,
                isCompound: false,
                isReverseCharge: false,
                sequence: 0,
              },
            ],
          }) as never,
      },
    })
    await svc.replaceItems(ctxFor(['ADMIN']), 'q1', 1, validItems)
    expect(applied).toMatchObject({
      subtotal: 1000,
      chargesTotal: 500,
      taxTotal: 0,
      grandTotal: 1500,
    })
  })
})

describe('revisions', () => {
  it('forks a new revision and announces the supersession', async () => {
    const sink: DomainEvent[] = []
    const svc = service({ sink })
    const next = await svc.revise(ctxFor(['ADMIN']), 'q1', 1, validItems, {
      reason: 'Buyer renegotiated freight.',
    } as never)
    expect(next.revisionNumber).toBe(2)
    expect(next.previousRevisionId).toBe('q1')
    const revised = sink.find((e) => e.type === 'quotation.revised')
    expect(revised?.data).toMatchObject({ supersededId: 'q1', revisionNumber: 2 })
  })

  it('refuses to revise a row that has already been superseded', async () => {
    const svc = service({
      repo: { findById: async () => makeQuotation({ supersededAt: new Date() }) },
    })
    await expect(
      svc.revise(ctxFor(['ADMIN']), 'q1', 1, validItems, { reason: 'x' } as never),
    ).rejects.toThrow(/already been superseded/)
  })
})

describe('withdrawal', () => {
  it('withdraws rather than erases', async () => {
    const sink: DomainEvent[] = []
    const svc = service({ sink })
    const removed = await svc.remove(ctxFor(['ADMIN']), 'q1', 1)
    expect(removed.status).toBe('WITHDRAWN')
    expect(removed.deletedAt).not.toBeNull()
    expect(sink.map((e) => e.type)).toContain('quotation.withdrawn')
  })
})

describe('list', () => {
  it('translates the string flags the query layer supplies', async () => {
    let params: unknown
    const svc = service({
      repo: {
        list: async (p) => {
          params = p
          return { items: [], nextCursor: null }
        },
      },
    })
    await svc.list(ctxFor(['READ_ONLY']), {
      limit: 25,
      currentOnly: 'true',
      includeDeleted: 'false',
    } as never)
    expect(params).toMatchObject({
      organizationId: 'org1',
      currentOnly: true,
      includeDeleted: false,
    })
  })
})
