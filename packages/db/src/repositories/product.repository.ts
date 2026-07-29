import { Prisma, type ProductStatus } from '@prisma/client'
import { ConflictError, NotFoundError, PreconditionFailedError } from '@triyara/lib'

import { writeAudit } from '../audit'
import { prisma } from '../client'
import { decodeCursor, encodeCursor, type MutationCtx } from './account.repository'

// Product master data (TRY-BNP-CATALOG-S1).
//
// A soft-deleted product keeps its unique SKU: an SKU is a permanent identifier,
// so the correct operation is restore, never recreate (ADR: catalog section 4.4).

/** Narrow projection for lists - deliberately excludes `description`. */
const listSelect = {
  id: true,
  organizationId: true,
  sku: true,
  name: true,
  slug: true,
  shortDescription: true,
  categoryId: true,
  countryOfOrigin: true,
  brand: true,
  hsCode: true,
  status: true,
  isActive: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  category: { select: { id: true, name: true, slug: true, path: true } },
} satisfies Prisma.ProductSelect

const detailSelect = {
  ...listSelect,
  description: true,
  specifications: {
    select: {
      id: true,
      definitionId: true,
      value: true,
      valueNumber: true,
      valueBoolean: true,
      valueDate: true,
      sortOrder: true,
      definition: { select: { id: true, name: true, slug: true, unit: true, dataType: true } },
    },
    orderBy: { sortOrder: 'asc' },
  },
  tags: {
    select: { tagId: true, tag: { select: { id: true, name: true, slug: true, color: true } } },
  },
} satisfies Prisma.ProductSelect

export type ProductListItem = Prisma.ProductGetPayload<{ select: typeof listSelect }>
export type ProductRecord = Prisma.ProductGetPayload<{ select: typeof detailSelect }>

export interface SpecificationInput {
  definitionId: string
  value: string
}

export interface CreateProductData {
  sku: string
  name: string
  slug: string
  shortDescription?: string
  description?: string
  categoryId: string
  countryOfOrigin?: string
  brand?: string
  hsCode?: string
  status?: ProductStatus
  isActive?: boolean
  specifications?: SpecificationInput[]
  tagIds?: string[]
}

export type UpdateProductData = Partial<Omit<CreateProductData, 'specifications' | 'tagIds'>> & {
  specifications?: SpecificationInput[]
  tagIds?: string[]
}

export interface ListProductsParams {
  organizationId: string
  q?: string
  categoryId?: string
  categoryPathPrefix?: string
  status?: ProductStatus
  brand?: string
  countryOfOrigin?: string
  hsCode?: string
  tagId?: string
  isActive?: boolean
  includeDeleted?: boolean
  sort?: string
  limit: number
  cursor?: string
}

export interface ProductListResult {
  items: ProductListItem[]
  nextCursor: string | null
}

function conflictOnUnique(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    const target = (error.meta as { target?: string[] } | undefined)?.target?.join(',') ?? ''
    if (target.includes('sku')) {
      throw new ConflictError(
        'A product with that SKU already exists. If it was deleted, restore it instead.',
      )
    }
    throw new ConflictError('A product with that slug already exists.')
  }
  throw error
}

/** Typed projections mirror the value so range filters never cast text. */
function projections(dataType: string, value: string) {
  if (dataType === 'NUMBER') {
    const n = Number(value)
    return { valueNumber: Number.isFinite(n) ? value : null, valueBoolean: null, valueDate: null }
  }
  if (dataType === 'BOOLEAN') {
    return { valueNumber: null, valueBoolean: value === 'true', valueDate: null }
  }
  if (dataType === 'DATE') {
    const d = new Date(value)
    return {
      valueNumber: null,
      valueBoolean: null,
      valueDate: Number.isNaN(d.getTime()) ? null : d,
    }
  }
  return { valueNumber: null, valueBoolean: null, valueDate: null }
}

async function buildSpecRows(
  tx: Prisma.TransactionClient,
  organizationId: string,
  specs: SpecificationInput[],
) {
  if (specs.length === 0) return []
  const ids = [...new Set(specs.map((s) => s.definitionId))]
  const defs = await tx.productSpecificationDefinition.findMany({
    where: { id: { in: ids }, organizationId, deletedAt: null },
    select: { id: true, dataType: true },
  })
  const byId = new Map(defs.map((d) => [d.id, d.dataType as string]))
  const missing = ids.filter((id) => !byId.has(id))
  if (missing.length > 0) {
    throw new NotFoundError(`Unknown specification definition: ${missing.join(', ')}`)
  }
  return specs.map((s, i) => ({
    definitionId: s.definitionId,
    value: s.value,
    sortOrder: i * 10,
    ...projections(byId.get(s.definitionId)!, s.value),
  }))
}

