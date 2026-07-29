import { assertAbility, type AuthContext } from '@triyara/auth'
import type { MutationCtx, ProductListResult, ProductRecord, ProductRepository } from '@triyara/db'
import { type EventBus, makeEvent } from '@triyara/events'
import { ConflictError, NotFoundError } from '@triyara/lib'
import type { CreateProductDto, ListProductsQuery, UpdateProductDto } from '@triyara/validation'

import { slugify } from './category.service'

// Product service (TRY-BNP-CATALOG-S1). Authorized as `ReferenceData`: readable
// by every role, writable by ADMIN only under the frozen ability model.

export type ProductServiceCtx = AuthContext & { requestId?: string }

export interface ProductServiceDeps {
  repo: ProductRepository
  events: EventBus
}

function mutationCtx(ctx: ProductServiceCtx): MutationCtx {
  return { actorId: ctx.user.id, organizationId: ctx.organizationId, requestId: ctx.requestId }
}

export function createProductService({ repo, events }: ProductServiceDeps) {
  async function emit(ctx: ProductServiceCtx, type: string, data: Record<string, unknown>) {
    await events.emit(
      makeEvent({ type, organizationId: ctx.organizationId, actorId: ctx.user.id, data }),
    )
  }

  return {
    async list(ctx: ProductServiceCtx, query: ListProductsQuery): Promise<ProductListResult> {
      assertAbility(ctx, 'read', 'ReferenceData')
      return repo.list({
        organizationId: ctx.organizationId,
        q: query.q,
        categoryId: query.categoryId,
        categoryPathPrefix: query.categoryPathPrefix,
        status: query.status,
        brand: query.brand,
        countryOfOrigin: query.countryOfOrigin,
        hsCode: query.hsCode,
        tagId: query.tagId,
        isActive: query.isActive === undefined ? undefined : query.isActive === 'true',
        includeDeleted: query.includeDeleted === 'true',
        sort: query.sort,
        limit: query.limit,
        cursor: query.cursor,
      })
    },

    async get(
      ctx: ProductServiceCtx,
      id: string,
      opts: { includeDeleted?: boolean } = {},
    ): Promise<ProductRecord> {
      assertAbility(ctx, 'read', 'ReferenceData')
      const product = await repo.findById(ctx.organizationId, id, opts)
      if (!product) throw new NotFoundError('Product not found.')
      return product
    },

    async create(ctx: ProductServiceCtx, dto: CreateProductDto): Promise<ProductRecord> {
      assertAbility(ctx, 'create', 'ReferenceData')

      // A soft-deleted product keeps its SKU, so surface restore rather than
      // letting the caller hit a bare unique violation.
      const existing = await repo.findBySku(ctx.organizationId, dto.sku)
      if (existing) {
        throw new ConflictError(
          existing.deletedAt
            ? `SKU "${dto.sku}" belongs to a deleted product. Restore it instead of recreating it.`
            : `A product with SKU "${dto.sku}" already exists.`,
        )
      }

      const product = await repo.create(mutationCtx(ctx), {
        ...dto,
        slug: dto.slug ?? slugify(dto.name),
      })
      await emit(ctx, 'product.created', {
        productId: product.id,
        sku: product.sku,
        categoryId: product.categoryId,
      })
      return product
    },

    async update(
      ctx: ProductServiceCtx,
      id: string,
      expectedVersion: number,
      dto: UpdateProductDto,
    ): Promise<ProductRecord> {
      assertAbility(ctx, 'update', 'ReferenceData')

      if (dto.sku) {
        const clash = await repo.findBySku(ctx.organizationId, dto.sku)
        if (clash && clash.id !== id) {
          throw new ConflictError(`A product with SKU "${dto.sku}" already exists.`)
        }
      }

      // Attribute edits are a distinct audit action from a plain field edit.
      const action = dto.specifications ? 'product.specifications_changed' : 'product.updated'
      const product = await repo.mutate(mutationCtx(ctx), id, expectedVersion, dto, action)
      await emit(ctx, action.replace('_changed', '.changed'), {
        productId: product.id,
        sku: product.sku,
      })
      return product
    },

    async remove(
      ctx: ProductServiceCtx,
      id: string,
      expectedVersion: number,
    ): Promise<ProductRecord> {
      assertAbility(ctx, 'delete', 'ReferenceData')
      const product = await repo.softDelete(mutationCtx(ctx), id, expectedVersion)
      await emit(ctx, 'product.deleted', { productId: product.id, sku: product.sku })
      return product
    },

    async restore(
      ctx: ProductServiceCtx,
      id: string,
      expectedVersion: number,
    ): Promise<ProductRecord> {
      assertAbility(ctx, 'update', 'ReferenceData')
      const product = await repo.restore(mutationCtx(ctx), id, expectedVersion)
      await emit(ctx, 'product.restored', { productId: product.id, sku: product.sku })
      return product
    },
  }
}

export type ProductService = ReturnType<typeof createProductService>
