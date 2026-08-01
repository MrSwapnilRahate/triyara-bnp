import type { Prisma } from '@prisma/client'
import { NotFoundError, PreconditionFailedError } from '@triyara/lib'

import { writeAudit } from '../audit'
import { prisma } from '../client'
import type { MutationCtx } from './account.repository'

/**
 * Supplier certifications (TRY-BNP-SUPPLIER-CERT).
 *
 * The evidence behind the word "verified". A sourcing desk filters on FSSAI,
 * HACCP or organic before it shows a supplier to a buyer, and until these rows
 * can be entered that filter is answering from an empty table.
 *
 * Every query joins through `supplier` for the organization check rather than
 * trusting `SupplierCertification.organizationId` alone: the certification
 * carries a denormalised copy, and a row whose copy disagreed with its parent
 * would otherwise be reachable from the wrong tenant.
 *
 * Unlike contacts there is no partial unique index here - a supplier may
 * legitimately hold two ISO certificates covering different units, so
 * `(supplierId, type)` is an ordinary index and duplicates are the desk's
 * business, not the database's.
 */

const certificationSelect = {
  id: true,
  supplierId: true,
  type: true,
  certificateNumber: true,
  issuedBy: true,
  issuedDate: true,
  expiryDate: true,
  status: true,
  scope: true,
  supplierDocumentId: true,
  version: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.SupplierCertificationSelect

export type SupplierCertificationRecord = Prisma.SupplierCertificationGetPayload<{
  select: typeof certificationSelect
}>

export interface SupplierCertificationData {
  type: Prisma.SupplierCertificationCreateInput['type']
  certificateNumber: string
  issuedBy?: string | null
  issuedDate?: Date | null
  expiryDate?: Date | null
  status?: Prisma.SupplierCertificationCreateInput['status']
  scope?: string | null
}

/** Throws unless the supplier exists in this organization and is not deleted. */
async function requireSupplier(
  tx: Prisma.TransactionClient,
  organizationId: string,
  supplierId: string,
): Promise<void> {
  const supplier = await tx.supplier.findFirst({
    where: { id: supplierId, organizationId, deletedAt: null },
    select: { id: true },
  })
  if (!supplier) throw new NotFoundError('Supplier not found.')
}

export const supplierCertificationRepository = {
  /**
   * The supplier's certifications, soonest expiry first.
   *
   * That order is the compliance question: what lapses next. Rows without an
   * expiry sort last rather than first, because a certificate with no stated
   * end date is the least urgent thing on the list, not the most.
   */
  async list(organizationId: string, supplierId: string): Promise<SupplierCertificationRecord[]> {
    return prisma.supplierCertification.findMany({
      where: {
        supplierId,
        deletedAt: null,
        supplier: { organizationId, deletedAt: null },
      },
      select: certificationSelect,
      orderBy: [{ expiryDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
    })
  },

  async findById(
    organizationId: string,
    supplierId: string,
    id: string,
  ): Promise<SupplierCertificationRecord | null> {
    return prisma.supplierCertification.findFirst({
      where: { id, supplierId, deletedAt: null, supplier: { organizationId } },
      select: certificationSelect,
    })
  },

  async create(
    ctx: MutationCtx,
    supplierId: string,
    data: SupplierCertificationData,
  ): Promise<SupplierCertificationRecord> {
    return prisma.$transaction(async (tx) => {
      await requireSupplier(tx, ctx.organizationId, supplierId)

      const created = await tx.supplierCertification.create({
        data: {
          supplierId,
          organizationId: ctx.organizationId,
          type: data.type,
          certificateNumber: data.certificateNumber,
          issuedBy: data.issuedBy ?? null,
          issuedDate: data.issuedDate ?? null,
          expiryDate: data.expiryDate ?? null,
          ...(data.status ? { status: data.status } : {}),
          scope: data.scope ?? null,
        },
        select: certificationSelect,
      })

      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.actorId,
        requestId: ctx.requestId,
        entityType: 'Supplier',
        // Recorded against the supplier: an investigator asks what changed
        // about this supplier, and the certification id means nothing alone.
        entityId: supplierId,
        action: 'supplier.certification_added',
        after: {
          certificationId: created.id,
          type: created.type,
          certificateNumber: created.certificateNumber,
          expiryDate: created.expiryDate,
        },
      })

      return created
    })
  },

  /**
   * Updates one certification under optimistic concurrency. `version` is
   * checked in the WHERE clause rather than compared after a read, so a
   * concurrent edit loses the race in the database instead of overwriting.
   */
  async update(
    ctx: MutationCtx,
    supplierId: string,
    id: string,
    expectedVersion: number,
    data: Partial<SupplierCertificationData>,
  ): Promise<SupplierCertificationRecord> {
    return prisma.$transaction(async (tx) => {
      await requireSupplier(tx, ctx.organizationId, supplierId)

      const before = await tx.supplierCertification.findFirst({
        where: { id, supplierId, deletedAt: null },
        select: certificationSelect,
      })
      if (!before) throw new NotFoundError('Certification not found.')

      const updated = await tx.supplierCertification.updateMany({
        where: { id, supplierId, deletedAt: null, version: expectedVersion },
        data: {
          ...(data.type !== undefined ? { type: data.type } : {}),
          ...(data.certificateNumber !== undefined
            ? { certificateNumber: data.certificateNumber }
            : {}),
          ...(data.issuedBy !== undefined ? { issuedBy: data.issuedBy } : {}),
          ...(data.issuedDate !== undefined ? { issuedDate: data.issuedDate } : {}),
          ...(data.expiryDate !== undefined ? { expiryDate: data.expiryDate } : {}),
          ...(data.status !== undefined ? { status: data.status } : {}),
          ...(data.scope !== undefined ? { scope: data.scope } : {}),
          version: { increment: 1 },
        },
      })
      if (updated.count === 0) throw new PreconditionFailedError()

      const after = await tx.supplierCertification.findUniqueOrThrow({
        where: { id },
        select: certificationSelect,
      })

      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.actorId,
        requestId: ctx.requestId,
        entityType: 'Supplier',
        entityId: supplierId,
        action: 'supplier.certification_updated',
        before: {
          certificationId: before.id,
          type: before.type,
          certificateNumber: before.certificateNumber,
          status: before.status,
          expiryDate: before.expiryDate,
        },
        after: {
          certificationId: after.id,
          type: after.type,
          certificateNumber: after.certificateNumber,
          status: after.status,
          expiryDate: after.expiryDate,
        },
      })

      return after
    })
  },

  /**
   * Soft-deletes a certification. Kept rather than removed because an expired
   * certificate is part of a supplier's compliance history, and the audit row
   * that records its removal names it.
   */
  async remove(
    ctx: MutationCtx,
    supplierId: string,
    id: string,
    expectedVersion: number,
  ): Promise<SupplierCertificationRecord> {
    return prisma.$transaction(async (tx) => {
      await requireSupplier(tx, ctx.organizationId, supplierId)

      const before = await tx.supplierCertification.findFirst({
        where: { id, supplierId, deletedAt: null },
        select: certificationSelect,
      })
      if (!before) throw new NotFoundError('Certification not found.')

      const deleted = await tx.supplierCertification.updateMany({
        where: { id, supplierId, deletedAt: null, version: expectedVersion },
        data: { deletedAt: new Date(), version: { increment: 1 } },
      })
      if (deleted.count === 0) throw new PreconditionFailedError()

      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.actorId,
        requestId: ctx.requestId,
        entityType: 'Supplier',
        entityId: supplierId,
        action: 'supplier.certification_removed',
        before: {
          certificationId: before.id,
          type: before.type,
          certificateNumber: before.certificateNumber,
        },
      })

      return tx.supplierCertification.findUniqueOrThrow({
        where: { id },
        select: certificationSelect,
      })
    })
  },
}

export type SupplierCertificationRepository = typeof supplierCertificationRepository
