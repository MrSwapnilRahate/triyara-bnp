import { buildAbilityFor, type Role } from '@triyara/auth'
import type { RfqRecord, RfqRepository, RfqSupplierRepository } from '@triyara/db'
import type { DomainEvent, EventBus } from '@triyara/events'
import { PreconditionFailedError } from '@triyara/lib'
import { describe, expect, it } from 'vitest'

import { createRfqService, type RfqServiceCtx } from './rfq.service'
import { createRfqSupplierService } from './rfq-supplier.service'

function ctxFor(roles: Role[]): RfqServiceCtx {
  const user = { id: 'u1', organizationId: 'org1', email: 'a@b.com', name: 'A', roles }
  return { user, organizationId: 'org1', ability: buildAbilityFor(roles), requestId: 'r1' }
}

function makeRfq(over: Partial<RfqRecord> = {}): RfqRecord {
  return {
    id: 'rfq1',
    organizationId: 'org1',
    rfqNumber: 'RFQ-2026-000001',
    type: 'BUYER',
    buyerId: 'acc1',
    title: 'Q3 spices',
    description: null,
    currency: 'USD',
    incoterm: 'CIF',
    destinationCountry: 'AE',
    destinationPort: 'Jebel Ali',
    expectedShipmentDate: null,
    quotationDeadline: null,
    status: 'DRAFT',
    priority: 'NORMAL',
    currentRevision: 1,
    createdById: 'u1',
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    items: [{ id: 'i1', lineNumber: 1 }],
    suppliers: [{ id: 'rs1' }],
    ...over,
  } as RfqRecord
}

const events = (sink: DomainEvent[] = []): EventBus =>
  ({
    emit: async (e: DomainEvent) => {
      sink.push(e)
    },
    subscribe: () => undefined,
  }) as unknown as EventBus

const repo = (over: Partial<RfqRepository> = {}): RfqRepository =>
  ({
    create: async () => makeRfq(),
    findById: async () => makeRfq(),
    findByNumber: async () => null,
    list: async () => ({ items: [], nextCursor: null }),
    mutate: async () => makeRfq({ version: 2 }),
    replaceItems: async () => makeRfq({ currentRevision: 2, version: 2 }),
    transition: async () => makeRfq({ status: 'PENDING_APPROVAL', version: 2 }),
    approvalHistory: async () => [],
    revisionHistory: async () => [],
    softDelete: async () => makeRfq({ deletedAt: new Date() }),
    restore: async () => makeRfq({ version: 3 }),
    ...over,
  }) as RfqRepository

const supRepo = (over: Partial<RfqSupplierRepository> = {}): RfqSupplierRepository =>
  ({
    invite: async () => [],
    findParticipation: async () =>
      ({ id: 'rs1', rfqId: 'rfq1', supplierId: 's1', status: 'INVITED', version: 1 }) as never,
    listParticipation: async () => [],
    setStatus: async () => ({ id: 'rs1', status: 'VIEWED' }) as never,
    submitResponse: async () => ({
      participation: { id: 'rs1', isLate: false } as never,
      lines: [{ id: 'l1' } as never],
    }),
    listResponses: async () => ({ items: [], nextCursor: null }),
    compareLine: async () => [],
    priceHistory: async () => [],
    ...over,
  }) as RfqSupplierRepository

const ITEM = [{ productId: 'p1', quantity: 10, unit: 'MT', requiredCertifications: [] as never }]

describe('rfq service - authorization', () => {
  it('lets an EXPORT_MANAGER raise an RFQ', async () => {
    const sink: DomainEvent[] = []
    const svc = createRfqService({ repo: repo(), events: events(sink) })
    const r = await svc.create(
      ctxFor(['EXPORT_MANAGER']),
      {
        rfqNumber: 'RFQ-2026-000001',
        type: 'BUYER',
        buyerId: 'acc1',
        title: 'Q3',
        priority: 'NORMAL',
      },
      ITEM as never,
    )
    expect(r.rfqNumber).toBe('RFQ-2026-000001')
    expect(sink.map((e) => e.type)).toContain('rfq.created')
  })

  it('refuses RFQ creation from a READ_ONLY user', async () => {
    const svc = createRfqService({ repo: repo(), events: events() })
    await expect(
      svc.create(
        ctxFor(['READ_ONLY']),
        {
          rfqNumber: 'X',
          type: 'INTERNAL',
          title: 'X',
          priority: 'NORMAL',
        },
        ITEM as never,
      ),
    ).rejects.toThrow(/not permitted/i)
  })

  it('separates raising from approving: EXPORT_MANAGER may not approve', async () => {
    const svc = createRfqService({
      repo: repo({ findById: async () => makeRfq({ status: 'PENDING_APPROVAL' }) }),
      events: events(),
    })
    await expect(
      svc.decide(ctxFor(['EXPORT_MANAGER']), 'rfq1', 1, { decision: 'APPROVED' }),
    ).rejects.toThrow(/not permitted/i)
  })
})

