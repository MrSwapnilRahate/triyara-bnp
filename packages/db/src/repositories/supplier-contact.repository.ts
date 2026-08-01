import type { Prisma } from '@prisma/client'
import { NotFoundError, PreconditionFailedError } from '@triyara/lib'

import { writeAudit } from '../audit'
import { prisma } from '../client'
import type { MutationCtx } from './account.repository'

/**
 * Supplier contacts (TRY-BNP-SUPPLIER-CONTACT).
 *
 * The people you actually talk to at a supplier - the reason a sourcing desk
 * can stop reading back through chat history to find a phone number.
 *
 * Sits beside `supplierRepository.replaceContacts`, which is unchanged. That
 * one replaces the whole set in a single write and suits an import; these are
 * the granular operations a person performs one contact at a time. Both write
 * the same table and both audit.
 *
 * Every query joins through `supplier` for the organization check rather than
 * trusting `SupplierContact.organizationId` alone: the contact carries a
 * denormalised copy, and a row whose copy disagreed with its parent would
 * otherwise be reachable from the wrong tenant.
 */

const contactSelect = {
  id: true,
  supplierId: true,
  name: true,
  role: true,
  designation: true,
  email: true,
  phone: true,
  whatsapp: true,
  isPrimary: true,
  sortOrder: true,
  notes: true,
  version: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.SupplierContactSelect

export type SupplierContactRecord = Prisma.SupplierContactGetPayload<{
  select: typeof contactSelect
}>

export interface SupplierContactData {
  name: string
  role?: Prisma.SupplierContactCreateInput['role']
  designation?: string | null
  email?: string | null
  phone?: string | null
  whatsapp?: string | null
  isPrimary?: boolean
  notes?: string | null
}

/**
 * Demotes every other contact of this supplier.
 *
 * Called BEFORE the write that claims primary, not after. The database already
 * guarantees the invariant with a partial unique index -
 * `SupplierContact_one_primary ON ("supplierId") WHERE isPrimary AND deletedAt
 * IS NULL` - so a second primary fails at INSERT time and demoting afterwards
 * never gets the chance to run. Clearing the seat first is what lets the write
 * land, and the constraint remains the thing that makes it true.
 */
async function demoteOthers(
  tx: Prisma.TransactionClient,
  supplierId: string,
  keepId: string | null,
): Promise<void> {
  await tx.supplierContact.updateMany({
    where: {
      supplierId,
      deletedAt: null,
      isPrimary: true,
      ...(keepId ? { id: { not: keepId } } : {}),
    },
    data: { isPrimary: false, version: { increment: 1 } },
  })
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

export const supplierContactRepository = {
  /**
   * The supplier's contacts. Primary first, then the caller's chosen order,
   * then newest - so the person to ring is always the first row.
   */
  async list(organizationId: string, supplierId: string): Promise<SupplierContactRecord[]> {
    return prisma.supplierContact.findMany({
      where: {
        supplierId,
        deletedAt: null,
        supplier: { organizationId, deletedAt: null },
      },
      select: contactSelect,
      orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    })
  },

  async findById(
    organizationId: string,
    supplierId: string,
    id: string,
  ): Promise<SupplierContactRecord | null> {
    return prisma.supplierContact.findFirst({
      where: { id, supplierId, deletedAt: null, supplier: { organizationId } },
      select: contactSelect,
    })
  },

  async create(
    ctx: MutationCtx,
    supplierId: string,
    data: SupplierContactData,
  ): Promise<SupplierContactRecord> {
    return prisma.$transaction(async (tx) => {
      await requireSupplier(tx, ctx.organizationId, supplierId)

      // Appended to the end of the list; the order is the desk's, not ours.
      const last = await tx.supplierContact.findFirst({
        where: { supplierId, deletedAt: null },
        select: { sortOrder: true },
        orderBy: { sortOrder: 'desc' },
      })

      // The seat has to be free before we take it; see demoteOthers.
      if (data.isPrimary) await demoteOthers(tx, supplierId, null)

      const created = await tx.supplierContact.create({
        data: {
          supplierId,
          organizationId: ctx.organizationId,
          name: data.name,
          ...(data.role ? { role: data.role } : {}),
          designation: data.designation ?? null,
          email: data.email ?? null,
          phone: data.phone ?? null,
          whatsapp: data.whatsapp ?? null,
          isPrimary: data.isPrimary ?? false,
          notes: data.notes ?? null,
          sortOrder: (last?.sortOrder ?? 0) + 10,
        },
        select: contactSelect,
      })

      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.actorId,
        requestId: ctx.requestId,
        entityType: 'Supplier',
        // Recorded against the supplier, not the contact: an investigator asks
        // "what changed about this supplier", and the contact id means nothing
        // on its own.
        entityId: supplierId,
        action: 'supplier.contact_added',
        after: { contactId: created.id, name: created.name, isPrimary: created.isPrimary },
      })

      return created
    })
  },

  /**
   * Updates one contact under optimistic concurrency.
   *
   * `version` is checked in the WHERE clause rather than compared after a read,
   * so a concurrent edit loses the race in the database instead of overwriting.
   */
  async update(
    ctx: MutationCtx,
    supplierId: string,
    id: string,
    expectedVersion: number,
    data: Partial<SupplierContactData>,
  ): Promise<SupplierContactRecord> {
    return prisma.$transaction(async (tx) => {
      await requireSupplier(tx, ctx.organizationId, supplierId)

      const before = await tx.supplierContact.findFirst({
        where: { id, supplierId, deletedAt: null },
        select: contactSelect,
      })
      if (!before) throw new NotFoundError('Contact not found.')

      if (data.isPrimary === true) await demoteOthers(tx, supplierId, id)

      const updated = await tx.supplierContact.updateMany({
        where: { id, supplierId, deletedAt: null, version: expectedVersion },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.role !== undefined ? { role: data.role } : {}),
          ...(data.designation !== undefined ? { designation: data.designation } : {}),
          ...(data.email !== undefined ? { email: data.email } : {}),
          ...(data.phone !== undefined ? { phone: data.phone } : {}),
          ...(data.whatsapp !== undefined ? { whatsapp: data.whatsapp } : {}),
          ...(data.isPrimary !== undefined ? { isPrimary: data.isPrimary } : {}),
          ...(data.notes !== undefined ? { notes: data.notes } : {}),
          version: { increment: 1 },
        },
      })
      if (updated.count === 0) throw new PreconditionFailedError()

      const after = await tx.supplierContact.findUniqueOrThrow({
        where: { id },
        select: contactSelect,
      })

      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.actorId,
        requestId: ctx.requestId,
        entityType: 'Supplier',
        entityId: supplierId,
        action: 'supplier.contact_updated',
        before: { contactId: before.id, name: before.name, isPrimary: before.isPrimary },
        after: { contactId: after.id, name: after.name, isPrimary: after.isPrimary },
      })

      return after
    })
  },

  /**
   * Soft-deletes a contact. The row is kept because an audit entry naming a
   * contact that no longer exists anywhere is not much of a record.
   */
  async remove(
    ctx: MutationCtx,
    supplierId: string,
    id: string,
    expectedVersion: number,
  ): Promise<SupplierContactRecord> {
    return prisma.$transaction(async (tx) => {
      await requireSupplier(tx, ctx.organizationId, supplierId)

      const before = await tx.supplierContact.findFirst({
        where: { id, supplierId, deletedAt: null },
        select: contactSelect,
      })
      if (!before) throw new NotFoundError('Contact not found.')

      const deleted = await tx.supplierContact.updateMany({
        where: { id, supplierId, deletedAt: null, version: expectedVersion },
        data: { deletedAt: new Date(), isPrimary: false, version: { increment: 1 } },
      })
      if (deleted.count === 0) throw new PreconditionFailedError()

      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.actorId,
        requestId: ctx.requestId,
        entityType: 'Supplier',
        entityId: supplierId,
        action: 'supplier.contact_removed',
        before: { contactId: before.id, name: before.name, isPrimary: before.isPrimary },
      })

      return tx.supplierContact.findUniqueOrThrow({ where: { id }, select: contactSelect })
    })
  },
}

export type SupplierContactRepository = typeof supplierContactRepository
