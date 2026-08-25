import { Prisma, type QuotationStatus, type QuotationType } from '@prisma/client'
import { ConflictError, NotFoundError, PreconditionFailedError } from '@triyara/lib'

import { writeAudit } from '../audit'
import { prisma } from '../client'
import { decodeCursor, encodeCursor, type MutationCtx } from './account.repository'
import { assertBuyerInOrg, assertPaymentTermInOrg, assertProductsInOrg } from './tenant-refs'

// Quotation aggregate (TRY-BNP-QUOTE-01).
//
// One row PER REVISION, keyed (organizationId, quotationNumber, revisionNumber).
// Revising forks a new row and marks the old one SUPERSEDED, so the previous row
// IS the snapshot - QuotationRevision records the CHANGE, not duplicated state.
//
// Monetary roll-ups are STORED, never derived on read: a sent quotation is a
// commercial commitment and its arithmetic must not shift when a tax rate or FX
// rate is later edited.

const listSelect = {
  id: true,
  organizationId: true,
  quotationNumber: true,
  revisionNumber: true,
  type: true,
  buyerId: true,
  primaryRfqId: true,
  title: true,
  currency: true,
  baseCurrency: true,
  fxRate: true,
  incoterm: true,
  destinationCountry: true,
  destinationPort: true,
  paymentTermId: true,
  validFrom: true,
  validUntil: true,
  status: true,
  subtotal: true,
  chargesTotal: true,
  discountTotal: true,
  taxTotal: true,
  grandTotal: true,
  previousRevisionId: true,
  supersededAt: true,
  sentAt: true,
  acceptedAt: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} satisfies Prisma.QuotationSelect

const detailSelect = {
  ...listSelect,
  description: true,
  namedPlace: true,
  paymentTermsText: true,
  leadTimeDays: true,
  packingSummary: true,
  samplingTerms: true,
  // INTERNAL: cost and realised margin. Never rendered to the customer.
  costTotal: true,
  marginPercent: true,
  rejectedAt: true,
  rejectionReason: true,
  createdById: true,
  items: {
    where: { deletedAt: null },
    orderBy: { lineNumber: 'asc' },
    select: {
      id: true,
      lineNumber: true,
      productId: true,
      customProductName: true,
      description: true,
      rfqItemId: true,
      quantity: true,
      unit: true,
      unitCost: true,
      marginPercent: true,
      unitPrice: true,
      lineSubtotal: true,
      lineTotal: true,
      packaging: true,
      hsCode: true,
      countryOfOrigin: true,
      requiredCertifications: true,
      leadTimeDays: true,
      version: true,
      product: { select: { id: true, sku: true, name: true } },
    },
  },
  charges: {
    where: { deletedAt: null },
    orderBy: { sequence: 'asc' },
    select: {
      id: true,
      quotationItemId: true,
      type: true,
      scope: true,
      basis: true,
      label: true,
      rate: true,
      amount: true,
      currency: true,
      isDeduction: true,
      sequence: true,
      isVisibleToCustomer: true,
      version: true,
    },
  },
  taxes: {
    where: { deletedAt: null },
    orderBy: { sequence: 'asc' },
    select: {
      id: true,
      quotationItemId: true,
      type: true,
      code: true,
      jurisdiction: true,
      ratePercent: true,
      taxableAmount: true,
      amount: true,
      currency: true,
      isCompound: true,
      isReverseCharge: true,
      sequence: true,
      version: true,
    },
  },
  paymentTerm: {
    select: { id: true, code: true, name: true, netDays: true, advancePercent: true },
  },
} satisfies Prisma.QuotationSelect

export type QuotationListItem = Prisma.QuotationGetPayload<{ select: typeof listSelect }>
export type QuotationRecord = Prisma.QuotationGetPayload<{ select: typeof detailSelect }>

export interface CreateQuotationData {
  quotationNumber: string
  type: QuotationType
  buyerId: string
  primaryRfqId?: string
  title?: string
  description?: string
  currency: string
  baseCurrency: string
  fxRate?: number
  fxRateDate?: Date
  incoterm?: Prisma.QuotationCreateInput['incoterm']
  namedPlace?: string
  destinationCountry?: string
  destinationPort?: string
  paymentTermId?: string
  paymentTermsText?: string
  leadTimeDays?: number
  packingSummary?: string
  samplingTerms?: string
  validFrom?: Date
  validUntil?: Date
}

