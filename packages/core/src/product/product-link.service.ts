import { assertAbility, type AuthContext } from '@triyara/auth'
import type { MutationCtx, productLinkRepository } from '@triyara/db'

export type ProductLinkCtx = AuthContext & { requestId?: string }
export type LinkSource = 'SUPPLIER_PRODUCT' | 'BUYER_PRODUCT'

// Extension service: maps a frozen SupplierProduct / BuyerProduct (by ID) to a catalog
// Product. It only writes the ProductLink join - the frozen modules are never touched.
export function createProductLinkService({ repo }: { repo: typeof productLinkRepository }) {
  function mctx(ctx: ProductLinkCtx): MutationCtx {
    return { actorId: ctx.user.id, organizationId: ctx.organizationId, requestId: ctx.requestId }
  }
  return {
    async link(ctx: ProductLinkCtx, sourceType: LinkSource, sourceId: string, productId: string) {
      assertAbility(ctx, 'update', 'ReferenceData')
      return repo.link(mctx(ctx), sourceType, sourceId, productId)
    },
    async unlink(ctx: ProductLinkCtx, sourceType: LinkSource, sourceId: string) {
      assertAbility(ctx, 'update', 'ReferenceData')
      await repo.unlink(ctx.organizationId, sourceType, sourceId)
    },
    async resolve(ctx: ProductLinkCtx, sourceType: LinkSource, sourceIds: string[]) {
      assertAbility(ctx, 'read', 'ReferenceData')
      return repo.resolve(ctx.organizationId, sourceType, sourceIds)
    },
  }
}

export type ProductLinkService = ReturnType<typeof createProductLinkService>
