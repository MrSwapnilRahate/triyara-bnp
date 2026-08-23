import { buildAbilityFor, type Role } from '@triyara/auth'
import { ConflictError, ForbiddenError, NotFoundError } from '@triyara/lib'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createQuoteRequestService, QUOTE_REQUEST_SYSTEM_ACTOR_ID } from './quote-request.service'

/**
 * Website enquiry intake.
 *
 * The rule the whole feature exists to hold: a public submission produces an
 * INTAKE record and nothing else. It never creates an RFQ, never creates an
 * Account, and never reaches the sourcing workflow. Crossing that line is
 * `promote`, and only a signed-in operator can do it.
 */

const ORG = 'org-intake'

const ROW = {
  id: 'qr1',
  organizationId: ORG,
  reference: 'QR-2026-000001',
  status: 'NEW' as const,
  source: 'PUBLIC_WEBSITE',
  product: 'Dehydrated Onion',
  quantity: '2 x 40ft monthly',
  monthlyVolume: null,
  packaging: null,
  targetPrice: null,
  destinationPort: 'Jebel Ali',
  timeline: null,
  requirements: null,
  companyName: 'Gulf Foods',
  businessType: null,
  country: 'United Arab Emirates',
  importExperience: null,
  contactName: 'A Buyer',
  contactEmail: 'buyer@example.test',
  contactPhone: null,
  preferredContact: null,
  leadScore: 'Hot',
  buyerAccountId: null,
  rfqId: null,
  reviewedById: null,
  reviewedAt: null,
  reviewNotes: null,
  version: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
}

function makeRepo(overrides: Record<string, unknown> = {}) {
  return {
    list: vi.fn(async (_p?: Record<string, unknown>) => ({ items: [ROW], nextCursor: null })),
    findById: vi.fn(async (_org?: string, _id?: string) => ROW as typeof ROW | null),
    create: vi.fn(async (_ctx?: Record<string, unknown>, _data?: Record<string, unknown>) => ROW),
    review: vi.fn(
      async (
        _ctx?: Record<string, unknown>,
        _id?: string,
        _v?: number,
        _d?: Record<string, unknown>,
      ) => ({ ...ROW, status: 'QUALIFIED' as const, version: 2 }),
    ),
    markPromoted: vi.fn(
      async (
        _ctx?: Record<string, unknown>,
        _id?: string,
        _v?: number,
        rfqId?: string,
        buyerAccountId?: string,
      ) => ({ ...ROW, status: 'PROMOTED' as const, rfqId, buyerAccountId, version: 2 }),
    ),
    ...overrides,
  }
}

const events = { emit: vi.fn(async () => undefined) }
const organizations = { findBySlug: vi.fn(async (_slug: string) => ({ id: ORG })) }
const rfqs = {
  create: vi.fn(
    async (_ctx?: Record<string, unknown>, _dto?: Record<string, unknown>, _items?: unknown[]) => ({
      id: 'rfq-new',
      rfqNumber: 'RFQ-2026-000431',
    }),
  ),
}

function build(repo = makeRepo(), withRfqs = true) {
  return createQuoteRequestService({
    repo: repo as never,
    events: events as never,
    organizations,
    intakeOrganizationSlug: 'triyara',
    ...(withRfqs ? { rfqs: rfqs as never } : {}),
  })
}

function ctx(role: Role) {
  return {
    user: { id: 'u1' },
    organizationId: ORG,
    ability: buildAbilityFor([role]),
    requestId: 'req-1',
  } as never
}

const SUBMISSION = {
  product: 'Dehydrated Onion',
  quantity: '2 x 40ft monthly',
  contactName: 'A Buyer',
  contactEmail: 'buyer@example.test',
} as never

beforeEach(() => {
  vi.clearAllMocks()
})

