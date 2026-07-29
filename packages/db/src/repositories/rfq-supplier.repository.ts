import { Prisma, type RFQSupplierStatus } from '@prisma/client'
import { ConflictError, NotFoundError, PreconditionFailedError } from '@triyara/lib'

import { writeAudit } from '../audit'
import { prisma } from '../client'
import { decodeCursor, encodeCursor, type MutationCtx } from './account.repository'

// Supplier participation and bids (TRY-BNP-RFQ-01).
//
// A re-submission inserts a NEW revision row and flips isCurrent rather than
// overwriting, which is what makes price history fall out of the model. A
// partial unique index guarantees one current row per supplier per line.

const participationSelect = {
  id: true,
  rfqId: true,
  supplierId: true,
  organizationId: true,
  status: true,
  invitedById: true,
  invitedAt: true,
  viewedAt: true,
  respondedAt: true,
  declineReason: true,
  submittedAt: true,
  isLate: true,
  quotationCurrency: true,
  quotationIncoterm: true,
  quotationPort: true,
  quotationValidUntil: true,
  quotationRemarks: true,
  quotationTotal: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  supplier: { select: { id: true, supplierCode: true, companyName: true, status: true } },
} satisfies Prisma.RFQSupplierSelect

const responseSelect = {
  id: true,
  rfqSupplierId: true,
  rfqItemId: true,
  organizationId: true,
  revisionNumber: true,
  isCurrent: true,
  price: true,
  currency: true,
  moq: true,
  moqUnit: true,
  leadTimeDays: true,
  incoterm: true,
  port: true,
  offeredProductId: true,
  offeredDescription: true,
  remarks: true,
  validUntil: true,
  submittedAt: true,
  version: true,
  deletedAt: true,
} satisfies Prisma.RFQSupplierResponseSelect

export type RfqParticipationRecord = Prisma.RFQSupplierGetPayload<{
  select: typeof participationSelect
}>
export type RfqResponseRecord = Prisma.RFQSupplierResponseGetPayload<{
  select: typeof responseSelect
}>

export interface ResponseLineData {
  rfqItemId: string
  price: number
  currency: string
  moq?: number
  moqUnit?: string
  leadTimeDays?: number
  incoterm?: Prisma.RFQSupplierResponseCreateManyInput['incoterm']
  port?: string
  offeredProductId?: string
  offeredDescription?: string
  remarks?: string
  validUntil?: Date
}

export interface SubmitResponseData {
  quotationCurrency?: string
  quotationIncoterm?: Prisma.RFQSupplierUpdateInput['quotationIncoterm']
  quotationPort?: string
  quotationValidUntil?: Date
  quotationRemarks?: string
  lines: ResponseLineData[]
}

export interface ListResponsesParams {
  organizationId: string
  rfqItemId?: string
  rfqSupplierId?: string
  currentOnly?: boolean
  limit: number
  cursor?: string
}

