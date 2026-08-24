import { Prisma, type RFQPriority, type RFQStatus, type RFQType } from '@prisma/client'
import { ConflictError, NotFoundError, PreconditionFailedError } from '@triyara/lib'

import { writeAudit } from '../audit'
import { prisma } from '../client'
import { decodeCursor, encodeCursor, type MutationCtx } from './account.repository'
import { assertBuyerInOrg, assertProductsInOrg } from './tenant-refs'

// RFQ aggregate (TRY-BNP-RFQ-01). Line items are owned by the RFQ and replaced
// wholesale; supplier participation and responses live in their own repository.

const listSelect = {
  id: true,
  organizationId: true,
  rfqNumber: true,
  type: true,
  buyerId: true,
  title: true,
  currency: true,
  incoterm: true,
  destinationCountry: true,
  destinationPort: true,
  expectedShipmentDate: true,
  quotationDeadline: true,
  status: true,
  priority: true,
  currentRevision: true,
  awardedSupplierId: true,
  awardedAt: true,
  awardedById: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} satisfies Prisma.RFQSelect

const detailSelect = {
  ...listSelect,
  description: true,
  createdById: true,
  items: {
    where: { deletedAt: null },
    orderBy: { lineNumber: 'asc' },
    select: {
      id: true,
      lineNumber: true,
      productId: true,
      customProductName: true,
      customProductDescription: true,
      quantity: true,
      unit: true,
      targetPrice: true,
      targetCurrency: true,
      specifications: true,
      requiredCertifications: true,
      packaging: true,
      remarks: true,
      version: true,
      product: { select: { id: true, sku: true, name: true } },
    },
  },
  suppliers: {
    where: { deletedAt: null },
    orderBy: { invitedAt: 'asc' },
    select: {
      id: true,
      supplierId: true,
      status: true,
      invitedAt: true,
      viewedAt: true,
      respondedAt: true,
      submittedAt: true,
      isLate: true,
      quotationCurrency: true,
      quotationIncoterm: true,
      quotationPort: true,
      quotationValidUntil: true,
      quotationTotal: true,
      version: true,
      supplier: { select: { id: true, supplierCode: true, companyName: true, status: true } },
    },
  },
} satisfies Prisma.RFQSelect

export type RfqListItem = Prisma.RFQGetPayload<{ select: typeof listSelect }>
export type RfqRecord = Prisma.RFQGetPayload<{ select: typeof detailSelect }>

export interface CreateRfqData {
  rfqNumber: string
  type: RFQType
  buyerId?: string | null
  title: string
  description?: string
  currency?: string
  incoterm?: Prisma.RFQCreateInput['incoterm']
  destinationCountry?: string
  destinationPort?: string
  expectedShipmentDate?: Date
  quotationDeadline?: Date
  priority?: RFQPriority
}

export type UpdateRfqData = Partial<CreateRfqData>

export interface RfqItemData {
  productId?: string | null
  customProductName?: string | null
  customProductDescription?: string
  quantity: number
  unit: string
  targetPrice?: number
  targetCurrency?: string
  specifications?: Prisma.InputJsonValue
  requiredCertifications?: Prisma.RFQItemCreateManyInput['requiredCertifications']
  packaging?: string
  remarks?: string
}

/** States an RFQ can still take a new supplier in. */
export const OPEN_RFQ_STATUSES: RFQStatus[] = [
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'ISSUED',
  'IN_PROGRESS',
]

export interface ListRfqsParams {
  organizationId: string
  q?: string
  type?: RFQType
  status?: RFQStatus
  openOnly?: boolean
  priority?: RFQPriority
  buyerId?: string
  supplierId?: string
  productId?: string
  destinationCountry?: string
  destinationPort?: string
  deadlineBefore?: Date
  deadlineAfter?: Date
  includeDeleted?: boolean
  sort?: string
  limit: number
  cursor?: string
}