export type UpdateQuotationData = Partial<Omit<CreateQuotationData, 'quotationNumber'>> & {
  quotationNumber?: string
}

export interface QuotationItemData {
  productId?: string | null
  customProductName?: string | null
  description?: string
  rfqItemId?: string | null
  quantity: number
  unit: string
  unitCost?: number
  marginPercent?: number
  unitPrice: number
  packaging?: string
  hsCode?: string
  countryOfOrigin?: string
  requiredCertifications?: Prisma.QuotationItemCreateManyInput['requiredCertifications']
  leadTimeDays?: number
  remarks?: string
}

/** Stored roll-ups, computed by the service and persisted here. */
export interface QuotationTotals {
  subtotal: number
  chargesTotal: number
  discountTotal: number
  taxTotal: number
  grandTotal: number
  costTotal: number | null
  marginPercent: number | null
}

export interface ListQuotationsParams {
  organizationId: string
  q?: string
  type?: QuotationType
  status?: QuotationStatus
  buyerId?: string
  rfqId?: string
  currency?: string
  currentOnly?: boolean
  validBefore?: Date
  validAfter?: Date
  includeDeleted?: boolean
  sort?: string
  limit: number
  cursor?: string
}

export interface QuotationListResult {
  items: QuotationListItem[]
  nextCursor: string | null
}

/**
 * The quotation states TRIYARA has deliberately put in front of the buyer.
 *
 * `SENT` is the act of disclosure - the moment an offer stops being internal
 * working material and becomes the buyer's to read - and the states after it are
 * what happened to that offer once they had it. DRAFT, PENDING_APPROVAL and
 * APPROVED are the internal preparation of a price and are not the buyer's
 * business; WITHDRAWN and SUPERSEDED are offers we took back or replaced, and
 * showing them would present a number nobody stands behind any more.
 *
 * Applied inside the query rather than filtered afterwards, so an internal
 * quotation is never fetched at all.
 */
export const BUYER_VISIBLE_QUOTATION_STATUSES: QuotationStatus[] = [
  'SENT',
  'UNDER_NEGOTIATION',
  'ACCEPTED',
  'REJECTED',
  'EXPIRED',
]

/**
 * What a buyer may be told about an offer we made them.
 *
 * A separate select from `listSelect`, which is an internal projection: it
 * carries `id`, `organizationId`, `buyerId`, `primaryRfqId`, `version` and
 * `deletedAt`, and - more to the point - `subtotal`, `chargesTotal`,
 * `discountTotal`, `taxTotal`, `fxRate` and `baseCurrency`, which is the
 * arithmetic behind our price rather than the price itself.
 *
 * `grandTotal` is what we quoted them, not what anyone charged us. No relation
 * is entered: `items` leads to `sourceOptions`, which holds supplier identity
 * and landed cost, and that is the wall this portal exists to keep.
 */
const buyerQuotationSelect = {
  quotationNumber: true,
  revisionNumber: true,
  status: true,
  currency: true,
  grandTotal: true,
  sentAt: true,
  validUntil: true,
} satisfies Prisma.QuotationSelect

export type BuyerQuotationItem = Prisma.QuotationGetPayload<{
  select: typeof buyerQuotationSelect
}>

export interface BuyerQuotationListResult {
  items: BuyerQuotationItem[]
  /** Whether the account has more offers than were returned. Carries no cursor. */
  hasMore: boolean
}