export const rfqSupplierRepository = {
  /** Invites suppliers. Already-invited suppliers are skipped, not duplicated. */
  async invite(
    ctx: MutationCtx,
    rfqId: string,
    supplierIds: string[],
  ): Promise<RfqParticipationRecord[]> {
    return prisma.$transaction(async (tx) => {
      const rfq = await tx.rFQ.findFirst({
        where: { id: rfqId, organizationId: ctx.organizationId, deletedAt: null },
        select: { id: true },
      })
      if (!rfq) throw new NotFoundError('RFQ not found.')

      const valid = await tx.supplier.findMany({
        where: { id: { in: supplierIds }, organizationId: ctx.organizationId, deletedAt: null },
        select: { id: true },
      })
      const validIds = new Set(valid.map((s) => s.id))
      const missing = supplierIds.filter((id) => !validIds.has(id))
      if (missing.length > 0) throw new NotFoundError(`Supplier not found: ${missing.join(', ')}`)

      const existing = await tx.rFQSupplier.findMany({
        where: { rfqId, supplierId: { in: supplierIds } },
        select: { supplierId: true },
      })
      const already = new Set(existing.map((e) => e.supplierId))
      const toInvite = supplierIds.filter((id) => !already.has(id))

      if (toInvite.length > 0) {
        await tx.rFQSupplier.createMany({
          data: toInvite.map((supplierId) => ({
            rfqId,
            supplierId,
            organizationId: ctx.organizationId,
            invitedById: ctx.actorId,
          })),
        })
        await writeAudit(tx, {
          organizationId: ctx.organizationId,
          actorId: ctx.actorId,
          requestId: ctx.requestId,
          entityType: 'RFQ',
          entityId: rfqId,
          action: 'rfq.suppliers_invited',
          after: { invited: toInvite.length, skipped: already.size },
        })
      }

      return tx.rFQSupplier.findMany({
        where: { rfqId, deletedAt: null },
        select: participationSelect,
        orderBy: { invitedAt: 'asc' },
      })
    })
  },

  findParticipation(organizationId: string, id: string): Promise<RfqParticipationRecord | null> {
    return prisma.rFQSupplier.findFirst({
      where: { id, organizationId, deletedAt: null },
      select: participationSelect,
    })
  },

  listParticipation(organizationId: string, rfqId: string): Promise<RfqParticipationRecord[]> {
    return prisma.rFQSupplier.findMany({
      where: { organizationId, rfqId, deletedAt: null },
      select: participationSelect,
      orderBy: { invitedAt: 'asc' },
    })
  },

  async setStatus(
    ctx: MutationCtx,
    id: string,
    expectedVersion: number,
    status: RFQSupplierStatus,
    declineReason?: string,
  ): Promise<RfqParticipationRecord> {
    return prisma.$transaction(async (tx) => {
      const before = await tx.rFQSupplier.findFirst({
        where: { id, organizationId: ctx.organizationId, deletedAt: null },
        select: participationSelect,
      })
      if (!before) throw new NotFoundError('Supplier participation not found.')

      const now = new Date()
      const updated = await tx.rFQSupplier.updateMany({
        where: {
          id,
          organizationId: ctx.organizationId,
          deletedAt: null,
          version: expectedVersion,
        },
        data: {
          status,
          declineReason: status === 'DECLINED' ? declineReason : null,
          ...(status === 'VIEWED' && !before.viewedAt ? { viewedAt: now } : {}),
          ...(status === 'ACCEPTED' || status === 'DECLINED' ? { respondedAt: now } : {}),
          version: { increment: 1 },
        },
      })
      if (updated.count === 0) throw new PreconditionFailedError()

      const after = await tx.rFQSupplier.findUniqueOrThrow({
        where: { id },
        select: participationSelect,
      })
      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.actorId,
        requestId: ctx.requestId,
        entityType: 'RFQSupplier',
        entityId: id,
        action: 'rfq.participation_changed',
        before: { status: before.status },
        after: { status: after.status },
      })
      return after
    })
  },

  /**
   * Submits (or re-submits) a bid. Prior lines are superseded rather than
   * deleted: isCurrent flips to false and the new lines get the next revision
   * number, so the full price history survives.
   *
   * `isLate` is computed here from the RFQ deadline - lateness is a property of
   * the submission, not a participation status.
   */
  async submitResponse(
    ctx: MutationCtx,
    rfqSupplierId: string,
    data: SubmitResponseData,
  ): Promise<{ participation: RfqParticipationRecord; lines: RfqResponseRecord[] }> {
    try {
      return await prisma.$transaction(async (tx) => {
        const participation = await tx.rFQSupplier.findFirst({
          where: { id: rfqSupplierId, organizationId: ctx.organizationId, deletedAt: null },
          select: { id: true, rfqId: true, version: true, status: true },
        })
        if (!participation) throw new NotFoundError('Supplier participation not found.')
        if (participation.status === 'DECLINED' || participation.status === 'WITHDRAWN') {
          throw new ConflictError(`A ${participation.status} supplier cannot submit a bid.`)
        }

        const rfq = await tx.rFQ.findUniqueOrThrow({
          where: { id: participation.rfqId },
          select: { quotationDeadline: true, status: true },
        })

        const itemIds = [...new Set(data.lines.map((l) => l.rfqItemId))]
        const items = await tx.rFQItem.findMany({
          where: { id: { in: itemIds }, rfqId: participation.rfqId, deletedAt: null },
          select: { id: true },
        })
        const known = new Set(items.map((i) => i.id))
        const unknown = itemIds.filter((id) => !known.has(id))
        if (unknown.length > 0) {
          throw new NotFoundError(`Line does not belong to this RFQ: ${unknown.join(', ')}`)
        }

        const now = new Date()
        const isLate = rfq.quotationDeadline ? now > rfq.quotationDeadline : false

        // Supersede the current lines rather than deleting them.
        await tx.rFQSupplierResponse.updateMany({
          where: { rfqSupplierId, isCurrent: true },
          data: { isCurrent: false },
        })

        const created: RfqResponseRecord[] = []
        for (const line of data.lines) {
          const prior = await tx.rFQSupplierResponse.findFirst({
            where: { rfqSupplierId, rfqItemId: line.rfqItemId },
            orderBy: { revisionNumber: 'desc' },
            select: { revisionNumber: true },
          })
          const row = await tx.rFQSupplierResponse.create({
            data: {
              rfqSupplierId,
              rfqItemId: line.rfqItemId,
              organizationId: ctx.organizationId,
              revisionNumber: (prior?.revisionNumber ?? 0) + 1,
              isCurrent: true,
              price: line.price,
              currency: line.currency,
              moq: line.moq,
              moqUnit: line.moqUnit,
              leadTimeDays: line.leadTimeDays,
              incoterm: line.incoterm,
              port: line.port,
              offeredProductId: line.offeredProductId,
              offeredDescription: line.offeredDescription,
              remarks: line.remarks,
              validUntil: line.validUntil,
              submittedAt: now,
            },
            select: responseSelect,
          })
          created.push(row)
        }

        const total = created.reduce((sum, l) => sum + Number(l.price), 0)

        await tx.rFQSupplier.update({
          where: { id: rfqSupplierId },
          data: {
            status: 'SUBMITTED',
            submittedAt: now,
            isLate,
            quotationCurrency: data.quotationCurrency,
            quotationIncoterm: data.quotationIncoterm,
            quotationPort: data.quotationPort,
            quotationValidUntil: data.quotationValidUntil,
            quotationRemarks: data.quotationRemarks,
            quotationTotal: total.toFixed(4),
            version: { increment: 1 },
          },
        })

        await writeAudit(tx, {
          organizationId: ctx.organizationId,
          actorId: ctx.actorId,
          requestId: ctx.requestId,
          entityType: 'RFQSupplier',
          entityId: rfqSupplierId,
          action: 'rfq.response_submitted',
          after: { lines: created.length, total, isLate },
        })

        const after = await tx.rFQSupplier.findUniqueOrThrow({
          where: { id: rfqSupplierId },
          select: participationSelect,
        })
        return { participation: after, lines: created }
      })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictError('A current response already exists for one of these lines.')
      }
      throw error
    }
  },

  async listResponses(params: ListResponsesParams) {
    const where: Prisma.RFQSupplierResponseWhereInput = {
      organizationId: params.organizationId,
      deletedAt: null,
      ...(params.rfqItemId ? { rfqItemId: params.rfqItemId } : {}),
      ...(params.rfqSupplierId ? { rfqSupplierId: params.rfqSupplierId } : {}),
      ...(params.currentOnly ? { isCurrent: true } : {}),
    }
    const rows = await prisma.rFQSupplierResponse.findMany({
      where,
      select: responseSelect,
      orderBy: [{ price: 'asc' }, { id: 'asc' }],
      take: params.limit + 1,
      ...(params.cursor ? { cursor: { id: decodeCursor(params.cursor) }, skip: 1 } : {}),
    })
    const items = rows.slice(0, params.limit)
    const nextCursor = rows.length > params.limit ? encodeCursor(items[items.length - 1]!.id) : null
    return { items, nextCursor }
  },

  /** Cheapest current bid per line - the comparison read. */
  compareLine(organizationId: string, rfqItemId: string) {
    return prisma.rFQSupplierResponse.findMany({
      where: { organizationId, rfqItemId, isCurrent: true, deletedAt: null },
      orderBy: { price: 'asc' },
      select: {
        ...responseSelect,
        rfqSupplier: {
          select: {
            id: true,
            supplierId: true,
            isLate: true,
            supplier: { select: { supplierCode: true, companyName: true } },
          },
        },
      },
    })
  },

  /** Full bid history for one supplier/line, newest revision first. */
  priceHistory(organizationId: string, rfqSupplierId: string, rfqItemId: string) {
    return prisma.rFQSupplierResponse.findMany({
      where: { organizationId, rfqSupplierId, rfqItemId },
      orderBy: { revisionNumber: 'desc' },
      select: responseSelect,
    })
  },
}

export type RfqSupplierRepository = typeof rfqSupplierRepository
