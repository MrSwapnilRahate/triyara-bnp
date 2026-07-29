import { type Incoterm, Prisma, type SupplierProductStatus } from '@prisma/client'
import { ConflictError, NotFoundError, PreconditionFailedError } from '@triyara/lib'

import { writeAudit } from '../audit'
import { prisma } from '../client'
import { decodeCursor, encodeCursor, type MutationCtx } from './account.repository'

// Supplier x catalog Product offerings (TRY-BNP-SUPPLIER-02). This is the bridge
// between the vendor master and the Product Catalog, and the table the sourcing
// question - "who can supply product X, and on what terms?" - is answered from.

const offeringSelect = {
  id: true,
  supplierId: true,
  organizationId: true,
  productId: true,
  supplierSku: true,
  moq: true,
  moqUnit: true,
  leadTimeDays: true,
  isPreferred: true,
  price: true,
  currency: true,
  incoterm: true,
  port: true,
  validFrom: true,
  validTo: true,
  status: true,
  notes: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  product: { select: { id: true, sku: true, name: true, slug: true } },
  supplier: { select: { id: true, supplierCode: true, companyName: true, status: true } },
} satisfies Prisma.SupplierProductOfferingSelect

export type OfferingRecord = Prisma.SupplierProductOfferingGetPayload<{
  select: typeof offeringSelect
}>

export interface UpsertOfferingData {
  productId: string
  supplierSku?: string
  moq?: number
  moqUnit?: string
  leadTimeDays?: number
  isPreferred?: boolean
  price?: number
  currency?: string
  incoterm?: Incoterm
  port?: string
  validFrom?: Date
  validTo?: Date
  status?: SupplierProductStatus
  notes?: string
}

export interface ListOfferingsParams {
  organizationId: string
  supplierId?: string
  productId?: string
  status?: SupplierProductStatus
  isPreferred?: boolean
  limit: number
  cursor?: string
}

export interface OfferingListResult {
  items: OfferingRecord[]
  nextCursor: string | null
}

export const supplierOfferingRepository = {
  async create(
    ctx: MutationCtx,
    supplierId: string,
    data: UpsertOfferingData,
  ): Promise<OfferingRecord> {
    try {
      return await prisma.$transaction(async (tx) => {
        const supplier = await tx.supplier.findFirst({
          where: { id: supplierId, organizationId: ctx.organizationId, deletedAt: null },
          select: { id: true },
        })
        if (!supplier) throw new NotFoundError('Supplier not found.')

        const product = await tx.product.findFirst({
          where: { id: data.productId, organizationId: ctx.organizationId, deletedAt: null },
          select: { id: true },
        })
        if (!product) throw new NotFoundError('Product not found.')

        const offering = await tx.supplierProductOffering.create({
          data: { supplierId, organizationId: ctx.organizationId, ...data },
          select: offeringSelect,
        })

        await writeAudit(tx, {
          organizationId: ctx.organizationId,
          actorId: ctx.actorId,
          requestId: ctx.requestId,
          entityType: 'SupplierProductOffering',
          entityId: offering.id,
          action: 'supplier.offering_added',
          after: { supplierId, productId: data.productId },
        })

        return offering
      })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictError(
          'This supplier already offers that product on those exact terms (incoterm, port and currency).',
        )
      }
      throw error
    }
  },

  findById(organizationId: string, id: string): Promise<OfferingRecord | null> {
    return prisma.supplierProductOffering.findFirst({
      where: { id, organizationId, deletedAt: null },
      select: offeringSelect,
    })
  },

  async list(params: ListOfferingsParams): Promise<OfferingListResult> {
    const where: Prisma.SupplierProductOfferingWhereInput = {
      organizationId: params.organizationId,
      deletedAt: null,
      ...(params.supplierId ? { supplierId: params.supplierId } : {}),
      ...(params.productId ? { productId: params.productId } : {}),
      ...(params.status ? { status: params.status } : {}),
      ...(params.isPreferred === undefined ? {} : { isPreferred: params.isPreferred }),
    }

    const rows = await prisma.supplierProductOffering.findMany({
      where,
      select: offeringSelect,
      // Preferred first, then cheapest - the shortlist order.
      orderBy: [{ isPreferred: 'desc' }, { price: 'asc' }, { id: 'asc' }],
      take: params.limit + 1,
      ...(params.cursor ? { cursor: { id: decodeCursor(params.cursor) }, skip: 1 } : {}),
    })

    const items = rows.slice(0, params.limit)
    const nextCursor = rows.length > params.limit ? encodeCursor(items[items.length - 1]!.id) : null
    return { items, nextCursor }
  },

  /** Approved suppliers able to supply a product, cheapest first. */
  findSuppliersForProduct(organizationId: string, productId: string, limit = 25) {
    return prisma.supplierProductOffering.findMany({
      where: {
        organizationId,
        productId,
        deletedAt: null,
        status: 'ACTIVE',
        supplier: { status: 'APPROVED', deletedAt: null },
      },
      orderBy: [{ isPreferred: 'desc' }, { price: 'asc' }],
      take: limit,
      select: offeringSelect,
    })
  },

  async mutate(
    ctx: MutationCtx,
    id: string,
    expectedVersion: number,
    data: Partial<UpsertOfferingData>,
  ): Promise<OfferingRecord> {
    try {
      return await prisma.$transaction(async (tx) => {
        const before = await tx.supplierProductOffering.findFirst({
          where: { id, organizationId: ctx.organizationId, deletedAt: null },
          select: offeringSelect,
        })
        if (!before) throw new NotFoundError('Offering not found.')

        const updated = await tx.supplierProductOffering.updateMany({
          where: {
            id,
            organizationId: ctx.organizationId,
            deletedAt: null,
            version: expectedVersion,
          },
          data: { ...data, version: { increment: 1 } },
        })
        if (updated.count === 0) throw new PreconditionFailedError()

        const after = await tx.supplierProductOffering.findUniqueOrThrow({
          where: { id },
          select: offeringSelect,
        })
        await writeAudit(tx, {
          organizationId: ctx.organizationId,
          actorId: ctx.actorId,
          requestId: ctx.requestId,
          entityType: 'SupplierProductOffering',
          entityId: id,
          action: 'supplier.offering_updated',
          before: { price: before.price, status: before.status },
          after: { price: after.price, status: after.status },
        })
        return after
      })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictError('Those offering terms clash with an existing one.')
      }
      throw error
    }
  },

  async softDelete(ctx: MutationCtx, id: string, expectedVersion: number): Promise<OfferingRecord> {
    return prisma.$transaction(async (tx) => {
      const updated = await tx.supplierProductOffering.updateMany({
        where: {
          id,
          organizationId: ctx.organizationId,
          deletedAt: null,
          version: expectedVersion,
        },
        data: { deletedAt: new Date(), status: 'INACTIVE', version: { increment: 1 } },
      })
      if (updated.count === 0) throw new PreconditionFailedError()

      const after = await tx.supplierProductOffering.findUniqueOrThrow({
        where: { id },
        select: offeringSelect,
      })
      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.actorId,
        requestId: ctx.requestId,
        entityType: 'SupplierProductOffering',
        entityId: id,
        action: 'supplier.offering_removed',
        after: { deletedAt: after.deletedAt },
      })
      return after
    })
  },
}

export type SupplierOfferingRepository = typeof supplierOfferingRepository
