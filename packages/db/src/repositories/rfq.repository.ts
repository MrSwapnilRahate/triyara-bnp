import { Prisma, type RFQPriority, type RFQStatus, type RFQType } from '@prisma/client'
import { ConflictError, NotFoundError, PreconditionFailedError } from '@triyara/lib'

import { writeAudit } from '../audit'
import { prisma } from '../client'
import { decodeCursor, encodeCursor, type MutationCtx } from './account.repository'

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