describe('public submission', () => {
  it('writes a record - the email is not the system of record', async () => {
    const repo = makeRepo()
    const created = await build(repo).submit({ requestId: 'r' }, SUBMISSION)

    expect(repo.create).toHaveBeenCalledOnce()
    expect(created.reference).toBe('QR-2026-000001')
  })

  it('never creates an RFQ', async () => {
    // The entire point of the intake model. An anonymous visitor cannot reach
    // the commercial sourcing workflow, whatever they post.
    await build().submit({ requestId: 'r' }, SUBMISSION)
    expect(rfqs.create).not.toHaveBeenCalled()
  })

  it('attributes the write to the sentinel actor, never to a real user', async () => {
    const repo = makeRepo()
    await build(repo).submit({ requestId: 'r' }, SUBMISSION)
    expect(repo.create.mock.calls[0]![0]).toMatchObject({
      actorId: QUOTE_REQUEST_SYSTEM_ACTOR_ID,
      organizationId: ORG,
    })
  })

  it('takes the tenant from configuration, never from the caller', async () => {
    // The submitter is anonymous. If the tenant could come from the request,
    // an attacker would choose which company's queue to write into.
    const repo = makeRepo()
    await build(repo).submit({ requestId: 'r' }, {
      ...(SUBMISSION as object),
      organizationId: 'someone-else',
    } as never)

    expect(organizations.findBySlug).toHaveBeenCalledWith('triyara')
    expect(repo.create.mock.calls[0]![0]).toMatchObject({ organizationId: ORG })
  })

  it('stamps the source rather than trusting one that was sent', async () => {
    const repo = makeRepo()
    await build(repo).submit({ requestId: 'r' }, {
      ...(SUBMISSION as object),
      source: 'SOMETHING_ELSE',
    } as never)
    expect(repo.create.mock.calls[0]![1]).toMatchObject({ source: 'PUBLIC_WEBSITE' })
  })

  it('reports a misconfigured intake tenant as a clear message, not a crash', async () => {
    const missing = { findBySlug: vi.fn(async (_s: string) => null) }
    const service = createQuoteRequestService({
      repo: makeRepo() as never,
      events: events as never,
      organizations: missing,
      intakeOrganizationSlug: 'nope',
    })
    await expect(service.submit({ requestId: 'r' }, SUBMISSION)).rejects.toBeInstanceOf(
      NotFoundError,
    )
  })
})

describe('reading the queue', () => {
  it('always scopes the query to the caller organization', async () => {
    const repo = makeRepo()
    await build(repo).list(ctx('EXPORT_MANAGER'), { limit: 25 } as never)
    expect(repo.list.mock.calls[0]![0]).toMatchObject({ organizationId: ORG })
  })

  it('refuses a caller with no read right', async () => {
    await expect(build().list(ctx([] as never), { limit: 25 } as never)).rejects.toBeInstanceOf(
      ForbiddenError,
    )
  })

  it('does not find another tenant record', async () => {
    const repo = makeRepo({ findById: vi.fn(async () => null) })
    await expect(build(repo).get(ctx('ADMIN'), 'qr1')).rejects.toBeInstanceOf(NotFoundError)
  })
})

describe('triage', () => {
  it('lets an export manager qualify an enquiry', async () => {
    const updated = await build().review(ctx('EXPORT_MANAGER'), 'qr1', 1, {
      status: 'QUALIFIED',
    } as never)
    expect(updated.status).toBe('QUALIFIED')
  })

  it.each(['VERIFIER', 'READ_ONLY'] as const)('refuses %s', async (role) => {
    await expect(
      build().review(ctx(role), 'qr1', 1, { status: 'QUALIFIED' } as never),
    ).rejects.toBeInstanceOf(ForbiddenError)
  })

  it('refuses to triage an enquiry that already became an RFQ', async () => {
    const repo = makeRepo({
      findById: vi.fn(async () => ({ ...ROW, status: 'PROMOTED', rfqId: 'rfq-new' })),
    })
    await expect(
      build(repo).review(ctx('ADMIN'), 'qr1', 1, { status: 'NEW' } as never),
    ).rejects.toBeInstanceOf(ConflictError)
  })

  it('reports a version clash rather than overwriting', async () => {
    // Two operators triaging the same enquiry is the exact race optimistic
    // concurrency exists for.
    const repo = makeRepo({ review: vi.fn(async () => null) })
    await expect(
      build(repo).review(ctx('ADMIN'), 'qr1', 1, { status: 'QUALIFIED' } as never),
    ).rejects.toBeInstanceOf(ConflictError)
  })
})

