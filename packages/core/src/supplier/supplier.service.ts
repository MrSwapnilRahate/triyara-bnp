import { assertAbility, type AuthContext } from '@triyara/auth'
import type {
  AddProductData,
  MutationCtx,
  SupplierProfileData,
  SupplierProfileRecord,
  SupplierProfileRepository,
} from '@triyara/db'
import { type EventBus, makeEvent } from '@triyara/events'
import { NotFoundError } from '@triyara/lib'
import type {
  AddSupplierProductDto,
  CreateSupplierProfileDto,
  UpdateSupplierProfileDto,
} from '@triyara/validation'

export type SupplierServiceCtx = AuthContext & { requestId?: string }

export interface SupplierServiceDeps {
  repo: SupplierProfileRepository
  events: EventBus
}

function mutationCtx(ctx: SupplierServiceCtx): MutationCtx {
  return { actorId: ctx.user.id, organizationId: ctx.organizationId, requestId: ctx.requestId }
}

export function createSupplierService({ repo, events }: SupplierServiceDeps) {
  async function emit(ctx: SupplierServiceCtx, type: string, data: Record<string, unknown>) {
    await events.emit(
      makeEvent({ type, organizationId: ctx.organizationId, actorId: ctx.user.id, data }),
    )
  }

  return {
    async create(
      ctx: SupplierServiceCtx,
      accountId: string,
      dto: CreateSupplierProfileDto,
    ): Promise<SupplierProfileRecord> {
      assertAbility(ctx, 'create', 'SupplierProfile')
      const profile = await repo.create(mutationCtx(ctx), accountId, dto as SupplierProfileData)
      await emit(ctx, 'supplier.created', { accountId, supplierProfileId: profile.id })
      return profile
    },

    async get(
      ctx: SupplierServiceCtx,
      accountId: string,
      opts?: { includeDeleted?: boolean },
    ): Promise<SupplierProfileRecord> {
      assertAbility(ctx, 'read', 'SupplierProfile')
      const profile = await repo.findByAccountId(ctx.organizationId, accountId, opts)
      if (!profile) throw new NotFoundError('Supplier profile not found.')
      return profile
    },

    async find(ctx: SupplierServiceCtx, accountId: string): Promise<SupplierProfileRecord | null> {
      assertAbility(ctx, 'read', 'SupplierProfile')
      return repo.findByAccountId(ctx.organizationId, accountId)
    },

    async update(
      ctx: SupplierServiceCtx,
      accountId: string,
      dto: UpdateSupplierProfileDto,
      expectedVersion: number,
    ): Promise<SupplierProfileRecord> {
      assertAbility(ctx, 'update', 'SupplierProfile')
      const profile = await repo.mutate(
        mutationCtx(ctx),
        accountId,
        expectedVersion,
        dto as SupplierProfileData,
        'supplier.updated',
      )
      await emit(ctx, 'supplier.updated', { accountId, supplierProfileId: profile.id })
      return profile
    },

    async remove(
      ctx: SupplierServiceCtx,
      accountId: string,
      expectedVersion: number,
    ): Promise<SupplierProfileRecord> {
      assertAbility(ctx, 'delete', 'SupplierProfile')
      const profile = await repo.softDelete(mutationCtx(ctx), accountId, expectedVersion)
      await emit(ctx, 'supplier.deleted', { accountId, supplierProfileId: profile.id })
      return profile
    },

    async restore(
      ctx: SupplierServiceCtx,
      accountId: string,
      expectedVersion: number,
    ): Promise<SupplierProfileRecord> {
      assertAbility(ctx, 'update', 'SupplierProfile')
      const profile = await repo.restore(mutationCtx(ctx), accountId, expectedVersion)
      await emit(ctx, 'supplier.restored', { accountId, supplierProfileId: profile.id })
      return profile
    },

    async addProduct(
      ctx: SupplierServiceCtx,
      accountId: string,
      dto: AddSupplierProductDto,
      expectedVersion: number,
    ): Promise<SupplierProfileRecord> {
      assertAbility(ctx, 'update', 'SupplierProfile')
      const profile = await repo.addProduct(
        mutationCtx(ctx),
        accountId,
        expectedVersion,
        dto as AddProductData,
      )
      await emit(ctx, 'supplier.capability_changed', { accountId, change: 'product_added' })
      return profile
    },

    async removeProduct(
      ctx: SupplierServiceCtx,
      accountId: string,
      productId: string,
      expectedVersion: number,
    ): Promise<SupplierProfileRecord> {
      assertAbility(ctx, 'update', 'SupplierProfile')
      const profile = await repo.removeProduct(
        mutationCtx(ctx),
        accountId,
        expectedVersion,
        productId,
      )
      await emit(ctx, 'supplier.capability_changed', { accountId, change: 'product_removed' })
      return profile
    },
  }
}

export type SupplierService = ReturnType<typeof createSupplierService>
