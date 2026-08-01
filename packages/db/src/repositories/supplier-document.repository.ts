import type { Prisma } from '@prisma/client'
import { NotFoundError, PreconditionFailedError } from '@triyara/lib'

import { writeAudit } from '../audit'
import { prisma } from '../client'
import type { MutationCtx } from './account.repository'

/**
 * Supplier documents (TRY-BNP-SUPPLIER-DOC).
 *
 * The file a supplier actually sends: a company profile, a catalogue, a GST or
 * IEC scan, factory photographs. `SupplierDocument` hangs off `Supplier`
 * directly, so a supplier created in thirty seconds from a WhatsApp message can
 * hold its paperwork without an Account being invented for it first.
 *
 * Distinct from the FROZEN `Document` module, which is Account-scoped and
 * versioned. `documentId` on this model is the seam between them, populated
 * only when a file is also promoted into that module - nothing here writes it.
 *
 * Every query joins through `supplier` for the organization check rather than
 * trusting the denormalised `organizationId` alone: a row whose copy disagreed
 * with its parent would otherwise be reachable from the wrong tenant.
 */

const documentSelect = {
  id: true,
  supplierId: true,
  type: true,
  title: true,
  fileUrl: true,
  storageKey: true,
  mimeType: true,
  fileSize: true,
  checksum: true,
  documentNumber: true,
  issuedDate: true,
  expiryDate: true,
  documentId: true,
  version: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.SupplierDocumentSelect

export type SupplierDocumentRecord = Prisma.SupplierDocumentGetPayload<{
  select: typeof documentSelect
}>

export interface SupplierDocumentData {
  type: Prisma.SupplierDocumentCreateInput['type']
  title?: string | null
  storageKey?: string | null
  mimeType?: string | null
  fileSize?: number | null
  checksum?: string | null
  documentNumber?: string | null
  issuedDate?: Date | null
  expiryDate?: Date | null
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

export const supplierDocumentRepository = {
  /**
   * Confirms the supplier is visible to this organization.
   *
   * Public because the service must establish visibility BEFORE it touches
   * storage: otherwise a caller learns whether an object exists under a
   * supplier they are not allowed to see, and the 422 arrives instead of the
   * 404 that would have told them nothing.
   */
  async assertVisible(organizationId: string, supplierId: string): Promise<void> {
    const supplier = await prisma.supplier.findFirst({
      where: { id: supplierId, organizationId, deletedAt: null },
      select: { id: true },
    })
    if (!supplier) throw new NotFoundError('Supplier not found.')
  },

  /** Newest first: the paperwork someone just sent is what they are looking for. */
  async list(organizationId: string, supplierId: string): Promise<SupplierDocumentRecord[]> {
    return prisma.supplierDocument.findMany({
      where: {
        supplierId,
        deletedAt: null,
        supplier: { organizationId, deletedAt: null },
      },
      select: documentSelect,
      orderBy: [{ createdAt: 'desc' }],
    })
  },

  async findById(
    organizationId: string,
    supplierId: string,
    id: string,
  ): Promise<SupplierDocumentRecord | null> {
    return prisma.supplierDocument.findFirst({
      where: { id, supplierId, deletedAt: null, supplier: { organizationId } },
      select: documentSelect,
    })
  },

  async create(
    ctx: MutationCtx,
    supplierId: string,
    data: SupplierDocumentData,
  ): Promise<SupplierDocumentRecord> {
    return prisma.$transaction(async (tx) => {
      await requireSupplier(tx, ctx.organizationId, supplierId)

      const created = await tx.supplierDocument.create({
        data: {
          supplierId,
          organizationId: ctx.organizationId,
          type: data.type,
          title: data.title ?? null,
          storageKey: data.storageKey ?? null,
          mimeType: data.mimeType ?? null,
          fileSize: data.fileSize ?? null,
          checksum: data.checksum ?? null,
          documentNumber: data.documentNumber ?? null,
          issuedDate: data.issuedDate ?? null,
          expiryDate: data.expiryDate ?? null,
        },
        select: documentSelect,
      })

      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.actorId,
        requestId: ctx.requestId,
        entityType: 'Supplier',
        // Recorded against the supplier: an investigator asks what changed
        // about this supplier, and the document id means nothing alone.
        entityId: supplierId,
        action: 'supplier.document_added',
        after: {
          documentId: created.id,
          type: created.type,
          title: created.title,
          fileSize: created.fileSize,
        },
      })

      return created
    })
  },

  /**
   * Updates metadata, or replaces the file behind the record.
   *
   * A replacement is an ordinary update carrying a new `storageKey`: the row
   * keeps its identity and its place in the list, which is what someone means
   * by "they sent a newer catalogue". Version history belongs to the frozen
   * Document module; this model has none and does not pretend to.
   */
  async update(
    ctx: MutationCtx,
    supplierId: string,
    id: string,
    expectedVersion: number,
    data: Partial<SupplierDocumentData>,
  ): Promise<SupplierDocumentRecord> {
    return prisma.$transaction(async (tx) => {
      await requireSupplier(tx, ctx.organizationId, supplierId)

      const before = await tx.supplierDocument.findFirst({
        where: { id, supplierId, deletedAt: null },
        select: documentSelect,
      })
      if (!before) throw new NotFoundError('Document not found.')

      const updated = await tx.supplierDocument.updateMany({
        where: { id, supplierId, deletedAt: null, version: expectedVersion },
        data: {
          ...(data.type !== undefined ? { type: data.type } : {}),
          ...(data.title !== undefined ? { title: data.title } : {}),
          ...(data.storageKey !== undefined ? { storageKey: data.storageKey } : {}),
          ...(data.mimeType !== undefined ? { mimeType: data.mimeType } : {}),
          ...(data.fileSize !== undefined ? { fileSize: data.fileSize } : {}),
          ...(data.checksum !== undefined ? { checksum: data.checksum } : {}),
          ...(data.documentNumber !== undefined ? { documentNumber: data.documentNumber } : {}),
          ...(data.issuedDate !== undefined ? { issuedDate: data.issuedDate } : {}),
          ...(data.expiryDate !== undefined ? { expiryDate: data.expiryDate } : {}),
          version: { increment: 1 },
        },
      })
      if (updated.count === 0) throw new PreconditionFailedError()

      const after = await tx.supplierDocument.findUniqueOrThrow({
        where: { id },
        select: documentSelect,
      })

      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.actorId,
        requestId: ctx.requestId,
        entityType: 'Supplier',
        entityId: supplierId,
        // A file swap and a title correction are different events to whoever
        // reads the trail later, so they are named differently.
        action:
          data.storageKey !== undefined
            ? 'supplier.document_replaced'
            : 'supplier.document_updated',
        before: { documentId: before.id, type: before.type, storageKey: before.storageKey },
        after: { documentId: after.id, type: after.type, storageKey: after.storageKey },
      })

      return after
    })
  },

  /**
   * Soft-deletes. The stored object is left in place: the audit row names this
   * document, and a trail pointing at bytes somebody already erased is not
   * much of a record. Reaping orphaned objects is a storage concern.
   */
  async remove(
    ctx: MutationCtx,
    supplierId: string,
    id: string,
    expectedVersion: number,
  ): Promise<SupplierDocumentRecord> {
    return prisma.$transaction(async (tx) => {
      await requireSupplier(tx, ctx.organizationId, supplierId)

      const before = await tx.supplierDocument.findFirst({
        where: { id, supplierId, deletedAt: null },
        select: documentSelect,
      })
      if (!before) throw new NotFoundError('Document not found.')

      const deleted = await tx.supplierDocument.updateMany({
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
        action: 'supplier.document_removed',
        before: { documentId: before.id, type: before.type, title: before.title },
      })

      return tx.supplierDocument.findUniqueOrThrow({ where: { id }, select: documentSelect })
    })
  },
}

export type SupplierDocumentRepository = typeof supplierDocumentRepository