describe('promotion into the commercial workflow', () => {
  const DTO = {
    rfqNumber: 'RFQ-2026-000431',
    buyerId: 'acct-1',
    quantity: 2,
    unit: 'FCL40',
  } as never

  it('creates the RFQ through the RFQ service, not by writing rows', async () => {
    // A second code path that writes RFQ rows is how two divergent definitions
    // of a valid RFQ come about.
    const result = await build().promote(ctx('EXPORT_MANAGER'), 'qr1', 1, DTO)
    expect(rfqs.create).toHaveBeenCalledOnce()
    expect(result.rfqNumber).toBe('RFQ-2026-000431')
  })

  it('always names a buyer, satisfying the RFQ table CHECK constraint', async () => {
    await build().promote(ctx('ADMIN'), 'qr1', 1, DTO)
    const dto = rfqs.create.mock.calls[0]![1]!
    expect(dto).toMatchObject({ type: 'BUYER', buyerId: 'acct-1' })
  })

  it('uses the operator quantity, never the buyer free text', async () => {
    // "2 x 40ft monthly" is not a number. Guessing one would put a fabricated
    // figure in front of suppliers.
    await build().promote(ctx('ADMIN'), 'qr1', 1, DTO)
    const items = rfqs.create.mock.calls[0]![2] as Array<Record<string, unknown>>
    expect(items[0]).toMatchObject({ quantity: 2, unit: 'FCL40' })
  })

  it("keeps the buyer's own wording on the line", async () => {
    await build().promote(ctx('ADMIN'), 'qr1', 1, DTO)
    const items = rfqs.create.mock.calls[0]![2] as Array<Record<string, unknown>>
    expect(String(items[0]!.remarks)).toContain('2 x 40ft monthly')
    expect(String(items[0]!.remarks)).toContain('QR-2026-000001')
  })

  it('requires BOTH the intake right and the RFQ right', async () => {
    // A verifier may read the queue. Promotion must still be out of reach.
    await expect(build().promote(ctx('VERIFIER'), 'qr1', 1, DTO)).rejects.toBeInstanceOf(
      ForbiddenError,
    )
  })

  it('refuses to promote twice', async () => {
    const repo = makeRepo({
      findById: vi.fn(async () => ({ ...ROW, status: 'PROMOTED', rfqId: 'rfq-old' })),
    })
    await expect(build(repo).promote(ctx('ADMIN'), 'qr1', 1, DTO)).rejects.toBeInstanceOf(
      ConflictError,
    )
  })

  it('refuses to promote a rejected enquiry', async () => {
    const repo = makeRepo({ findById: vi.fn(async () => ({ ...ROW, status: 'REJECTED' })) })
    await expect(build(repo).promote(ctx('ADMIN'), 'qr1', 1, DTO)).rejects.toBeInstanceOf(
      ConflictError,
    )
  })

  it('links the enquiry to the RFQ it became', async () => {
    const repo = makeRepo()
    await build(repo).promote(ctx('ADMIN'), 'qr1', 1, DTO)
    expect(repo.markPromoted).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG }),
      'qr1',
      1,
      'rfq-new',
      'acct-1',
    )
  })

  it('says so loudly when the RFQ was created but the link failed', async () => {
    // The one genuinely awkward outcome: an RFQ now exists that nothing points
    // at. Silence here would leave a duplicate waiting to be raised.
    const repo = makeRepo({ markPromoted: vi.fn(async () => null) })
    await expect(build(repo).promote(ctx('ADMIN'), 'qr1', 1, DTO)).rejects.toThrow(
      /RFQ-2026-000431 was created/,
    )
  })
})
