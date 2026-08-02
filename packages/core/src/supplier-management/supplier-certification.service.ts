import { assertAbility, type AuthContext } from '@triyara/auth'
import type {
  MutationCtx,
  SupplierCertificationData,
  SupplierCertificationRecord,
  SupplierCertificationRepository,
} from '@triyara/db'
import { type EventBus, makeEvent } from '@triyara/events'
import { NotFoundError, ValidationError } from '@triyara/lib'
import type { SupplierCertificationDto, UpdateSupplierCertificationDto } from '@triyara/validation'

/**
 * Supplier certifications (TRY-BNP-SUPPLIER-CERT).
 *
 * Authorization mirrors contacts and offerings, the sibling sub-resources:
 * reading needs `read SupplierProfile`, writing needs `update SupplierProfile`,
 * so ADMIN and EXPORT_MANAGER maintain them and everyone else can look.
 */

export type SupplierCertificationCtx = AuthContext & { requestId?: string }

export interface SupplierCertificationDeps {
  repo: SupplierCertificationRepository
  events: EventBus
}

function mutationCtx(ctx: SupplierCertificationCtx): MutationCtx {
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

function toData(
  dto: SupplierCertificationDto | UpdateSupplierCertificationDto,
): Partial<SupplierCertificationData> {
  return {
    ...(dto.type !== undefined ? { type: dto.type } : {}),
    ...(dto.certificateNumber !== undefined ? { certificateNumber: dto.certificateNumber } : {}),
    ...(dto.issuedBy !== undefined ? { issuedBy: blankToNull(dto.issuedBy) } : {}),
    ...(dto.issuedDate !== undefined ? { issuedDate: dto.issuedDate ?? null } : {}),
    ...(dto.expiryDate !== undefined ? { expiryDate: dto.expiryDate ?? null } : {}),
    ...(dto.status !== undefined ? { status: dto.status } : {}),
    ...(dto.scope !== undefined ? { scope: blankToNull(dto.scope) } : {}),
  }
}

/**
 * A certificate cannot expire before it was issued. Checked against the
 * RESULT of an edit rather than the patch, so correcting one date against a
 * stored other is judged on what the row will actually say.
 */
function assertDateOrder(merged: { issuedDate?: Date | null; expiryDate?: Date | null }): void {
  const { issuedDate, expiryDate } = merged
  if (issuedDate && expiryDate && expiryDate.getTime() <= issuedDate.getTime()) {
    throw new ValidationError('The expiry date must fall after the issue date.')
  }
}

export function createSupplierCertificationService({ repo, events }: SupplierCertificationDeps) {
  return {
    async list(
      ctx: SupplierCertificationCtx,
      supplierId: string,
    ): Promise<SupplierCertificationRecord[]> {
      assertAbility(ctx, 'read', 'SupplierProfile')
      return repo.list(ctx.organizationId, supplierId)
    },

    async add(
      ctx: SupplierCertificationCtx,
      supplierId: string,
      dto: SupplierCertificationDto,
    ): Promise<SupplierCertificationRecord> {
      assertAbility(ctx, 'update', 'SupplierProfile')

      const data = toData(dto)
      assertDateOrder(data)

      const certification = await repo.create(mutationCtx(ctx), supplierId, {
        ...data,
        type: dto.type,
        certificateNumber: dto.certificateNumber,
      })

      await events.emit(
        makeEvent({
          type: 'supplier.certification_added',
          organizationId: ctx.organizationId,
          actorId: ctx.user.id,
          data: {
            supplierId,
            certificationId: certification.id,
            certificationType: certification.type,
          },
        }),
      )

      return certification
    },

    async update(
      ctx: SupplierCertificationCtx,
      supplierId: string,
      id: string,
      expectedVersion: number,
      dto: UpdateSupplierCertificationDto,
    ): Promise<SupplierCertificationRecord> {
      assertAbility(ctx, 'update', 'SupplierProfile')

      const existing = await repo.findById(ctx.organizationId, supplierId, id)
      if (!existing) throw new NotFoundError('Certification not found.')

      const patch = toData(dto)
      assertDateOrder({
        issuedDate: patch.issuedDate !== undefined ? patch.issuedDate : existing.issuedDate,
        expiryDate: patch.expiryDate !== undefined ? patch.expiryDate : existing.expiryDate,
      })

      const certification = await repo.update(
        mutationCtx(ctx),
        supplierId,
        id,
        expectedVersion,
        patch,
      )

      await events.emit(
        makeEvent({
          type: 'supplier.certification_updated',
          organizationId: ctx.organizationId,
          actorId: ctx.user.id,
          data: { supplierId, certificationId: id, status: certification.status },
        }),
      )

      return certification
    },

    async remove(
      ctx: SupplierCertificationCtx,
      supplierId: string,
      id: string,
      expectedVersion: number,
    ): Promise<SupplierCertificationRecord> {
      assertAbility(ctx, 'update', 'SupplierProfile')

      const certification = await repo.remove(mutationCtx(ctx), supplierId, id, expectedVersion)

      await events.emit(
        makeEvent({
          type: 'supplier.certification_removed',
          organizationId: ctx.organizationId,
          actorId: ctx.user.id,
          data: { supplierId, certificationId: id },
        }),
      )

      return certification
    },
  }
}

export type SupplierCertificationService = ReturnType<typeof createSupplierCertificationService>