export interface RfqListResult {
  items: RfqListItem[]
  nextCursor: string | null
}

/**
 * What a buyer may be told about their own RFQ.
 *
 * A separate select from `listSelect`, which is an internal projection and
 * carries `awardedSupplierId` - the identity of the supplier who won the round -
 * along with `awardedById`, `organizationId`, `version` and `deletedAt`. Reusing
 * it and trusting each caller to drop those is how one of them eventually will
 * not, and the first field in that list is the one TRIYARA exists to keep
 * between the two sides.
 *
 * Selected at the database rather than filtered afterwards, so the columns never
 * enter the process.
 */
const buyerListSelect = {
  rfqNumber: true,
  title: true,
  status: true,
  priority: true,
  currency: true,
  incoterm: true,
  destinationCountry: true,
  destinationPort: true,
  expectedShipmentDate: true,
  quotationDeadline: true,
  createdAt: true,
} satisfies Prisma.RFQSelect

export type BuyerRfqListItem = Prisma.RFQGetPayload<{ select: typeof buyerListSelect }>

/**
 * What a buyer may be told about one of their own RFQs, in full.
 *
 * The list's eleven fields plus the requirement lines - what they asked us to
 * source. Nothing else: no `description`, because the domain cannot distinguish
 * what the buyer wrote from what an operator edited afterwards, and no relation
 * that leads to the other side of the intermediary.
 *
 * `items` is the one relation crossed, and it is crossed narrowly. Written as an
 * explicit `select` rather than an `include` precisely because `RFQItem` also
 * relates to `RFQSupplierResponse` and `QuotationItem` - supplier bids and
 * sourced pricing hanging off the buyer's own line. An `include` here would be
 * one word away from handing over both.
 *
 * `product` is entered for the name alone. The catalogue's `id` and `sku` are
 * internal handles the buyer has no use for, so they are not selected.
 */
const buyerDetailSelect = {
  rfqNumber: true,
  title: true,
  status: true,
  priority: true,
  currency: true,
  incoterm: true,
  destinationCountry: true,
  destinationPort: true,
  expectedShipmentDate: true,
  quotationDeadline: true,
  createdAt: true,
  items: {
    where: { deletedAt: null },
    orderBy: { lineNumber: 'asc' },
    select: {
      lineNumber: true,
      // Catalogue name when the line names a product, and the free-text name
      // otherwise - `customProductName` is documented as used only when
      // `productId` is null.
      customProductName: true,
      product: { select: { name: true } },
      quantity: true,
      unit: true,
      requiredCertifications: true,
      packaging: true,
    },
  },
} satisfies Prisma.RFQSelect

export type BuyerRfqDetail = Prisma.RFQGetPayload<{ select: typeof buyerDetailSelect }>

export interface BuyerRfqListResult {
  items: BuyerRfqListItem[]
  /** Whether the account owns more RFQs than were returned. Carries no cursor. */
  hasMore: boolean
}

/** How many of a buyer's RFQs one portal page shows. */
const DEFAULT_BUYER_RFQ_LIMIT = 50

function conflictOnUnique(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    throw new ConflictError('An RFQ with that number already exists.')
  }
  throw error
}