/**
 * One offer, in the detail the buyer we made it to is allowed to read.
 *
 * A superset of `buyerQuotationSelect` on the header and nothing like
 * `detailSelect` anywhere else. `detailSelect` is the internal projection and
 * carries `costTotal`, `marginPercent`, `createdById`, `primaryRfqId`,
 * `rejectionReason`, every row id, and - on each line - `unitCost` and
 * `marginPercent`, which the schema itself marks INTERNAL and never to be
 * rendered to the customer.
 *
 * The money here is the arithmetic of OUR price, not of our cost:
 *
 *   subtotal + chargesTotal - discountTotal + taxTotal = grandTotal
 *
 * Batch G withheld the four components on the list, where a single figure per
 * row is the whole point. A detail page is where a commercial offer is expected
 * to show its working, and none of the four says anything about what we paid;
 * `costTotal` and `marginPercent` are the numbers that would, and they stay out.
 *
 * Line money is `lineSubtotal` - quantity x unitPrice - and deliberately NOT
 * `lineTotal`. `subtotal` is the sum of the line SUBTOTALS, while `lineTotal` is
 * a line after its own charges and taxes, and those same amounts are already
 * inside `chargesTotal` and `taxTotal` above. Showing both would present the
 * same money twice and reconcile against nothing.
 *
 * Relations are entered three times and each is pinned to the minimum:
 *
 *   items          -> never `sourceOptions`, which is supplier identity, supplier
 *                     price and landed cost: the wall this portal exists to keep.
 *                     Never `rfqItem` either, which is internal provenance.
 *   items.product  -> `name` alone. Not `id`, not `sku`.
 *   charges        -> only those we marked `isVisibleToCustomer`, which is the
 *                     schema's own record of what the customer sees broken out
 *                     rather than absorbed into a unit price. Both scopes, since
 *                     `chargesTotal` spans both and a header-only list would
 *                     reconcile short.
 *
 * Taxes are summarised by `taxTotal` and not itemised. `QuotationTax` carries no
 * customer-visibility flag, and inferring one from a charge's flag would be a
 * guess about disclosure rather than a decision.
 */
const buyerQuotationDetailSelect = {
  quotationNumber: true,
  revisionNumber: true,
  type: true,
  status: true,
  title: true,
  currency: true,
  subtotal: true,
  chargesTotal: true,
  discountTotal: true,
  taxTotal: true,
  grandTotal: true,
  incoterm: true,
  namedPlace: true,
  destinationCountry: true,
  destinationPort: true,
  paymentTermsText: true,
  leadTimeDays: true,
  packingSummary: true,
  samplingTerms: true,
  sentAt: true,
  validFrom: true,
  validUntil: true,
  acceptedAt: true,
  rejectedAt: true,
  items: {
    where: { deletedAt: null },
    orderBy: { lineNumber: 'asc' },
    select: {
      lineNumber: true,
      // Catalogue name when the line names a product, and the free-text name
      // otherwise - `customProductName` is documented as used only when
      // `productId` is null. Same pairing as the requirement detail.
      customProductName: true,
      product: { select: { name: true } },
      quantity: true,
      unit: true,
      unitPrice: true,
      lineSubtotal: true,
      packaging: true,
      hsCode: true,
      countryOfOrigin: true,
      requiredCertifications: true,
      leadTimeDays: true,
    },
  },
  charges: {
    where: { deletedAt: null, isVisibleToCustomer: true },
    orderBy: { sequence: 'asc' },
    select: {
      type: true,
      label: true,
      amount: true,
      currency: true,
      isDeduction: true,
    },
  },
} satisfies Prisma.QuotationSelect

export type BuyerQuotationDetail = Prisma.QuotationGetPayload<{
  select: typeof buyerQuotationDetailSelect
}>

/** How many of a buyer's quotations one portal page shows. */
const DEFAULT_BUYER_QUOTATION_LIMIT = 50

function conflictOnUnique(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    throw new ConflictError('A quotation with that number and revision already exists.')
  }
  throw error
}

function lineRows(
  organizationId: string,
  items: QuotationItemData[],
): Prisma.QuotationItemCreateWithoutQuotationInput[] {
  return items.map((it, i) => {
    const subtotal = it.quantity * it.unitPrice
    return {
      organizationId,
      lineNumber: i + 1,
      productId: it.productId ?? null,
      customProductName: it.customProductName ?? null,
      description: it.description,
      rfqItemId: it.rfqItemId ?? null,
      quantity: it.quantity,
      unit: it.unit,
      unitCost: it.unitCost,
      marginPercent: it.marginPercent,
      unitPrice: it.unitPrice,
      lineSubtotal: subtotal,
      // Line-scoped charges and taxes adjust this afterwards; with none it
      // equals the subtotal.
      lineTotal: subtotal,
      packaging: it.packaging,
      hsCode: it.hsCode,
      countryOfOrigin: it.countryOfOrigin,
      requiredCertifications: it.requiredCertifications ?? [],
      leadTimeDays: it.leadTimeDays,
      remarks: it.remarks,
    } as Prisma.QuotationItemCreateWithoutQuotationInput
  })
}