describe('rfq service - buyer/type invariant', () => {
  it('requires a buyer on a BUYER rfq', async () => {
    const svc = createRfqService({ repo: repo(), events: events() })
    await expect(
      svc.create(
        ctxFor(['ADMIN']),
        {
          rfqNumber: 'X',
          type: 'BUYER',
          title: 'X',
          priority: 'NORMAL',
        },
        ITEM as never,
      ),
    ).rejects.toThrow(/buyer RFQ requires buyerId/i)
  })

  it('refuses a buyer on an INTERNAL rfq', async () => {
    const svc = createRfqService({ repo: repo(), events: events() })
    await expect(
      svc.create(
        ctxFor(['ADMIN']),
        {
          rfqNumber: 'X',
          type: 'INTERNAL',
          buyerId: 'acc1',
          title: 'X',
          priority: 'NORMAL',
        },
        ITEM as never,
      ),
    ).rejects.toThrow(/must not carry a buyer/i)
  })
})

describe('rfq service - line and date invariants', () => {
  it('refuses a line that is neither catalogued nor free text', async () => {
    const svc = createRfqService({ repo: repo(), events: events() })
    await expect(
      svc.create(
        ctxFor(['ADMIN']),
        {
          rfqNumber: 'X',
          type: 'INTERNAL',
          title: 'X',
          priority: 'NORMAL',
        },
        [{ quantity: 1, unit: 'MT', requiredCertifications: [] }] as never,
      ),
    ).rejects.toThrow(/needs either productId or customProductName/i)
  })

  it('refuses a deadline after the shipment date', async () => {
    const svc = createRfqService({ repo: repo(), events: events() })
    await expect(
      svc.create(
        ctxFor(['ADMIN']),
        {
          rfqNumber: 'X',
          type: 'INTERNAL',
          title: 'X',
          priority: 'NORMAL',
          quotationDeadline: new Date('2026-10-01'),
          expectedShipmentDate: new Date('2026-09-01'),
        },
        ITEM as never,
      ),
    ).rejects.toThrow(/must not be after expectedShipmentDate/i)
  })
})

describe('rfq service - workflow', () => {
  it('rejects an illegal transition', async () => {
    const svc = createRfqService({
      repo: repo({ findById: async () => makeRfq({ status: 'DRAFT' }) }),
      events: events(),
    })
    // DRAFT -> APPROVED skips review.
    await expect(
      svc.decide(ctxFor(['ADMIN']), 'rfq1', 1, { decision: 'APPROVED' }),
    ).rejects.toThrow(/cannot move a DRAFT RFQ to APPROVED/i)
  })

  it('refuses to approve an RFQ with no lines', async () => {
    const svc = createRfqService({
      repo: repo({
        findById: async () => makeRfq({ status: 'PENDING_APPROVAL', items: [] as never }),
      }),
      events: events(),
    })
    await expect(
      svc.decide(ctxFor(['ADMIN']), 'rfq1', 1, { decision: 'APPROVED' }),
    ).rejects.toThrow(/at least one line before approval/i)
  })

  it('refuses to issue an RFQ that is not APPROVED', async () => {
    const svc = createRfqService({
      repo: repo({ findById: async () => makeRfq({ status: 'DRAFT' }) }),
      events: events(),
    })
    await expect(svc.issue(ctxFor(['ADMIN']), 'rfq1', 1)).rejects.toThrow(
      /only an APPROVED RFQ can be issued/i,
    )
  })

  it('refuses to issue with no suppliers invited', async () => {
    const svc = createRfqService({
      repo: repo({ findById: async () => makeRfq({ status: 'APPROVED', suppliers: [] as never }) }),
      events: events(),
    })
    await expect(svc.issue(ctxFor(['ADMIN']), 'rfq1', 1)).rejects.toThrow(
      /invite at least one supplier/i,
    )
  })

  it('freezes commercial terms once issued', async () => {
    const svc = createRfqService({
      repo: repo({ findById: async () => makeRfq({ status: 'ISSUED' }) }),
      events: events(),
    })
    await expect(svc.update(ctxFor(['ADMIN']), 'rfq1', 1, { incoterm: 'FOB' })).rejects.toThrow(
      /commercial terms cannot change/i,
    )
    // A non-term field is still editable.
    await expect(
      svc.update(ctxFor(['ADMIN']), 'rfq1', 1, { title: 'Retitled' }),
    ).resolves.toBeTruthy()
  })

  it('refuses to revise lines on a closed RFQ', async () => {
    const svc = createRfqService({
      repo: repo({ findById: async () => makeRfq({ status: 'CLOSED' }) }),
      events: events(),
    })
    await expect(
      svc.reviseItems(ctxFor(['ADMIN']), 'rfq1', 1, { items: ITEM as never }),
    ).rejects.toThrow(/cannot be revised on a CLOSED RFQ/i)
  })

  it('points at restore when the number belongs to a deleted RFQ', async () => {
    const svc = createRfqService({
      repo: repo({ findByNumber: async () => makeRfq({ deletedAt: new Date() }) }),
      events: events(),
    })
    await expect(
      svc.create(
        ctxFor(['ADMIN']),
        {
          rfqNumber: 'RFQ-2026-000001',
          type: 'INTERNAL',
          title: 'X',
          priority: 'NORMAL',
        },
        ITEM as never,
      ),
    ).rejects.toThrow(/restore it instead/i)
  })
})

