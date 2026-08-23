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
}

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