async function assertCategory(
  tx: Prisma.TransactionClient,
  organizationId: string,
  categoryId: string,
) {
  const category = await tx.category.findFirst({
    where: { id: categoryId, organizationId, deletedAt: null },
    select: { id: true },
  })
  if (!category) throw new NotFoundError('Category not found.')
}

export const productRepository = {
  async create(ctx: MutationCtx, data: CreateProductData): Promise<ProductRecord> {
    try {
      return await prisma.$transaction(async (tx) => {
        await assertCategory(tx, ctx.organizationId, data.categoryId)
        const specRows = await buildSpecRows(tx, ctx.organizationId, data.specifications ?? [])

        const product = await tx.product.create({
          data: {
            organizationId: ctx.organizationId,
            sku: data.sku,
            name: data.name,
            slug: data.slug,
            shortDescription: data.shortDescription,
            description: data.description,
            categoryId: data.categoryId,
            countryOfOrigin: data.countryOfOrigin,
            brand: data.brand,
            hsCode: data.hsCode,
            status: data.status ?? 'DRAFT',
            isActive: data.isActive ?? true,
            specifications: specRows.length > 0 ? { create: specRows } : undefined,
            tags:
              data.tagIds && data.tagIds.length > 0
                ? { create: data.tagIds.map((tagId) => ({ tagId })) }
                : undefined,
          },
          select: detailSelect,
        })

        await writeAudit(tx, {
          organizationId: ctx.organizationId,
          actorId: ctx.actorId,
          requestId: ctx.requestId,
          entityType: 'Product',
          entityId: product.id,
          action: 'product.created',
          after: { sku: product.sku, name: product.name, categoryId: product.categoryId },
        })

        return product
      })
    } catch (error) {
      return conflictOnUnique(error)
    }
  },

  findById(
    organizationId: string,
    id: string,
    opts: { includeDeleted?: boolean } = {},
  ): Promise<ProductRecord | null> {
    return prisma.product.findFirst({
      where: { id, organizationId, ...(opts.includeDeleted ? {} : { deletedAt: null }) },
      select: detailSelect,
    })
  },

  findBySku(organizationId: string, sku: string): Promise<ProductRecord | null> {
    return prisma.product.findFirst({ where: { organizationId, sku }, select: detailSelect })
  },

  async list(params: ListProductsParams): Promise<ProductListResult> {
    const where: Prisma.ProductWhereInput = {
      organizationId: params.organizationId,
      ...(params.includeDeleted ? {} : { deletedAt: null }),
      ...(params.categoryId ? { categoryId: params.categoryId } : {}),
      ...(params.categoryPathPrefix
        ? { category: { path: { startsWith: params.categoryPathPrefix } } }
        : {}),
      ...(params.status ? { status: params.status } : {}),
      ...(params.brand ? { brand: params.brand } : {}),
      ...(params.countryOfOrigin ? { countryOfOrigin: params.countryOfOrigin } : {}),
      ...(params.hsCode ? { hsCode: { startsWith: params.hsCode } } : {}),
      ...(params.tagId ? { tags: { some: { tagId: params.tagId } } } : {}),
      ...(params.isActive === undefined ? {} : { isActive: params.isActive }),
      // ILIKE across the identifiers users actually type; backed by the pg_trgm
      // GIN indexes on sku and name.
      ...(params.q
        ? {
            OR: [
              { name: { contains: params.q, mode: 'insensitive' } },
              { sku: { contains: params.q, mode: 'insensitive' } },
              { brand: { contains: params.q, mode: 'insensitive' } },
              { shortDescription: { contains: params.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    }

    const desc = params.sort?.startsWith('-') ?? true
    const field = (params.sort ?? '-createdAt').replace(/^-/, '') as 'createdAt' | 'name' | 'sku'
    const dir: Prisma.SortOrder = desc ? 'desc' : 'asc'

    const rows = await prisma.product.findMany({
      where,
      select: listSelect,
      orderBy: [{ [field]: dir }, { id: dir }],
      take: params.limit + 1,
      ...(params.cursor ? { cursor: { id: decodeCursor(params.cursor) }, skip: 1 } : {}),
    })

    const items = rows.slice(0, params.limit)
    const nextCursor = rows.length > params.limit ? encodeCursor(items[items.length - 1]!.id) : null
    return { items, nextCursor }
  },

  /**
   * Versioned, audited update. Specifications and tags are replaced wholesale -
   * two statements regardless of how many there are, rather than one round trip
   * per attribute.
   */
  async mutate(
    ctx: MutationCtx,
    id: string,
    expectedVersion: number,
    data: UpdateProductData,
    action = 'product.updated',
  ): Promise<ProductRecord> {
    try {
      return await prisma.$transaction(async (tx) => {
        const before = await tx.product.findFirst({
          where: { id, organizationId: ctx.organizationId, deletedAt: null },
          select: detailSelect,
        })
        if (!before) throw new NotFoundError('Product not found.')

        if (data.categoryId) await assertCategory(tx, ctx.organizationId, data.categoryId)

        const { specifications, tagIds, ...scalars } = data
        const updated = await tx.product.updateMany({
          where: {
            id,
            organizationId: ctx.organizationId,
            deletedAt: null,
            version: expectedVersion,
          },
          data: { ...scalars, version: { increment: 1 } },
        })
        if (updated.count === 0) throw new PreconditionFailedError()

        if (specifications) {
          const rows = await buildSpecRows(tx, ctx.organizationId, specifications)
          await tx.productSpecification.deleteMany({ where: { productId: id } })
          if (rows.length > 0) {
            await tx.productSpecification.createMany({
              data: rows.map((r) => ({ ...r, productId: id })),
            })
          }
        }

        if (tagIds) {
          await tx.productTag.deleteMany({ where: { productId: id } })
          if (tagIds.length > 0) {
            await tx.productTag.createMany({
              data: tagIds.map((tagId) => ({ productId: id, tagId })),
            })
          }
        }

        const after = await tx.product.findUniqueOrThrow({ where: { id }, select: detailSelect })
        await writeAudit(tx, {
          organizationId: ctx.organizationId,
          actorId: ctx.actorId,
          requestId: ctx.requestId,
          entityType: 'Product',
          entityId: id,
          action,
          before: { sku: before.sku, name: before.name, status: before.status },
          after: { sku: after.sku, name: after.name, status: after.status },
        })
        return after
      })
    } catch (error) {
      return conflictOnUnique(error)
    }
  },

  async softDelete(ctx: MutationCtx, id: string, expectedVersion: number): Promise<ProductRecord> {
    return prisma.$transaction(async (tx) => {
      const before = await tx.product.findFirst({
        where: { id, organizationId: ctx.organizationId, deletedAt: null },
        select: detailSelect,
      })
      if (!before) throw new NotFoundError('Product not found.')

      const updated = await tx.product.updateMany({
        where: {
          id,
          organizationId: ctx.organizationId,
          deletedAt: null,
          version: expectedVersion,
        },
        data: { deletedAt: new Date(), isActive: false, version: { increment: 1 } },
      })
      if (updated.count === 0) throw new PreconditionFailedError()

      const after = await tx.product.findUniqueOrThrow({ where: { id }, select: detailSelect })
      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.actorId,
        requestId: ctx.requestId,
        entityType: 'Product',
        entityId: id,
        action: 'product.deleted',
        before: { sku: before.sku, deletedAt: before.deletedAt },
        after: { sku: after.sku, deletedAt: after.deletedAt },
      })
      return after
    })
  },

  async restore(ctx: MutationCtx, id: string, expectedVersion: number): Promise<ProductRecord> {
    return prisma.$transaction(async (tx) => {
      const before = await tx.product.findFirst({
        where: { id, organizationId: ctx.organizationId, NOT: { deletedAt: null } },
        select: detailSelect,
      })
      if (!before) throw new NotFoundError('Deleted product not found.')

      const updated = await tx.product.updateMany({
        where: { id, organizationId: ctx.organizationId, version: expectedVersion },
        data: { deletedAt: null, isActive: true, version: { increment: 1 } },
      })
      if (updated.count === 0) throw new PreconditionFailedError()

      const after = await tx.product.findUniqueOrThrow({ where: { id }, select: detailSelect })
      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.actorId,
        requestId: ctx.requestId,
        entityType: 'Product',
        entityId: id,
        action: 'product.restored',
        before: { deletedAt: before.deletedAt },
        after: { deletedAt: after.deletedAt },
      })
      return after
    })
  },
}

export type ProductRepository = typeof productRepository