describe('rfq supplier service', () => {
  it('refuses to invite suppliers to a closed RFQ', async () => {
    const svc = createRfqSupplierService({
      repo: supRepo(),
      rfqs: repo({ findById: async () => makeRfq({ status: 'CLOSED' }) }),
      events: events(),
    })
    await expect(svc.invite(ctxFor(['ADMIN']), 'rfq1', { supplierIds: ['s1'] })).rejects.toThrow(
      /cannot be invited to a CLOSED RFQ/i,
    )
  })

  it('only accepts bids while the RFQ is open for them', async () => {
    const svc = createRfqSupplierService({
      repo: supRepo(),
      rfqs: repo({ findById: async () => makeRfq({ status: 'DRAFT' }) }),
      events: events(),
    })
    await expect(
      svc.submitResponse(ctxFor(['ADMIN']), 'rs1', {
        lines: [{ rfqItemId: 'i1', price: 100, currency: 'USD' }],
      }),
    ).rejects.toThrow(/bids are only accepted/i)
  })

  it('rejects the same line quoted twice in one submission', async () => {
    const svc = createRfqSupplierService({
      repo: supRepo(),
      rfqs: repo({ findById: async () => makeRfq({ status: 'ISSUED' }) }),
      events: events(),
    })
    await expect(
      svc.submitResponse(ctxFor(['ADMIN']), 'rs1', {
        lines: [
          { rfqItemId: 'i1', price: 100, currency: 'USD' },
          { rfqItemId: 'i1', price: 90, currency: 'USD' },
        ],
      }),
    ).rejects.toThrow(/quoted more than once/i)
  })

  it('rejects an illegal participation transition', async () => {
    const svc = createRfqSupplierService({
      repo: supRepo({
        findParticipation: async () => ({ id: 'rs1', status: 'WITHDRAWN', version: 1 }) as never,
      }),
      rfqs: repo(),
      events: events(),
    })
    await expect(
      svc.setParticipation(ctxFor(['ADMIN']), 'rs1', 1, { status: 'ACCEPTED' }),
    ).rejects.toThrow(/cannot move participation from WITHDRAWN/i)
  })

  it('requires a reason when declining', async () => {
    const svc = createRfqSupplierService({ repo: supRepo(), rfqs: repo(), events: events() })
    await expect(
      svc.setParticipation(ctxFor(['ADMIN']), 'rs1', 1, { status: 'DECLINED' }),
    ).rejects.toThrow(/decline needs a reason/i)
  })

  it('will not let SUBMITTED be set by hand', async () => {
    const svc = createRfqSupplierService({
      repo: supRepo({
        findParticipation: async () => ({ id: 'rs1', status: 'ACCEPTED', version: 1 }) as never,
      }),
      rfqs: repo(),
      events: events(),
    })
    await expect(
      svc.setParticipation(ctxFor(['ADMIN']), 'rs1', 1, { status: 'SUBMITTED' }),
    ).rejects.toThrow(/submit a response instead/i)
  })
})

