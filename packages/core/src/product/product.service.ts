import { assertAbility, type AuthContext } from '@triyara/auth'
import type {
  CreateProductData,
  ListProductsParams,
  MutationCtx,
  ProductCategoryRepository,
  ProductListItem,
  ProductRecord,
  ProductRepository,
  UpdateProductData,
} from '@triyara/db'
import { type EventBus, makeEvent } from '@triyara/events'
import { ConflictError, ValidationError } from '@triyara/lib'
import type { CreateProductDto, ListProductsQuery, UpdateProductDto } from '@triyara/validation'

export type ProductServiceCtx = AuthContext & { requestId?: string }

export interface ReferenceValidator {
  countRefs(
    orgId: string,
    table: 'unit' | 'packaging' | 'origin' | 'hsCode',
    ids: string[],
  ): Promise<number>
  attributeIds(
    orgId: string,
    ids: string[],
  ): Promise<{ id: string; dataType: 'STRING' | 'NUMBER' | 'BOOLEAN' }[]>
}

export interface ProductServiceDeps {
  repo: ProductRepository
  categories: Pick<ProductCategoryRepository, 'findById'>
  reference: ReferenceValidator
  events: EventBus
}

function mctx(ctx: ProductServiceCtx): MutationCtx {
  return { actorId: ctx.user.id, organizationId: ctx.organizationId, requestId: ctx.requestId }
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

export function createProductService({ repo, categories, reference, events }: ProductServiceDeps) {
  async function emit(ctx: ProductServiceCtx, type: string, data: Record<string, unknown>) {
    await events.emit(
      makeEvent({ type, organizationId: ctx.organizationId, actorId: ctx.user.id, data }),
    )
  }

  async function validateRefs(
    ctx: ProductServiceCtx,
    dto: {
      categoryId?: string | null
      hsCodeId?: string | null
      originCountryId?: string | null
      defaultUnitId?: string | null
      packagingTypeIds?: string[]
      attributes?: { attributeId: string; value: string }[]
    },
  ): Promise<void> {
    const orgId = ctx.organizationId
    if (dto.categoryId) {
      const cat = await categories.findById(orgId, dto.categoryId)
      if (!cat || cat.deletedAt) throw new ValidationError('Category not found.')
    }
    if (dto.hsCodeId && (await reference.countRefs(orgId, 'hsCode', [dto.hsCodeId])) !== 1)
      throw new ValidationError('HS code not found.')
    if (dto.defaultUnitId && (await reference.countRefs(orgId, 'unit', [dto.defaultUnitId])) !== 1)
      throw new ValidationError('Unit of measure not found.')
    if (
      dto.originCountryId &&
      (await reference.countRefs(orgId, 'origin', [dto.originCountryId])) !== 1
    )
      throw new ValidationError('Origin country not found.')
    if (dto.packagingTypeIds?.length) {
      const found = await reference.countRefs(orgId, 'packaging', dto.packagingTypeIds)
      if (found !== new Set(dto.packagingTypeIds).size)
        throw new ValidationError('One or more packaging types are invalid.')
    }
    if (dto.attributes?.length) {
      const ids = dto.attributes.map((a) => a.attributeId)
      const defs = await reference.attributeIds(orgId, ids)
      const byId = new Map(defs.map((d) => [d.id, d.dataType]))
      for (const a of dto.attributes) {
        const type = byId.get(a.attributeId)
        if (!type) throw new ValidationError(`Unknown attribute: ${a.attributeId}`)
        if (type === 'NUMBER' && Number.isNaN(Number(a.value)))
          throw new ValidationError(`Attribute value must be numeric.`)
        if (type === 'BOOLEAN' && !['true', 'false'].includes(a.value.toLowerCase()))
          throw new ValidationError('Attribute value must be true or false.')
      }
    }
  }

  return {
    async create(ctx: ProductServiceCtx, dto: CreateProductDto): Promise<ProductRecord> {
      assertAbility(ctx, 'create', 'ReferenceData')
      const slug = dto.slug ?? slugify(dto.name)
      if (await repo.findBySku(ctx.organizationId, dto.sku))
        throw new ConflictError('SKU already in use.')
      if (await repo.findBySlug(ctx.organizationId, slug))
        throw new ConflictError('Slug already in use.')
      await validateRefs(ctx, dto)
      const data: CreateProductData = { ...dto, slug }
      const product = await repo.create(mctx(ctx), data)
      await emit(ctx, 'product.created', { productId: product.id, sku: product.sku })
      return product
    },

    async get(
      ctx: ProductServiceCtx,
      id: string,
      opts?: { includeDeleted?: boolean },
    ): Promise<ProductRecord> {
      assertAbility(ctx, 'read', 'ReferenceData')
      const product = await repo.findById(ctx.organizationId, id, opts)
      if (!product) throw new ValidationError('Product not found.')
      return product
    },

    async list(
      ctx: ProductServiceCtx,
      query: ListProductsQuery,
    ): Promise<{ items: ProductListItem[]; nextCursor: string | null; hasMore: boolean }> {
      assertAbility(ctx, 'read', 'ReferenceData')
      const params: ListProductsParams = {
        limit: query.limit,
        cursor: query.cursor,
        sort: query.sort,
        q: query.q,
        categoryId: query.categoryId,
        hsCodeId: query.hsCodeId,
        originCountryId: query.originCountryId,
        status: query.status,
        isActive: query.isActive,
        includeDeleted: query.includeDeleted,
      }
      return repo.list(ctx.organizationId, params)
    },

    async update(
      ctx: ProductServiceCtx,
      id: string,
      dto: UpdateProductDto,
      expectedVersion: number,
    ): Promise<ProductRecord> {
      assertAbility(ctx, 'update', 'ReferenceData')
      if (dto.sku) {
        const bySku = await repo.findBySku(ctx.organizationId, dto.sku)
        if (bySku && bySku.id !== id) throw new ConflictError('SKU already in use.')
      }
      if (dto.slug) {
        const bySlug = await repo.findBySlug(ctx.organizationId, dto.slug)
        if (bySlug && bySlug.id !== id) throw new ConflictError('Slug already in use.')
      }
      await validateRefs(ctx, dto)
      const action = dto.attributes !== undefined ? 'product.attribute_changed' : 'product.updated'
      const data: UpdateProductData = { ...dto }
      const product = await repo.mutate(mctx(ctx), id, expectedVersion, data, action)
      await emit(ctx, action, { productId: id })
      return product
    },

    async remove(
      ctx: ProductServiceCtx,
      id: string,
      expectedVersion: number,
    ): Promise<ProductRecord> {
      assertAbility(ctx, 'delete', 'ReferenceData')
      const product = await repo.softDelete(mctx(ctx), id, expectedVersion)
      await emit(ctx, 'product.deleted', { productId: id })
      return product
    },

    async restore(
      ctx: ProductServiceCtx,
      id: string,
      expectedVersion: number,
    ): Promise<ProductRecord> {
      assertAbility(ctx, 'update', 'ReferenceData')
      const product = await repo.restore(mctx(ctx), id, expectedVersion)
      await emit(ctx, 'product.restored', { productId: id })
      return product
    },
  }
}

export type ProductService = ReturnType<typeof createProductService>