export const rfqRepository = {
  async create(ctx: MutationCtx, data: CreateRfqData, items: RfqItemData[]): Promise<RfqRecord> {
    try {
      return await prisma.$transaction(async (tx) => {
        await assertBuyerInOrg(tx, ctx.organizationId, data.buyerId)
        await assertProductsInOrg(
          tx,
          ctx.organizationId,
          items.map((it) => it.productId),
        )

        const rfq = await tx.rFQ.create({
          data: {
            organizationId: ctx.organizationId,
            ...data,
            createdById: ctx.actorId,
            items: {
              create: items.map((it, i) => ({
                organizationId: ctx.organizationId,
                lineNumber: i + 1,
                productId: it.productId ?? null,
                customProductName: it.customProductName ?? null,
                customProductDescription: it.customProductDescription,
                quantity: it.quantity,
                unit: it.unit,
                targetPrice: it.targetPrice,
                targetCurrency: it.targetCurrency,
                specifications: it.specifications,
                requiredCertifications: it.requiredCertifications ?? [],
                packaging: it.packaging,
                remarks: it.remarks,
              })),
            },
          },
          select: detailSelect,
        })

        // Opening entry, so the approval history is complete from the first event.
        await tx.rFQApproval.create({
          data: {
            rfqId: rfq.id,
            organizationId: ctx.organizationId,
            fromStatus: null,
            toStatus: 'DRAFT',
            sequence: 1,
            approverId: ctx.actorId,
            comments: 'RFQ created.',
          },
        })

        await tx.rFQRevision.create({
          data: {
            rfqId: rfq.id,
            organizationId: ctx.organizationId,
            revisionNumber: 1,
            reason: 'Initial issue.',
            snapshot: snapshotOf(rfq),
            changedById: ctx.actorId,
          },
        })

        await writeAudit(tx, {
          organizationId: ctx.organizationId,
          actorId: ctx.actorId,
          requestId: ctx.requestId,
          entityType: 'RFQ',
          entityId: rfq.id,
          action: 'rfq.created',
          after: { rfqNumber: rfq.rfqNumber, type: rfq.type, items: items.length },
        })

        return rfq
      })
    } catch (error) {
      return conflictOnUnique(error)
    }
  },

  findById(
    organizationId: string,
    id: string,
    opts: { includeDeleted?: boolean } = {},
  ): Promise<RfqRecord | null> {
    return prisma.rFQ.findFirst({
      where: { id, organizationId, ...(opts.includeDeleted ? {} : { deletedAt: null }) },
      select: detailSelect,
    })
  },

  findByNumber(organizationId: string, rfqNumber: string): Promise<RfqRecord | null> {
    return prisma.rFQ.findFirst({ where: { organizationId, rfqNumber }, select: detailSelect })
  },

  /**
   * The RFQs one buyer account owns (TRY-BNP-PORTAL-RFQ).
   *
   * Separate from `list` rather than another parameter on it, and the reason is
   * the shape of the filter rather than tidiness. `list` applies its buyer as
   * `...(params.buyerId ? { buyerId: params.buyerId } : {})` - an optional
   * filter, correct for an internal screen that may or may not be narrowing by
   * customer. Read by an external party it becomes the wrong default: a falsy
   * buyer omits the clause entirely and returns every RFQ in the tenant.
   *
   * Here both scopes are required positional arguments and both are written
   * unconditionally into the `where`. There is no branch in which one of them is
   * absent, so no value a caller can pass makes this query wider than one
   * account.
   *
   * `buyerId` doubles as the type filter: INTERNAL RFQs carry no buyer, so
   * matching on an account excludes them without naming `type` at all.
   *
   * Returns `hasMore` rather than a cursor, deliberately. `encodeCursor` is
   * base64url of the row id and nothing else, so handing one to the browser
   * would hand over an RFQ id - which the buyer-facing projection excludes.
   * Paging belongs with the detail view, where an identifier is needed anyway.
   */
  async listForBuyer(
    organizationId: string,
    buyerId: string,
    limit = DEFAULT_BUYER_RFQ_LIMIT,
  ): Promise<BuyerRfqListResult> {
    const rows = await prisma.rFQ.findMany({
      where: {
        organizationId,
        buyerId,
        deletedAt: null,
      },
      select: buyerListSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      // One more than asked for, so "is there another page" is answered without
      // a second count query - the same trick `list` uses for its cursor.
      take: limit + 1,
    })

    return { items: rows.slice(0, limit), hasMore: rows.length > limit }
  },

  /**
   * One RFQ, by the number the buyer can see, scoped to the buyer who owns it.
   *
   * Not `findByNumber`, which is organization-scoped but carries no buyer clause
   * and no soft-delete filter - reading it from the portal would return another
   * buyer's RFQ in the same tenant, and deleted ones. Not `findById` either: the
   * buyer holds no row id, and it returns the internal projection.
   *
   * All four clauses are required arguments written unconditionally into the
   * `where`. `rfqNumber` is unique only per organization - the constraint is
   * `@@unique([organizationId, rfqNumber])` - so it is safe here precisely
   * because the organization travels with it, and never safe alone.
   *
   * `buyerId` also settles the INTERNAL case without naming `type`: an internal
   * RFQ carries no buyer, and null matches no account.
   */
  findForBuyer(
    organizationId: string,
    buyerId: string,
    rfqNumber: string,
  ): Promise<BuyerRfqDetail | null> {
    return prisma.rFQ.findFirst({
      where: {
        organizationId,
        buyerId,
        rfqNumber,
        deletedAt: null,
      },
      select: buyerDetailSelect,
    })
  },

  async list(params: ListRfqsParams): Promise<RfqListResult> {
    const where: Prisma.RFQWhereInput = {
      organizationId: params.organizationId,
      ...(params.includeDeleted ? {} : { deletedAt: null }),
      ...(params.type ? { type: params.type } : {}),
      // One `status` clause, not two. An explicit status wins over `openOnly`:
      // asking for CLOSED means CLOSED, and silently widening it to the open
      // set would answer a question nobody asked.
      //
      // Inviting a supplier only makes sense before the RFQ has been settled,
      // so `openOnly` excludes AWARDED, CLOSED, CANCELLED and EXPIRED.
      ...(params.status
        ? { status: params.status }
        : params.openOnly
          ? { status: { in: [...OPEN_RFQ_STATUSES] } }
          : {}),
      ...(params.priority ? { priority: params.priority } : {}),
      ...(params.buyerId ? { buyerId: params.buyerId } : {}),
      ...(params.destinationCountry ? { destinationCountry: params.destinationCountry } : {}),
      ...(params.destinationPort
        ? { destinationPort: { contains: params.destinationPort, mode: 'insensitive' } }
        : {}),
      ...(params.supplierId
        ? { suppliers: { some: { supplierId: params.supplierId, deletedAt: null } } }
        : {}),
      ...(params.productId
        ? { items: { some: { productId: params.productId, deletedAt: null } } }
        : {}),
      ...(params.deadlineBefore || params.deadlineAfter
        ? {
            quotationDeadline: {
              ...(params.deadlineAfter ? { gte: params.deadlineAfter } : {}),
              ...(params.deadlineBefore ? { lte: params.deadlineBefore } : {}),
            },
          }
        : {}),
      ...(params.q
        ? {
            OR: [
              { rfqNumber: { contains: params.q, mode: 'insensitive' } },
              { title: { contains: params.q, mode: 'insensitive' } },
              { description: { contains: params.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    }

    const raw = params.sort ?? '-createdAt'
    const dir: Prisma.SortOrder = raw.startsWith('-') ? 'desc' : 'asc'
    const field = raw.replace(/^-/, '') as 'createdAt' | 'quotationDeadline' | 'rfqNumber'

    const rows = await prisma.rFQ.findMany({
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
    data: UpdateRfqData,
  ): Promise<RfqRecord> {
    try {
      return await prisma.$transaction(async (tx) => {
        await assertBuyerInOrg(tx, ctx.organizationId, data.buyerId)

        const before = await tx.rFQ.findFirst({
          where: { id, organizationId: ctx.organizationId, deletedAt: null },
          select: listSelect,
        })
        if (!before) throw new NotFoundError('RFQ not found.')

        const updated = await tx.rFQ.updateMany({
          where: {
            id,
            organizationId: ctx.organizationId,
            deletedAt: null,
            version: expectedVersion,
          },
          data: { ...data, updatedById: ctx.actorId, version: { increment: 1 } },
        })
        if (updated.count === 0) throw new PreconditionFailedError()

        const after = await tx.rFQ.findUniqueOrThrow({ where: { id }, select: detailSelect })
        await writeAudit(tx, {
          organizationId: ctx.organizationId,
          actorId: ctx.actorId,
          requestId: ctx.requestId,
          entityType: 'RFQ',
          entityId: id,
          action: 'rfq.updated',
          before,
          after: { rfqNumber: after.rfqNumber, title: after.title, status: after.status },
        })
        return after
      })
    } catch (error) {
      return conflictOnUnique(error)
    }
  },

  /**
   * Replaces the line items and records a new revision. The snapshot is taken
   * AFTER the change, so each revision row reproduces the RFQ as issued.
   */
  async replaceItems(
    ctx: MutationCtx,
    id: string,
    expectedVersion: number,
    items: RfqItemData[],
    reason?: string,
  ): Promise<RfqRecord> {
    return prisma.$transaction(async (tx) => {
      await assertProductsInOrg(
        tx,
        ctx.organizationId,
        items.map((it) => it.productId),
      )

      const before = await tx.rFQ.findFirst({
        where: { id, organizationId: ctx.organizationId, deletedAt: null },
        select: { id: true, currentRevision: true },
      })
      if (!before) throw new NotFoundError('RFQ not found.')

      const updated = await tx.rFQ.updateMany({
        where: {
          id,
          organizationId: ctx.organizationId,
          deletedAt: null,
          version: expectedVersion,
        },
        data: {
          currentRevision: { increment: 1 },
          updatedById: ctx.actorId,
          version: { increment: 1 },
        },
      })
      if (updated.count === 0) throw new PreconditionFailedError()

      await tx.rFQItem.deleteMany({ where: { rfqId: id } })
      await tx.rFQItem.createMany({
        data: items.map((it, i) => ({
          rfqId: id,
          organizationId: ctx.organizationId,
          lineNumber: i + 1,
          productId: it.productId ?? null,
          customProductName: it.customProductName ?? null,
          customProductDescription: it.customProductDescription,
          quantity: it.quantity,
          unit: it.unit,
          targetPrice: it.targetPrice,
          targetCurrency: it.targetCurrency,
          specifications: it.specifications,
          requiredCertifications: it.requiredCertifications ?? [],
          packaging: it.packaging,
          remarks: it.remarks,
        })),
      })

      const after = await tx.rFQ.findUniqueOrThrow({ where: { id }, select: detailSelect })

      await tx.rFQRevision.create({
        data: {
          rfqId: id,
          organizationId: ctx.organizationId,
          revisionNumber: after.currentRevision,
          reason: reason ?? 'Line items revised.',
          snapshot: snapshotOf(after),
          changedById: ctx.actorId,
        },
      })

      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.actorId,
        requestId: ctx.requestId,
        entityType: 'RFQ',
        entityId: id,
        action: 'rfq.items_revised',
        after: { revision: after.currentRevision, items: items.length },
      })
      return after
    })
  },

  /** Records an approval transition and moves the RFQ status in one transaction. */
  async transition(
    ctx: MutationCtx,
    id: string,
    expectedVersion: number,
    toStatus: RFQStatus,
    decision: Prisma.RFQApprovalCreateInput['toStatus'],
    comments?: string,
  ): Promise<RfqRecord> {
    return prisma.$transaction(async (tx) => {
      const before = await tx.rFQ.findFirst({
        where: { id, organizationId: ctx.organizationId, deletedAt: null },
        select: listSelect,
      })
      if (!before) throw new NotFoundError('RFQ not found.')

      const updated = await tx.rFQ.updateMany({
        where: {
          id,
          organizationId: ctx.organizationId,
          deletedAt: null,
          version: expectedVersion,
        },
        data: { status: toStatus, updatedById: ctx.actorId, version: { increment: 1 } },
      })
      if (updated.count === 0) throw new PreconditionFailedError()

      const last = await tx.rFQApproval.findFirst({
        where: { rfqId: id },
        orderBy: { sequence: 'desc' },
        select: { sequence: true, toStatus: true },
      })

      await tx.rFQApproval.create({
        data: {
          rfqId: id,
          organizationId: ctx.organizationId,
          fromStatus: last?.toStatus ?? null,
          toStatus: decision,
          sequence: (last?.sequence ?? 0) + 1,
          approverId: ctx.actorId,
          comments,
        },
      })

      const after = await tx.rFQ.findUniqueOrThrow({ where: { id }, select: detailSelect })
      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.actorId,
        requestId: ctx.requestId,
        entityType: 'RFQ',
        entityId: id,
        action: `rfq.${String(decision).toLowerCase()}`,
        before: { status: before.status },
        after: { status: after.status },
      })
      return after
    })
  },

  /**
   * Awards the round to one supplier.
   *
   * One transaction, because four facts must become true together: the RFQ is
   * AWARDED, it points at the winner, the winning participation is AWARDED, and
   * the audit row exists. A partial result here is a sourcing round whose
   * recorded outcome disagrees with itself.
   *
   * The version is checked in the WHERE clause, never compared after a read, so
   * two reviewers awarding at once cannot both win. The second gets a 412.
   *
   * `participationId` is re-checked against the RFQ inside the transaction even
   * though the service already validated it: between those two moments the
   * participation could have been withdrawn.
   */
  async award(
    ctx: MutationCtx,
    id: string,
    expectedVersion: number,
    participationId: string,
  ): Promise<RfqRecord> {
    return prisma.$transaction(async (tx) => {
      const before = await tx.rFQ.findFirst({
        where: { id, organizationId: ctx.organizationId, deletedAt: null },
        select: { status: true, awardedSupplierId: true },
      })
      if (!before) throw new NotFoundError('RFQ not found.')
      if (before.awardedSupplierId) {
        throw new ConflictError('This RFQ has already been awarded.')
      }

      const participation = await tx.rFQSupplier.findFirst({
        where: {
          id: participationId,
          rfqId: id,
          organizationId: ctx.organizationId,
          deletedAt: null,
        },
        select: { id: true, supplierId: true, status: true, submittedAt: true },
      })
      if (!participation) throw new NotFoundError('Supplier participation not found on this RFQ.')
      if (!participation.submittedAt) {
        throw new ConflictError('That supplier has not submitted a quotation.')
      }

      const updated = await tx.rFQ.updateMany({
        where: {
          id,
          organizationId: ctx.organizationId,
          deletedAt: null,
          version: expectedVersion,
        },
        data: {
          status: 'AWARDED',
          awardedSupplierId: participation.supplierId,
          awardedAt: new Date(),
          awardedById: ctx.actorId,
          updatedById: ctx.actorId,
          version: { increment: 1 },
        },
      })
      if (updated.count === 0) throw new PreconditionFailedError()

      await tx.rFQSupplier.update({
        where: { id: participation.id },
        data: { status: 'AWARDED', version: { increment: 1 } },
      })

      // The approval trail records APPROVED: awarding concluded the round
      // normally. RFQApprovalStatus has no AWARDED member, and CANCELLED would
      // misrepresent it - the same reasoning `close` uses.
      const last = await tx.rFQApproval.findFirst({
        where: { rfqId: id },
        orderBy: { sequence: 'desc' },
        select: { sequence: true, toStatus: true },
      })
      await tx.rFQApproval.create({
        data: {
          rfqId: id,
          organizationId: ctx.organizationId,
          fromStatus: last?.toStatus ?? null,
          toStatus: 'APPROVED',
          sequence: (last?.sequence ?? 0) + 1,
          approverId: ctx.actorId,
          comments: 'Sourcing round awarded.',
        },
      })

      const after = await tx.rFQ.findUniqueOrThrow({ where: { id }, select: detailSelect })
      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.actorId,
        requestId: ctx.requestId,
        entityType: 'RFQ',
        entityId: id,
        action: 'rfq.awarded',
        before: { status: before.status, awardedSupplierId: null },
        after: { status: after.status, awardedSupplierId: after.awardedSupplierId },
      })
      return after
    })
  },

  approvalHistory(organizationId: string, rfqId: string) {
    return prisma.rFQApproval.findMany({
      where: { organizationId, rfqId },
      orderBy: { sequence: 'desc' },
      select: {
        id: true,
        fromStatus: true,
        toStatus: true,
        sequence: true,
        approverId: true,
        comments: true,
        decidedAt: true,
      },
    })
  },

  revisionHistory(organizationId: string, rfqId: string) {
    return prisma.rFQRevision.findMany({
      where: { organizationId, rfqId },
      orderBy: { revisionNumber: 'desc' },
      select: {
        id: true,
        revisionNumber: true,
        reason: true,
        snapshot: true,
        changedById: true,
        changedAt: true,
      },
    })
  },

  async softDelete(ctx: MutationCtx, id: string, expectedVersion: number): Promise<RfqRecord> {
    return prisma.$transaction(async (tx) => {
      const updated = await tx.rFQ.updateMany({
        where: {
          id,
          organizationId: ctx.organizationId,
          deletedAt: null,
          version: expectedVersion,
        },
        data: {
          deletedAt: new Date(),
          deletedById: ctx.actorId,
          status: 'CANCELLED',
          version: { increment: 1 },
        },
      })
      if (updated.count === 0) throw new PreconditionFailedError()

      const after = await tx.rFQ.findUniqueOrThrow({ where: { id }, select: detailSelect })
      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.actorId,
        requestId: ctx.requestId,
        entityType: 'RFQ',
        entityId: id,
        action: 'rfq.deleted',
        after: { deletedAt: after.deletedAt },
      })
      return after
    })
  },

  async restore(ctx: MutationCtx, id: string, expectedVersion: number): Promise<RfqRecord> {
    return prisma.$transaction(async (tx) => {
      const before = await tx.rFQ.findFirst({
        where: { id, organizationId: ctx.organizationId, NOT: { deletedAt: null } },
        select: { id: true },
      })
      if (!before) throw new NotFoundError('Deleted RFQ not found.')

      const updated = await tx.rFQ.updateMany({
        where: { id, organizationId: ctx.organizationId, version: expectedVersion },
        data: { deletedAt: null, deletedById: null, status: 'DRAFT', version: { increment: 1 } },
      })
      if (updated.count === 0) throw new PreconditionFailedError()

      const after = await tx.rFQ.findUniqueOrThrow({ where: { id }, select: detailSelect })
      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.actorId,
        requestId: ctx.requestId,
        entityType: 'RFQ',
        entityId: id,
        action: 'rfq.restored',
        after: { deletedAt: after.deletedAt },
      })
      return after
    })
  },
}

/** Full snapshot of the header and lines, as the design requires. */
function snapshotOf(rfq: RfqRecord): Prisma.InputJsonValue {
  return {
    rfqNumber: rfq.rfqNumber,
    type: rfq.type,
    title: rfq.title,
    currency: rfq.currency,
    incoterm: rfq.incoterm,
    destinationCountry: rfq.destinationCountry,
    destinationPort: rfq.destinationPort,
    quotationDeadline: rfq.quotationDeadline?.toISOString() ?? null,
    expectedShipmentDate: rfq.expectedShipmentDate?.toISOString() ?? null,
    items: rfq.items.map((i) => ({
      lineNumber: i.lineNumber,
      productId: i.productId,
      customProductName: i.customProductName,
      quantity: i.quantity.toString(),
      unit: i.unit,
      targetPrice: i.targetPrice?.toString() ?? null,
      requiredCertifications: i.requiredCertifications,
    })),
  } as Prisma.InputJsonValue
}

export type RfqRepository = typeof rfqRepository