describe('rfq service - award', () => {
  const EVALUATING = {
    status: 'EVALUATING' as const,
    suppliers: [
      { id: 'rs1', supplierId: 's1', submittedAt: new Date() },
      { id: 'rs2', supplierId: 's2', submittedAt: null },
    ],
  } as Partial<RfqRecord>

  function awardRepo(over: Partial<RfqRepository> = {}) {
    return repo({
      findById: async () => makeRfq(EVALUATING),
      award: async () =>
        makeRfq({ ...EVALUATING, status: 'AWARDED', awardedSupplierId: 's1', version: 2 }),
      ...over,
    } as Partial<RfqRepository>)
  }

  it('awards to a supplier who submitted, and emits the event', async () => {
    const sink: DomainEvent[] = []
    const svc = createRfqService({ repo: awardRepo(), events: events(sink) })

    const r = await svc.award(ctxFor(['ADMIN']), 'rfq1', 1, 'rs1')

    expect(r.status).toBe('AWARDED')
    expect(r.awardedSupplierId).toBe('s1')
    const event = sink.find((e) => e.type === 'rfq.awarded')
    expect(event).toBeDefined()
    expect(event?.data).toMatchObject({ supplierId: 's1', participationId: 'rs1' })
  })

  it('refuses an EXPORT_MANAGER - awarding needs `manage Account`', async () => {
    // Committing the business to a supplier is a different authority from
    // editing the RFQ's shipping port.
    const svc = createRfqService({ repo: awardRepo(), events: events() })
    await expect(svc.award(ctxFor(['EXPORT_MANAGER']), 'rfq1', 1, 'rs1')).rejects.toThrow()
  })

  it('refuses a READ_ONLY user', async () => {
    const svc = createRfqService({ repo: awardRepo(), events: events() })
    await expect(svc.award(ctxFor(['READ_ONLY']), 'rfq1', 1, 'rs1')).rejects.toThrow()
  })

  it('refuses when the RFQ is not EVALUATING', async () => {
    const svc = createRfqService({
      repo: awardRepo({ findById: async () => makeRfq({ ...EVALUATING, status: 'IN_PROGRESS' }) }),
      events: events(),
    })
    await expect(svc.award(ctxFor(['ADMIN']), 'rfq1', 1, 'rs1')).rejects.toThrow(
      /cannot be awarded/i,
    )
  })

  it('refuses a CLOSED round', async () => {
    const svc = createRfqService({
      repo: awardRepo({ findById: async () => makeRfq({ ...EVALUATING, status: 'CLOSED' }) }),
      events: events(),
    })
    await expect(svc.award(ctxFor(['ADMIN']), 'rfq1', 1, 'rs1')).rejects.toThrow(
      /cannot be awarded/i,
    )
  })

  it('refuses a second award - the winner is decided once', async () => {
    const svc = createRfqService({
      repo: awardRepo({
        findById: async () => makeRfq({ ...EVALUATING, awardedSupplierId: 's9' }),
      }),
      events: events(),
    })
    await expect(svc.award(ctxFor(['ADMIN']), 'rfq1', 1, 'rs1')).rejects.toThrow(
      /already been awarded/i,
    )
  })

  it('refuses a supplier who is not on this RFQ', async () => {
    const svc = createRfqService({ repo: awardRepo(), events: events() })
    await expect(svc.award(ctxFor(['ADMIN']), 'rfq1', 1, 'not-invited')).rejects.toThrow(
      /not found on this RFQ/i,
    )
  })

  it('refuses a supplier who never submitted a quotation', async () => {
    // rs2 was invited and never quoted. Awarding to them would record a
    // commitment against a price nobody offered.
    const svc = createRfqService({ repo: awardRepo(), events: events() })
    await expect(svc.award(ctxFor(['ADMIN']), 'rfq1', 1, 'rs2')).rejects.toThrow(
      /has not submitted a quotation/i,
    )
  })

  it('emits nothing when the award is refused', async () => {
    const sink: DomainEvent[] = []
    const svc = createRfqService({ repo: awardRepo(), events: events(sink) })
    await expect(svc.award(ctxFor(['ADMIN']), 'rfq1', 1, 'rs2')).rejects.toThrow()
    expect(sink.filter((e) => e.type === 'rfq.awarded')).toHaveLength(0)
  })

  it('passes the caller version through for optimistic concurrency', async () => {
    let seen: number | undefined
    const svc = createRfqService({
      repo: awardRepo({
        award: async (_ctx, _id, expectedVersion) => {
          seen = expectedVersion
          return makeRfq({ ...EVALUATING, status: 'AWARDED', awardedSupplierId: 's1', version: 8 })
        },
      } as Partial<RfqRepository>),
      events: events(),
    })
    await svc.award(ctxFor(['ADMIN']), 'rfq1', 7, 'rs1')
    expect(seen).toBe(7)
  })

  it('propagates a version conflict from the repository', async () => {
    const svc = createRfqService({
      repo: awardRepo({
        award: async () => {
          throw new PreconditionFailedError()
        },
      } as Partial<RfqRepository>),
      events: events(),
    })
    await expect(svc.award(ctxFor(['ADMIN']), 'rfq1', 1, 'rs1')).rejects.toThrow(
      PreconditionFailedError,
    )
  })

  it('refuses when the RFQ does not exist', async () => {
    const svc = createRfqService({
      repo: awardRepo({ findById: async () => null } as Partial<RfqRepository>),
      events: events(),
    })
    await expect(svc.award(ctxFor(['ADMIN']), 'missing', 1, 'rs1')).rejects.toThrow(/not found/i)
  })
})
