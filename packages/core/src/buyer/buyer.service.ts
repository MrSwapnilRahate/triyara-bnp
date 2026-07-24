import { assertAbility, type AuthContext } from '@triyara/auth'
import type {
  AddBuyerProductData,
  BuyerProfileData,
  BuyerProfileRecord,
  BuyerProfileRepository,
  MutationCtx,
} from '@triyara/db'
import { type EventBus, makeEvent } from '@triyara/events'
import { NotFoundError } from '@triyara/lib'
import type {
  AddBuyerProductDto,
  CreateBuyerProfileDto,
  UpdateBuyerProfileDto,
} from '@triyara/validation'

export type BuyerServiceCtx = AuthContext & { requestId?: string }

export interface BuyerServiceDeps {
  repo: BuyerProfileRepository
  events: EventBus
}

function mutationCtx(ctx: BuyerServiceCtx): MutationCtx {
  return { actorId: ctx.user.id, organizationId: ctx.organizationId, requestId: ctx.requestId }
}

export function createBuyerService({ repo, events }: BuyerServiceDeps) {
  async function emit(ctx: BuyerServiceCtx, type: string, data: Record<string, unknown>) {
    await events.emit(
      makeEvent({ type, organizationId: ctx.organizationId, actorId: ctx.user.id, data }),
    )
  }

  return {
    async create(
      ctx: BuyerServiceCtx,
      accountId: string,
      dto: CreateBuyerProfileDto,
    ): Promise<BuyerProfileRecord> {
      assertAbility(ctx, 'create', 'BuyerProfile')
      const profile = await repo.create(mutationCtx(ctx), accountId, dto as BuyerProfileData)
      await emit(ctx, 'buyer.created', { accountId, buyerProfileId: profile.id })
      return profile
    },

    async get(
      ctx: BuyerServiceCtx,
      accountId: string,
      opts?: { includeDeleted?: boolean },
    ): Promise<BuyerProfileRecord> {
      assertAbility(ctx, 'read', 'BuyerProfile')
      const profile = await repo.findByAccountId(ctx.organizationId, accountId, opts)
      if (!profile) throw new NotFoundError('Buyer profile not found.')
      return profile
    },

    async find(ctx: BuyerServiceCtx, accountId: string): Promise<BuyerProfileRecord | null> {
      assertAbility(ctx, 'read', 'BuyerProfile')
      return repo.findByAccountId(ctx.organizationId, accountId)
    },

    async update(
      ctx: BuyerServiceCtx,
      accountId: string,
      dto: UpdateBuyerProfileDto,
      expectedVersion: number,
    ): Promise<BuyerProfileRecord> {
      assertAbility(ctx, 'update', 'BuyerProfile')
      const profile = await repo.mutate(
        mutationCtx(ctx),
        accountId,
        expectedVersion,
        dto as BuyerProfileData,
        'buyer.updated',
      )
      await emit(ctx, 'buyer.updated', { accountId, buyerProfileId: profile.id })
      return profile
    },

    async remove(
      ctx: BuyerServiceCtx,
      accountId: string,
      expectedVersion: number,
    ): Promise<BuyerProfileRecord> {
      assertAbility(ctx, 'delete', 'BuyerProfile')
      const profile = await repo.softDelete(mutationCtx(ctx), accountId, expectedVersion)
      await emit(ctx, 'buyer.deleted', { accountId, buyerProfileId: profile.id })
      return profile
    },

    async restore(
      ctx: BuyerServiceCtx,
      accountId: string,
      expectedVersion: number,
    ): Promise<BuyerProfileRecord> {
      assertAbility(ctx, 'update', 'BuyerProfile')
      const profile = await repo.restore(mutationCtx(ctx), accountId, expectedVersion)
      await emit(ctx, 'buyer.restored', { accountId, buyerProfileId: profile.id })
      return profile
    },

    async addProduct(
      ctx: BuyerServiceCtx,
      accountId: string,
      dto: AddBuyerProductDto,
      expectedVersion: number,
    ): Promise<BuyerProfileRecord> {
      assertAbility(ctx, 'update', 'BuyerProfile')
      const profile = await repo.addProduct(
        mutationCtx(ctx),
        accountId,
        expectedVersion,
        dto as AddBuyerProductData,
      )
      await emit(ctx, 'buyer.capability_changed', { accountId, change: 'product_added' })
      return profile
    },

    async removeProduct(
      ctx: BuyerServiceCtx,
      accountId: string,
      productId: string,
      expectedVersion: number,
    ): Promise<BuyerProfileRecord> {
      assertAbility(ctx, 'update', 'BuyerProfile')
      const profile = await repo.removeProduct(
        mutationCtx(ctx),
        accountId,
        expectedVersion,
        productId,
      )
      await emit(ctx, 'buyer.capability_changed', { accountId, change: 'product_removed' })
      return profile
    },
  }
}

export type BuyerService = ReturnType<typeof createBuyerService>
