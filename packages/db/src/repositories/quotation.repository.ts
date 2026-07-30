import { Prisma, type QuotationStatus, type QuotationType } from '@prisma/client'
import { ConflictError, NotFoundError, PreconditionFailedError } from '@triyara/lib'

import { writeAudit } from '../audit'
import { prisma } from '../client'
import { decodeCursor, encodeCursor, type MutationCtx } from './account.repository'

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

export const quotationRepository = {
  async create(
    ctx: MutationCtx,
    data: CreateQuotationData,
    items: QuotationItemData[],
    totals: QuotationTotals,
  ): Promise<QuotationRecord> {
    try {
      return await prisma.$transaction(async (tx) => {
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
