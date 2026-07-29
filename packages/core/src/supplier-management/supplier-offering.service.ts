import { assertAbility, type AuthContext } from '@triyara/auth'
import type {
  MutationCtx,
  OfferingListResult,
  OfferingRecord,
  SupplierOfferingRepository,
  UpsertOfferingData,
} from '@triyara/db'
import { type EventBus, makeEvent } from '@triyara/events'
import { NotFoundError, ValidationError } from '@triyara/lib'
import type { ListOfferingsQuery, SupplierOfferingDto } from '@triyara/validation'

// Supplier x Product offerings (TRY-BNP-SUPPLIER-02). The bridge to the Product
// Catalog; the catalog itself is never modified.

export type OfferingServiceCtx = AuthContext & { requestId?: string }

export interface OfferingServiceDeps {
  repo: SupplierOfferingRepository
  events: EventBus
}

function mutationCtx(ctx: OfferingServiceCtx): MutationCtx {
  return { actorId: ctx.user.id, organizationId: ctx.organizationId, requestId: ctx.requestId }
}

function toData(dto: SupplierOfferingDto): UpsertOfferingData {
  return {
    productId: dto.productId,
    supplierSku: dto.supplierSku,
    moq: dto.moq,
    moqUnit: dto.moqUnit,
    leadTimeDays: dto.leadTimeDays,
    isPreferred: dto.isPreferred,
    price: dto.price,
    currency: dto.currency,
    incoterm: dto.incoterm,
    port: dto.port,
    validFrom: dto.validFrom,
    validTo: dto.validTo,
    status: dto.status,
    notes: dto.notes,
  }
}

export function createSupplierOfferingService({ repo, events }: OfferingServiceDeps) {
  return {
    async list(ctx: OfferingServiceCtx, query: ListOfferingsQuery): Promise<OfferingListResult> {
      assertAbility(ctx, 'read', 'SupplierProfile')
      return repo.list({
        organizationId: ctx.organizationId,
        supplierId: query.supplierId,
        productId: query.productId,
        status: query.status,
        isPreferred: query.isPreferred === undefined ? undefined : query.isPreferred === 'true',
        limit: query.limit,
        cursor: query.cursor,
      })
    },

    /** Sourcing shortlist: approved suppliers for a product, preferred first. */
    async suppliersForProduct(ctx: OfferingServiceCtx, productId: string, limit = 25) {
      assertAbility(ctx, 'read', 'SupplierProfile')
      return repo.findSuppliersForProduct(ctx.organizationId, productId, limit)
    },

    async add(
      ctx: OfferingServiceCtx,
      supplierId: string,
      dto: SupplierOfferingDto,
    ): Promise<OfferingRecord> {
      assertAbility(ctx, 'update', 'SupplierProfile')
      if (dto.validFrom && dto.validTo && dto.validTo <= dto.validFrom) {
        throw new ValidationError('validTo must be after validFrom.')
      }
      if (dto.price !== undefined && dto.currency === undefined) {
        throw new ValidationError('A price requires a currency.')
      }

      const offering = await repo.create(mutationCtx(ctx), supplierId, toData(dto))
      await events.emit(
        makeEvent({
          type: 'supplier.offering_added',
          organizationId: ctx.organizationId,
          actorId: ctx.user.id,
          data: { supplierId, productId: dto.productId, offeringId: offering.id },
        }),
      )
      return offering
    },

    async update(
      ctx: OfferingServiceCtx,
      id: string,
      expectedVersion: number,
      dto: Partial<SupplierOfferingDto>,
    ): Promise<OfferingRecord> {
      assertAbility(ctx, 'update', 'SupplierProfile')
      const existing = await repo.findById(ctx.organizationId, id)
      if (!existing) throw new NotFoundError('Offering not found.')

      const offering = await repo.mutate(
        mutationCtx(ctx),
        id,
        expectedVersion,
        dto as UpsertOfferingData,
      )
      await events.emit(
        makeEvent({
          type: 'supplier.offering_updated',
          organizationId: ctx.organizationId,
          actorId: ctx.user.id,
          data: { offeringId: offering.id, supplierId: offering.supplierId },
        }),
      )
      return offering
    },

    async remove(
      ctx: OfferingServiceCtx,
      id: string,
      expectedVersion: number,
    ): Promise<OfferingRecord> {
      assertAbility(ctx, 'update', 'SupplierProfile')
      const offering = await repo.softDelete(mutationCtx(ctx), id, expectedVersion)
      await events.emit(
        makeEvent({
          type: 'supplier.offering_removed',
          organizationId: ctx.organizationId,
          actorId: ctx.user.id,
          data: { offeringId: offering.id, supplierId: offering.supplierId },
        }),
      )
      return offering
    },
  }
}

export type SupplierOfferingService = ReturnType<typeof createSupplierOfferingService>
