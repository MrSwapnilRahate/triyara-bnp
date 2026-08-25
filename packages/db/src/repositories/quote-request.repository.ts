import type { Prisma, QuoteRequestStatus } from '@prisma/client'

import { writeAudit } from '../audit'
import { prisma } from '../client'
import { decodeCursor, encodeCursor, type MutationCtx } from './account.repository'

// Public quote request intake persistence (TRY-BNP-QR-01).
//
// Every read and every write is scoped by organizationId, without exception.
// The submitting caller is anonymous, so the tenant never comes from the
// request - the service resolves it from configuration and passes it in.
//
// There is no soft delete here, deliberately. A lead that turns out to be spam
// is REJECTED with a reason, which is a statement about the enquiry rather than
// a way of hiding it; the alternative would leave the trade desk unable to tell
// "we looked and it was junk" from "it vanished".

const detailSelect = {
  id: true,
  organizationId: true,
  reference: true,
  status: true,
  source: true,
  product: true,
  quantity: true,
  monthlyVolume: true,
  packaging: true,
  targetPrice: true,
  destinationPort: true,
  timeline: true,
  requirements: true,
  companyName: true,
  businessType: true,
  country: true,
  importExperience: true,
  contactName: true,
  contactEmail: true,
  contactPhone: true,
  preferredContact: true,
  leadScore: true,
  buyerAccountId: true,
  rfqId: true,
  reviewedById: true,
  reviewedAt: true,
  reviewNotes: true,
  createdById: true,
  version: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.QuoteRequestSelect

export type QuoteRequestRecord = Prisma.QuoteRequestGetPayload<{ select: typeof detailSelect }>

export interface QuoteRequestListResult {
  items: QuoteRequestRecord[]
  nextCursor: string | null
}

export interface ListQuoteRequestsParams {
  organizationId: string
  q?: string | undefined
  status?: QuoteRequestStatus | undefined
  buyerAccountId?: string | undefined
  sort?: string | undefined
  limit: number
  cursor?: string | undefined
}

export interface CreateQuoteRequestData {
  product: string
  quantity: string
  monthlyVolume?: string | undefined
  packaging?: string | undefined
  targetPrice?: string | undefined
  destinationPort?: string | undefined
  timeline?: string | undefined
  requirements?: string | undefined
  companyName?: string | undefined
  businessType?: string | undefined
  country?: string | undefined
  importExperience?: string | undefined
  contactName: string
  contactEmail: string
  contactPhone?: string | undefined
  preferredContact?: string | undefined
  leadScore?: string | undefined
  source?: string | undefined
  /**
   * The buyer this enquiry belongs to, when we already know.
   *
   * Public submissions leave it unset - an anonymous visitor has no account, and
   * staff attach one during triage. A portal submission knows it from the
   * resolved session, which is the only place it may ever come from: this is an
   * ownership column, and an ownership column filled from a request payload is
   * one buyer writing a record that reads as another buyer's.
   */
  buyerAccountId?: string | undefined
}

/**
 * What a buyer may see of their own submitted enquiry.
 *
 * Four fields, and the omissions are the point. `id` and `organizationId` are
 * internal handles; `reviewedById`, `reviewNotes`, `reviewedAt` and `leadScore`
 * are staff working notes about this buyer - `leadScore` in particular is a
 * private assessment of them as a lead, and `detailSelect` carries all of it.
 * That projection is for the trade desk and must never reach the portal.
 *
 * `reference` is here because it is the one identifier the buyer needs: it is
 * what they quote when they ring up, and it is drawn from a sequence rather than
 * being a row id.
 */
const buyerPendingSelect = {
  reference: true,
  product: true,
  quantity: true,
  createdAt: true,
} satisfies Prisma.QuoteRequestSelect

export type BuyerPendingRequirement = Prisma.QuoteRequestGetPayload<{
  select: typeof buyerPendingSelect
}>

export interface BuyerPendingListResult {
  items: BuyerPendingRequirement[]
  hasMore: boolean
}

/**
 * The statuses a buyer is shown as "still with us".
 *
 * An allow-list, not `notIn`. PROMOTED is excluded because the RFQ now
 * represents the same request and showing both would list one requirement
 * twice; REJECTED is excluded because a refusal is a commercial decision the
 * trade desk delivers, not something a screen should break to the buyer with no
 * explanation. Adding a status to the enum leaves it invisible here until
 * somebody decides what the buyer should be told, which is the safe default.
 */
const BUYER_PENDING_STATUSES = ['NEW', 'IN_REVIEW', 'QUALIFIED'] as const

const DEFAULT_BUYER_PENDING_LIMIT = 50

export interface ReviewQuoteRequestData {
  status?: QuoteRequestStatus | undefined
  reviewNotes?: string | undefined
  buyerAccountId?: string | null | undefined
}

/**
 * Next value of the intake series, e.g. "QR-2026-000042".
 *
 * `nextval` inside the caller's transaction: the endpoint is unauthenticated and
 * concurrent submissions are ordinary, so the counter must be safe without a
 * lock. A sequence never hands the same number to two transactions, and it does
 * not roll back - a gap in the series is a far cheaper outcome than a collision.
 */
async function nextReference(tx: Prisma.TransactionClient): Promise<string> {
  const [row] = await tx.$queryRaw<{ n: bigint }[]>`
    SELECT nextval('"QuoteRequest_reference_seq"') AS n
  `
  const n = row?.n ?? 0n
  return `QR-${new Date().getUTCFullYear()}-${String(n).padStart(6, '0')}`
}

export const quoteRequestRepository = {
  async list(params: ListQuoteRequestsParams): Promise<QuoteRequestListResult> {
    const where: Prisma.QuoteRequestWhereInput = {
      // Never optional. An intake record carries a stranger's contact details.
      organizationId: params.organizationId,
      ...(params.status ? { status: params.status } : {}),
      ...(params.buyerAccountId ? { buyerAccountId: params.buyerAccountId } : {}),
      ...(params.q
        ? {
            OR: [
              { reference: { contains: params.q, mode: 'insensitive' } },
              { product: { contains: params.q, mode: 'insensitive' } },
              { companyName: { contains: params.q, mode: 'insensitive' } },
              { contactName: { contains: params.q, mode: 'insensitive' } },
              { contactEmail: { contains: params.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    }

    const raw = params.sort ?? '-createdAt'
    const dir: Prisma.SortOrder = raw.startsWith('-') ? 'desc' : 'asc'
    const field = raw.replace(/^-/, '') as 'createdAt' | 'reference' | 'status'

    const rows = await prisma.quoteRequest.findMany({
      where,
      select: detailSelect,
      orderBy: [{ [field]: dir }, { id: dir }],
      take: params.limit + 1,
      ...(params.cursor ? { cursor: { id: decodeCursor(params.cursor) }, skip: 1 } : {}),
    })

    const items = rows.slice(0, params.limit)
    const nextCursor = rows.length > params.limit ? encodeCursor(items[items.length - 1]!.id) : null
    return { items, nextCursor }
  },

  /**
   * The buyer's own submitted enquiries, still in triage.
   *
   * Both scopes are required arguments. `list` above takes `buyerAccountId`
   * optionally and spreads it conditionally, which is correct there - a member
   * of staff legitimately lists the whole tenant - and would be a disaster here:
   * a falsy account would drop the clause and hand this buyer every other
   * buyer's enquiries, contact details and all.
   *
   * Status is filtered by allow-list so a promoted enquiry disappears from this
   * list exactly as the RFQ appears in the other one, and the same requirement
   * is never shown twice.
   */
  async listPendingForBuyer(
    organizationId: string,
    buyerAccountId: string,
    limit = DEFAULT_BUYER_PENDING_LIMIT,
  ): Promise<BuyerPendingListResult> {
    const rows = await prisma.quoteRequest.findMany({
      where: {
        organizationId,
        buyerAccountId,
        status: { in: [...BUYER_PENDING_STATUSES] },
      },
      select: buyerPendingSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    })

    return { items: rows.slice(0, limit), hasMore: rows.length > limit }
  },

  /**
   * An enquiry this buyer already sent for the same product, moments ago.
   *
   * The duplicate guard, and it is scoped to one account on purpose. A guard
   * keyed on product alone would let one buyer's enquiry suppress another's -
   * turning a convenience into a way to block a competitor - so the account is a
   * required argument and the window is short enough to catch a double-click
   * without refusing a buyer who genuinely needs the same goods twice.
   *
   * Returns the existing reference so the caller can show the buyer what already
   * landed rather than an error about something they did not do wrong.
   */
  async findRecentDuplicateForBuyer(
    organizationId: string,
    buyerAccountId: string,
    product: string,
    since: Date,
  ): Promise<{ reference: string } | null> {
    return prisma.quoteRequest.findFirst({
      where: {
        organizationId,
        buyerAccountId,
        product,
        createdAt: { gte: since },
      },
      select: { reference: true },
      orderBy: { createdAt: 'desc' },
    })
  },

  async findById(organizationId: string, id: string): Promise<QuoteRequestRecord | null> {
    // Tenant in the WHERE, not checked after the read: a findUnique on id alone
    // would fetch another tenant's row before deciding what to do with it.
    return prisma.quoteRequest.findFirst({ where: { id, organizationId }, select: detailSelect })
  },

  async create(ctx: MutationCtx, data: CreateQuoteRequestData): Promise<QuoteRequestRecord> {
    return prisma.$transaction(async (tx) => {
      const created = await tx.quoteRequest.create({
        data: {
          organizationId: ctx.organizationId,
          reference: await nextReference(tx),
          ...data,
          ...(data.source ? { source: data.source } : {}),
          createdById: ctx.actorId,
        },
        select: detailSelect,
      })

      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.actorId,
        requestId: ctx.requestId,
        entityType: 'QuoteRequest',
        entityId: created.id,
        action: 'quote_request.submitted',
        // The enquiry's shape, not its contents: the full row already exists and
        // copying a stranger's contact details into a second table earns nothing.
        after: {
          reference: created.reference,
          product: created.product,
          country: created.country,
          source: created.source,
        },
      })

      return created
    })
  },

  /**
   * Records a triage decision.
   *
   * Optimistic concurrency on `version`, matching every other mutable record on
   * the platform: two operators triaging the same enquiry is exactly the race
   * this prevents.
   */
  async review(
    ctx: MutationCtx,
    id: string,
    expectedVersion: number,
    data: ReviewQuoteRequestData,
  ): Promise<QuoteRequestRecord | null> {
    return prisma.$transaction(async (tx) => {
      const before = await tx.quoteRequest.findFirst({
        where: { id, organizationId: ctx.organizationId },
        select: detailSelect,
      })
      if (!before) return null
      if (before.version !== expectedVersion) return null

      const updated = await tx.quoteRequest.update({
        where: { id },
        data: {
          ...(data.status ? { status: data.status } : {}),
          ...(data.reviewNotes !== undefined ? { reviewNotes: data.reviewNotes } : {}),
          ...(data.buyerAccountId !== undefined ? { buyerAccountId: data.buyerAccountId } : {}),
          reviewedById: ctx.actorId,
          reviewedAt: new Date(),
          version: { increment: 1 },
        },
        select: detailSelect,
      })

      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.actorId,
        requestId: ctx.requestId,
        entityType: 'QuoteRequest',
        entityId: id,
        action: 'quote_request.reviewed',
        before: { status: before.status, buyerAccountId: before.buyerAccountId },
        after: { status: updated.status, buyerAccountId: updated.buyerAccountId },
      })

      return updated
    })
  },

  /**
   * Marks the enquiry as promoted and records which RFQ it became.
   *
   * Takes an existing `rfqId` rather than creating the RFQ itself: raising an
   * RFQ is the RFQ service's job, including its own constraints and audit trail,
   * and a second code path that writes RFQ rows is precisely how two divergent
   * definitions of a valid RFQ come about.
   */
  async markPromoted(
    ctx: MutationCtx,
    id: string,
    expectedVersion: number,
    rfqId: string,
    buyerAccountId: string,
  ): Promise<QuoteRequestRecord | null> {
    return prisma.$transaction(async (tx) => {
      const before = await tx.quoteRequest.findFirst({
        where: { id, organizationId: ctx.organizationId },
        select: { id: true, version: true, status: true },
      })
      if (!before) return null
      if (before.version !== expectedVersion) return null

      const updated = await tx.quoteRequest.update({
        where: { id },
        data: {
          status: 'PROMOTED',
          rfqId,
          buyerAccountId,
          reviewedById: ctx.actorId,
          reviewedAt: new Date(),
          version: { increment: 1 },
        },
        select: detailSelect,
      })

      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.actorId,
        requestId: ctx.requestId,
        entityType: 'QuoteRequest',
        entityId: id,
        action: 'quote_request.promoted',
        before: { status: before.status },
        after: { status: 'PROMOTED', rfqId, buyerAccountId },
      })

      return updated
    })
  },
}

export type QuoteRequestRepository = typeof quoteRequestRepository