/**
 * What the portal may see of one buyer's offers.
 *
 * Shared by the list and the count so the two can never disagree. The status
 * filter belongs in here rather than at either call site: a count that included
 * DRAFT would tell the buyer about an offer nobody has sent them.
 */
function buyerQuotationScope(organizationId: string, buyerId: string): Prisma.QuotationWhereInput {
  return {
    organizationId,
    buyerId,
    status: { in: BUYER_VISIBLE_QUOTATION_STATUSES },
    deletedAt: null,
  }
}

export const quotationRepository = {
  /**
   * How many offers this buyer can see.
   *
   * Counted in the database, not by measuring the list, which is capped.
   */
  countForBuyer(organizationId: string, buyerId: string): Promise<number> {
    return prisma.quotation.count({ where: buyerQuotationScope(organizationId, buyerId) })
  },

  async create(
    ctx: MutationCtx,
    data: CreateQuotationData,
    items: QuotationItemData[],
    totals: QuotationTotals,
  ): Promise<QuotationRecord> {
    try {
      return await prisma.$transaction(async (tx) => {
        await assertBuyerInOrg(tx, ctx.organizationId, data.buyerId)
        await assertPaymentTermInOrg(tx, ctx.organizationId, data.paymentTermId)
        await assertProductsInOrg(
          tx,
          ctx.organizationId,
          items.map((it) => it.productId),
        )

        const quotation = await tx.quotation.create({
          data: {
            organizationId: ctx.organizationId,
            ...data,
            ...totals,
            createdById: ctx.actorId,
            items: { create: lineRows(ctx.organizationId, items) },
          },
          select: detailSelect,
        })

        // Opening entries so approval and revision history are complete from
        // the first event.
        await tx.quotationApproval.create({
          data: {
            quotationId: quotation.id,
            organizationId: ctx.organizationId,
            fromStatus: null,
            toStatus: 'DRAFT',
            sequence: 1,
            approverId: ctx.actorId,
            comments: 'Quotation created.',
          },
        })
        await tx.quotationRevision.create({
          data: {
            quotationId: quotation.id,
            organizationId: ctx.organizationId,
            fromRevision: null,
            toRevision: quotation.revisionNumber,
            reason: 'Initial issue.',
            changeSummary: { created: true, items: items.length } as Prisma.InputJsonValue,
            changedById: ctx.actorId,
          },
        })

        await writeAudit(tx, {
          organizationId: ctx.organizationId,
          actorId: ctx.actorId,
          requestId: ctx.requestId,
          entityType: 'Quotation',
          entityId: quotation.id,
          action: 'quotation.created',
          after: {
            quotationNumber: quotation.quotationNumber,
            revision: quotation.revisionNumber,
            grandTotal: totals.grandTotal,
          },
        })

        return quotation
      })
    } catch (error) {
      return conflictOnUnique(error)
    }
  },

  findById(
    organizationId: string,
    id: string,
    opts: { includeDeleted?: boolean } = {},
  ): Promise<QuotationRecord | null> {
    return prisma.quotation.findFirst({
      where: { id, organizationId, ...(opts.includeDeleted ? {} : { deletedAt: null }) },
      select: detailSelect,
    })
  },

  /** Latest revision of a quotation number, superseded rows excluded. */
  findCurrentByNumber(
    organizationId: string,
    quotationNumber: string,
  ): Promise<QuotationRecord | null> {
    return prisma.quotation.findFirst({
      where: { organizationId, quotationNumber, deletedAt: null, supersededAt: null },
      orderBy: { revisionNumber: 'desc' },
      select: detailSelect,
    })
  },

  /** Every revision of a quotation number, newest first. */
  revisionChain(organizationId: string, quotationNumber: string): Promise<QuotationListItem[]> {
    return prisma.quotation.findMany({
      where: { organizationId, quotationNumber },
      orderBy: { revisionNumber: 'desc' },
      select: listSelect,
    })
  },

  /**
   * The offers this buyer account has been sent.
   *
   * Not `list`, which applies its buyer as
   * `...(params.buyerId ? { buyerId: params.buyerId } : {})`. That is right for
   * an internal screen that may or may not be narrowing by customer, and the
   * wrong default the moment an external party reads it: a falsy buyer omits the
   * clause and returns every quotation in the tenant. Here both scopes are
   * required arguments and both are written unconditionally.
   *
   * The status filter is part of the query for the same reason. Fetching a DRAFT
   * quotation and hiding it in the service would mean an internal price had
   * already crossed into the portal process.
   *
   * `hasMore` rather than a cursor: `encodeCursor` is base64url of the row id,
   * so handing one to the browser would hand over a quotation id, which this
   * projection excludes.
   */
  async listQuotationsForBuyer(
    organizationId: string,
    buyerId: string,
    limit = DEFAULT_BUYER_QUOTATION_LIMIT,
  ): Promise<BuyerQuotationListResult> {
    const rows = await prisma.quotation.findMany({
      where: buyerQuotationScope(organizationId, buyerId),
      select: buyerQuotationSelect,
      // Most recently sent first. `sentAt` is non-null for every status in the
      // buyer-visible set, since all of them follow the act of sending.
      orderBy: [{ sentAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    })

    return { items: rows.slice(0, limit), hasMore: rows.length > limit }
  },

  /**
   * One offer, by the number the buyer can see, scoped to the buyer we made it to.
   *
   * Not `findCurrentByNumber`, which is the closest existing method and unsafe
   * here twice over: it carries no `buyerId`, so it returns another buyer's
   * quotation in the same tenant, and no status filter, so it returns DRAFT and
   * PENDING_APPROVAL - a price we have priced but never offered. Not `findById`
   * either: the buyer holds no row id, and it returns the internal projection.
   *
   * All five clauses are required arguments or constants written unconditionally
   * into the `where`, so every refusal is the same refusal. The service cannot
   * tell "no such number" from "not yours" from "deleted" from "not sent yet"
   * even if it wanted to, because all four collapse into one `null`.
   *
   * `quotationNumber` is NOT unique on its own, and not per organization either:
   * the constraint is `@@unique([organizationId, quotationNumber, revisionNumber])`
   * and the table holds one row PER REVISION. In practice at most one revision is
   * ever buyer-visible - `revise()` marks the previous row SUPERSEDED and opens
   * the next as DRAFT, and neither status is in the visible set - but that is a
   * convention of the write path, not a constraint the database enforces, and
   * `UpdateQuotationData` can rename a `quotationNumber`. So the order is
   * explicit rather than assumed: newest revision wins, which is the offer
   * currently standing under that number.
   */
  findQuotationForBuyer(
    organizationId: string,
    buyerId: string,
    quotationNumber: string,
  ): Promise<BuyerQuotationDetail | null> {
    return prisma.quotation.findFirst({
      where: {
        organizationId,
        buyerId,
        quotationNumber,
        status: { in: BUYER_VISIBLE_QUOTATION_STATUSES },
        deletedAt: null,
      },
      select: buyerQuotationDetailSelect,
      orderBy: [{ revisionNumber: 'desc' }],
    })
  },

  async list(params: ListQuotationsParams): Promise<QuotationListResult> {
    const where: Prisma.QuotationWhereInput = {
      organizationId: params.organizationId,
      ...(params.includeDeleted ? {} : { deletedAt: null }),
      ...(params.currentOnly ? { supersededAt: null } : {}),
      ...(params.type ? { type: params.type } : {}),
      ...(params.status ? { status: params.status } : {}),
      ...(params.buyerId ? { buyerId: params.buyerId } : {}),
      ...(params.currency ? { currency: params.currency } : {}),
      ...(params.rfqId
        ? {
            OR: [
              { primaryRfqId: params.rfqId },
              { items: { some: { rfqItem: { rfqId: params.rfqId }, deletedAt: null } } },
            ],
          }
        : {}),
      ...(params.validBefore || params.validAfter
        ? {
            validUntil: {
              ...(params.validAfter ? { gte: params.validAfter } : {}),
              ...(params.validBefore ? { lte: params.validBefore } : {}),
            },
          }
        : {}),
      ...(params.q
        ? {
            AND: [
              {
                OR: [
                  { quotationNumber: { contains: params.q, mode: 'insensitive' } },
                  { title: { contains: params.q, mode: 'insensitive' } },
                ],
              },
            ],
          }
        : {}),
    }

    const raw = params.sort ?? '-createdAt'
    const dir: Prisma.SortOrder = raw.startsWith('-') ? 'desc' : 'asc'
    const field = raw.replace(/^-/, '') as
      'createdAt' | 'validUntil' | 'grandTotal' | 'quotationNumber'

    const rows = await prisma.quotation.findMany({
      where,
      select: listSelect,
      orderBy: [{ [field]: dir }, { id: dir }],
      take: params.limit + 1,
      ...(params.cursor ? { cursor: { id: decodeCursor(params.cursor) }, skip: 1 } : {}),
    })

    const items = rows.slice(0, params.limit)
    const nextCursor = rows.length > params.limit ? encodeCursor(items[items.length - 1]!.id) : null
    return { items, nextCursor }
  },

  async mutate(
    ctx: MutationCtx,
    id: string,
    expectedVersion: number,
    data: UpdateQuotationData,
    totals?: QuotationTotals,
  ): Promise<QuotationRecord> {
    try {
      return await prisma.$transaction(async (tx) => {
        await assertBuyerInOrg(tx, ctx.organizationId, data.buyerId)
        await assertPaymentTermInOrg(tx, ctx.organizationId, data.paymentTermId)

        const before = await tx.quotation.findFirst({
          where: { id, organizationId: ctx.organizationId, deletedAt: null },
          select: listSelect,
        })
        if (!before) throw new NotFoundError('Quotation not found.')

        const updated = await tx.quotation.updateMany({
          where: {
            id,
            organizationId: ctx.organizationId,
            deletedAt: null,
            version: expectedVersion,
          },
          data: { ...data, ...(totals ?? {}), updatedById: ctx.actorId, version: { increment: 1 } },
        })
        if (updated.count === 0) throw new PreconditionFailedError()

        const after = await tx.quotation.findUniqueOrThrow({ where: { id }, select: detailSelect })
        await writeAudit(tx, {
          organizationId: ctx.organizationId,
          actorId: ctx.actorId,
          requestId: ctx.requestId,
          entityType: 'Quotation',
          entityId: id,
          action: 'quotation.updated',
          before: { grandTotal: before.grandTotal, status: before.status },
          after: { grandTotal: after.grandTotal, status: after.status },
        })
        return after
      })
    } catch (error) {
      return conflictOnUnique(error)
    }
  },

  /**
   * Replaces every line in place and stores the recomputed roll-ups. Line
   * charges, taxes and sourcing options cascade away with their lines; header
   * conditions are untouched because they target no line.
   *
   * Used only while the quotation is still editable - after SENT the caller must
   * go through `revise`.
   */
  async replaceItems(
    ctx: MutationCtx,
    id: string,
    expectedVersion: number,
    items: QuotationItemData[],
    totals: QuotationTotals,
  ): Promise<QuotationRecord> {
    return prisma.$transaction(async (tx) => {
      await assertProductsInOrg(
        tx,
        ctx.organizationId,
        items.map((it) => it.productId),
      )

      const before = await tx.quotation.findFirst({
        where: { id, organizationId: ctx.organizationId, deletedAt: null },
        select: { id: true, _count: { select: { items: true } } },
      })
      if (!before) throw new NotFoundError('Quotation not found.')

      const updated = await tx.quotation.updateMany({
        where: {
          id,
          organizationId: ctx.organizationId,
          deletedAt: null,
          version: expectedVersion,
        },
        data: { ...totals, updatedById: ctx.actorId, version: { increment: 1 } },
      })
      if (updated.count === 0) throw new PreconditionFailedError()

      await tx.quotationItem.deleteMany({ where: { quotationId: id } })
      await tx.quotationItem.createMany({
        data: lineRows(ctx.organizationId, items).map((row) => ({
          ...(row as Prisma.QuotationItemCreateManyInput),
          quotationId: id,
        })),
      })

      const after = await tx.quotation.findUniqueOrThrow({ where: { id }, select: detailSelect })
      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.actorId,
        requestId: ctx.requestId,
        entityType: 'Quotation',
        entityId: id,
        action: 'quotation.items_replaced',
        before: { lines: before._count.items },
        after: { lines: items.length, grandTotal: totals.grandTotal },
      })
      return after
    })
  },

  /**
   * Forks a new revision: the current row is marked SUPERSEDED and a new row is
   * inserted at revisionNumber + 1, chained by previousRevisionId. The previous
   * row IS the snapshot, so QuotationRevision only records what changed.
   */
  async revise(
    ctx: MutationCtx,
    id: string,
    expectedVersion: number,
    items: QuotationItemData[],
    totals: QuotationTotals,
    reason: string,
  ): Promise<QuotationRecord> {
    try {
      return await prisma.$transaction(async (tx) => {
        const current = await tx.quotation.findFirst({
          where: { id, organizationId: ctx.organizationId, deletedAt: null },
          select: detailSelect,
        })
        if (!current) throw new NotFoundError('Quotation not found.')
        if (current.supersededAt) {
          throw new ConflictError('This revision has already been superseded.')
        }

        const superseded = await tx.quotation.updateMany({
          where: {
            id,
            organizationId: ctx.organizationId,
            deletedAt: null,
            version: expectedVersion,
          },
          data: { status: 'SUPERSEDED', supersededAt: new Date(), version: { increment: 1 } },
        })
        if (superseded.count === 0) throw new PreconditionFailedError()

        const next = await tx.quotation.create({
          data: {
            organizationId: ctx.organizationId,
            quotationNumber: current.quotationNumber,
            revisionNumber: current.revisionNumber + 1,
            previousRevisionId: current.id,
            type: current.type,
            buyerId: current.buyerId,
            primaryRfqId: current.primaryRfqId,
            title: current.title,
            description: current.description,
            currency: current.currency,
            baseCurrency: current.baseCurrency,
            fxRate: current.fxRate,
            incoterm: current.incoterm,
            namedPlace: current.namedPlace,
            destinationCountry: current.destinationCountry,
            destinationPort: current.destinationPort,
            paymentTermId: current.paymentTermId,
            paymentTermsText: current.paymentTermsText,
            leadTimeDays: current.leadTimeDays,
            packingSummary: current.packingSummary,
            samplingTerms: current.samplingTerms,
            validFrom: current.validFrom,
            validUntil: current.validUntil,
            status: 'DRAFT',
            ...totals,
            createdById: ctx.actorId,
            items: { create: lineRows(ctx.organizationId, items) },
          },
          select: detailSelect,
        })

        await tx.quotationRevision.create({
          data: {
            quotationId: next.id,
            organizationId: ctx.organizationId,
            fromRevision: current.revisionNumber,
            toRevision: next.revisionNumber,
            reason,
            changeSummary: {
              itemsBefore: current.items.length,
              itemsAfter: items.length,
              grandTotalBefore: current.grandTotal?.toString() ?? null,
              grandTotalAfter: totals.grandTotal,
            } as Prisma.InputJsonValue,
            changedById: ctx.actorId,
          },
        })

        await tx.quotationApproval.create({
          data: {
            quotationId: next.id,
            organizationId: ctx.organizationId,
            fromStatus: null,
            toStatus: 'DRAFT',
            sequence: 1,
            approverId: ctx.actorId,
            comments: `Revision ${next.revisionNumber} raised: ${reason}`,
          },
        })

        await writeAudit(tx, {
          organizationId: ctx.organizationId,
          actorId: ctx.actorId,
          requestId: ctx.requestId,
          entityType: 'Quotation',
          entityId: next.id,
          action: 'quotation.revised',
          before: { revision: current.revisionNumber, id: current.id },
          after: { revision: next.revisionNumber, id: next.id, reason },
        })

        return next
      })
    } catch (error) {
      return conflictOnUnique(error)
    }
  },

  /** Records an approval transition and moves the status in one transaction. */
  async transition(
    ctx: MutationCtx,
    id: string,
    expectedVersion: number,
    toStatus: QuotationStatus,
    decision: Prisma.QuotationApprovalCreateInput['toStatus'],
    comments?: string,
    thresholdAmount?: number,
  ): Promise<QuotationRecord> {
    return prisma.$transaction(async (tx) => {
      const before = await tx.quotation.findFirst({
        where: { id, organizationId: ctx.organizationId, deletedAt: null },
        select: listSelect,
      })
      if (!before) throw new NotFoundError('Quotation not found.')

      const now = new Date()
      const updated = await tx.quotation.updateMany({
        where: {
          id,
          organizationId: ctx.organizationId,
          deletedAt: null,
          version: expectedVersion,
        },
        data: {
          status: toStatus,
          updatedById: ctx.actorId,
          version: { increment: 1 },
          ...(toStatus === 'SENT' ? { sentAt: now } : {}),
          ...(toStatus === 'ACCEPTED' ? { acceptedAt: now } : {}),
          ...(toStatus === 'REJECTED' ? { rejectedAt: now } : {}),
        },
      })
      if (updated.count === 0) throw new PreconditionFailedError()

      const last = await tx.quotationApproval.findFirst({
        where: { quotationId: id },
        orderBy: { sequence: 'desc' },
        select: { sequence: true, toStatus: true },
      })

      const detail = await tx.quotation.findUniqueOrThrow({
        where: { id },
        select: { marginPercent: true },
      })

      await tx.quotationApproval.create({
        data: {
          quotationId: id,
          organizationId: ctx.organizationId,
          fromStatus: last?.toStatus ?? null,
          toStatus: decision,
          sequence: (last?.sequence ?? 0) + 1,
          approverId: ctx.actorId,
          thresholdAmount,
          // The number approvers actually judge, recorded at decision time.
          marginPercent: detail.marginPercent,
          comments,
        },
      })

      const after = await tx.quotation.findUniqueOrThrow({ where: { id }, select: detailSelect })
      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.actorId,
        requestId: ctx.requestId,
        entityType: 'Quotation',
        entityId: id,
        action: `quotation.${String(decision).toLowerCase()}`,
        before: { status: before.status },
        after: { status: after.status },
      })
      return after
    })
  },

  approvalHistory(organizationId: string, quotationId: string) {
    return prisma.quotationApproval.findMany({
      where: { organizationId, quotationId },
      orderBy: { sequence: 'desc' },
      select: {
        id: true,
        fromStatus: true,
        toStatus: true,
        sequence: true,
        approverId: true,
        thresholdAmount: true,
        marginPercent: true,
        comments: true,
        decidedAt: true,
      },
    })
  },

  revisionHistory(organizationId: string, quotationId: string) {
    return prisma.quotationRevision.findMany({
      where: { organizationId, quotationId },
      orderBy: { toRevision: 'desc' },
      select: {
        id: true,
        fromRevision: true,
        toRevision: true,
        reason: true,
        changeSummary: true,
        changedById: true,
        changedAt: true,
      },
    })
  },

  async softDelete(
    ctx: MutationCtx,
    id: string,
    expectedVersion: number,
  ): Promise<QuotationRecord> {
    return prisma.$transaction(async (tx) => {
      const updated = await tx.quotation.updateMany({
        where: {
          id,
          organizationId: ctx.organizationId,
          deletedAt: null,
          version: expectedVersion,
        },
        data: {
          deletedAt: new Date(),
          deletedById: ctx.actorId,
          status: 'WITHDRAWN',
          version: { increment: 1 },
        },
      })
      if (updated.count === 0) throw new PreconditionFailedError()

      const after = await tx.quotation.findUniqueOrThrow({ where: { id }, select: detailSelect })
      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.actorId,
        requestId: ctx.requestId,
        entityType: 'Quotation',
        entityId: id,
        action: 'quotation.deleted',
        after: { deletedAt: after.deletedAt },
      })
      return after
    })
  },

  async restore(ctx: MutationCtx, id: string, expectedVersion: number): Promise<QuotationRecord> {
    return prisma.$transaction(async (tx) => {
      const before = await tx.quotation.findFirst({
        where: { id, organizationId: ctx.organizationId, NOT: { deletedAt: null } },
        select: { id: true },
      })
      if (!before) throw new NotFoundError('Deleted quotation not found.')

      const updated = await tx.quotation.updateMany({
        where: { id, organizationId: ctx.organizationId, version: expectedVersion },
        data: { deletedAt: null, deletedById: null, status: 'DRAFT', version: { increment: 1 } },
      })
      if (updated.count === 0) throw new PreconditionFailedError()

      const after = await tx.quotation.findUniqueOrThrow({ where: { id }, select: detailSelect })
      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.actorId,
        requestId: ctx.requestId,
        entityType: 'Quotation',
        entityId: id,
        action: 'quotation.restored',
        after: { deletedAt: after.deletedAt },
      })
      return after
    })
  },
}

export type QuotationRepository = typeof quotationRepository
