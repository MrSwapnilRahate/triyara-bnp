import { assertAbility, type AuthContext } from '@triyara/auth'
import type {
  MutationCtx,
  SupplierContactData,
  SupplierContactRecord,
  SupplierContactRepository,
} from '@triyara/db'
import { type EventBus, makeEvent } from '@triyara/events'
import { NotFoundError, ValidationError } from '@triyara/lib'
import type { SupplierContactDto, UpdateSupplierContactDto } from '@triyara/validation'

/**
 * Supplier contacts (TRY-BNP-SUPPLIER-CONTACT).
 *
 * The people at a supplier: who to ring, who quotes, who sends the documents.
 * Authorization mirrors offerings, which is the neighbouring sub-resource -
 * reading needs `read SupplierProfile`, writing needs `update SupplierProfile`,
 * so ADMIN and EXPORT_MANAGER maintain them and everyone else can look.
 *
 * "Exactly one primary" is enforced in the repository transaction rather than
 * here: it is a property of the set, and a check-then-write in a service would
 * let two concurrent promotions both pass.
 */

export type SupplierContactCtx = AuthContext & { requestId?: string }

export interface SupplierContactDeps {
  repo: SupplierContactRepository
  events: EventBus
}

function mutationCtx(ctx: SupplierContactCtx): MutationCtx {
  return { actorId: ctx.user.id, organizationId: ctx.organizationId, requestId: ctx.requestId }
}

/**
 * An empty optional string means "clear this", which is a different
 * instruction from omitting the field. Zod leaves `''` intact, so the mapping
 * to null happens once, here, instead of in every caller.
 */
function blankToNull(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined
  return value.trim() === '' ? null : value
}

function toData(dto: SupplierContactDto | UpdateSupplierContactDto): Partial<SupplierContactData> {
  return {
    ...(dto.name !== undefined ? { name: dto.name } : {}),
    ...(dto.role !== undefined ? { role: dto.role } : {}),
    ...(dto.designation !== undefined ? { designation: blankToNull(dto.designation) } : {}),
    ...(dto.email !== undefined ? { email: blankToNull(dto.email) } : {}),
    ...(dto.phone !== undefined ? { phone: blankToNull(dto.phone) } : {}),
    ...(dto.whatsapp !== undefined ? { whatsapp: blankToNull(dto.whatsapp) } : {}),
    ...(dto.isPrimary !== undefined ? { isPrimary: dto.isPrimary } : {}),
    ...(dto.notes !== undefined ? { notes: blankToNull(dto.notes) } : {}),
  }
}

/**
 * A contact nobody can reach is a row, not a contact. At least one of email,
 * phone or WhatsApp must be present - the whole point of the record is to stop
 * someone going back to the chat history for a number.
 */
function assertReachable(merged: {
  email?: string | null
  phone?: string | null
  whatsapp?: string | null
}): void {
  if (!merged.email && !merged.phone && !merged.whatsapp) {
    throw new ValidationError('Give at least one of email, phone or WhatsApp.')
  }
}

export function createSupplierContactService({ repo, events }: SupplierContactDeps) {
  return {
    async list(ctx: SupplierContactCtx, supplierId: string): Promise<SupplierContactRecord[]> {
      assertAbility(ctx, 'read', 'SupplierProfile')
      return repo.list(ctx.organizationId, supplierId)
    },

    async add(
      ctx: SupplierContactCtx,
      supplierId: string,
      dto: SupplierContactDto,
    ): Promise<SupplierContactRecord> {
      assertAbility(ctx, 'update', 'SupplierProfile')

      const data = toData(dto)
      assertReachable(data)

      const contact = await repo.create(mutationCtx(ctx), supplierId, {
        ...data,
        name: dto.name,
      })

      await events.emit(
        makeEvent({
          type: 'supplier.contact_added',
          organizationId: ctx.organizationId,
          actorId: ctx.user.id,
          data: { supplierId, contactId: contact.id, isPrimary: contact.isPrimary },
        }),
      )

      return contact
    },

    async update(
      ctx: SupplierContactCtx,
      supplierId: string,
      id: string,
      expectedVersion: number,
      dto: UpdateSupplierContactDto,
    ): Promise<SupplierContactRecord> {
      assertAbility(ctx, 'update', 'SupplierProfile')

      const existing = await repo.findById(ctx.organizationId, supplierId, id)
      if (!existing) throw new NotFoundError('Contact not found.')

      const patch = toData(dto)
      // Reachability is checked against the RESULT, not the patch: clearing a
      // phone number is fine when an email remains, and not fine when it does
      // not. Checking the patch alone would allow the last one to be removed.
      assertReachable({
        email: patch.email !== undefined ? patch.email : existing.email,
        phone: patch.phone !== undefined ? patch.phone : existing.phone,
        whatsapp: patch.whatsapp !== undefined ? patch.whatsapp : existing.whatsapp,
      })

      const contact = await repo.update(mutationCtx(ctx), supplierId, id, expectedVersion, patch)

      await events.emit(
        makeEvent({
          type: 'supplier.contact_updated',
          organizationId: ctx.organizationId,
          actorId: ctx.user.id,
          data: { supplierId, contactId: id, isPrimary: contact.isPrimary },
        }),
      )

      return contact
    },

    async remove(
      ctx: SupplierContactCtx,
      supplierId: string,
      id: string,
      expectedVersion: number,
    ): Promise<SupplierContactRecord> {
      assertAbility(ctx, 'update', 'SupplierProfile')

      const contact = await repo.remove(mutationCtx(ctx), supplierId, id, expectedVersion)

      await events.emit(
        makeEvent({
          type: 'supplier.contact_removed',
          organizationId: ctx.organizationId,
          actorId: ctx.user.id,
          data: { supplierId, contactId: id },
        }),
      )

      return contact
    },
  }
}

export type SupplierContactService = ReturnType<typeof createSupplierContactService>
