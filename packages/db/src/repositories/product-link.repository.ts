import type { ProductLinkSource } from '@prisma/client'

import { prisma } from '../client'
import type { MutationCtx } from './account.repository'

// Extension link between a frozen SupplierProduct / BuyerProduct (by ID) and a catalog
// Product. The frozen tables are never modified - only this join carries the mapping.
export const productLinkRepository = {
  async link(ctx: MutationCtx, sourceType: ProductLinkSource, sourceId: string, productId: string) {
    const product = await prisma.product.findFirst({
      where: { id: productId, organizationId: ctx.organizationId, deletedAt: null },
      select: { id: true },
    })
    if (!product) throw new Error('Product not found in organization.')
    return prisma.productLink.upsert({
      where: { sourceType_sourceId: { sourceType, sourceId } },
      create: {
        organizationId: ctx.organizationId,
        sourceType,
        sourceId,
        productId,
        createdById: ctx.actorId,
      },
      update: { productId, createdById: ctx.actorId },
      select: { id: true, sourceType: true, sourceId: true, productId: true },
    })
  },
  async unlink(orgId: string, sourceType: ProductLinkSource, sourceId: string) {
    await prisma.productLink.deleteMany({ where: { organizationId: orgId, sourceType, sourceId } })
  },
  resolve(orgId: string, sourceType: ProductLinkSource, sourceIds: string[]) {
    return prisma.productLink.findMany({
      where: { organizationId: orgId, sourceType, sourceId: { in: sourceIds } },
      select: {
        sourceId: true,
        productId: true,
        product: { select: { id: true, sku: true, name: true } },
      },
    })
  },
}
