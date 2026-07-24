import { Prisma, type ProductStatus } from '@prisma/client'
import { ConflictError, NotFoundError, PreconditionFailedError } from '@triyara/lib'

import { writeAudit } from '../audit'
import { prisma } from '../client'
import { decodeCursor, encodeCursor, type MutationCtx } from './account.repository'

const listSelect = {
  id: true,
  organizationId: true,
  sku: true,
  slug: true,
  name: true,
  shortDescription: true,
  status: true,
  isActive: true,
  categoryId: true,
  version: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { id: true, name: true, slug: true } },
} satisfies Prisma.ProductSelect

const detailSelect = {
  ...listSelect,
  description: true,
  hsCodeId: true,
  originCountryId: true,
  defaultUnitId: true,
  createdById: true,
  updatedById: true,
  hsCode: { select: { id: true, code: true, description: true } },
  originCountry: { select: { id: true, code: true, name: true } },
  defaultUnit: { select: { id: true, code: true, name: true } },
  attributes: {
    select: {
      id: true,
      attributeId: true,
      value: true,
      attribute: { select: { key: true, label: true, unit: true, dataType: true } },
    },
  },
  packaging: {
    select: { packagingTypeId: true, packagingType: { select: { code: true, name: true } } },
  },
} satisfies Prisma.ProductSelect

export type ProductListItem = Prisma.ProductGetPayload<{ select: typeof listSelect }>
export type ProductRecord = Prisma.ProductGetPayload<{ select: typeof detailSelect }>

export interface AttributeInput {
  attributeId: string
  value: string
}

export interface CreateProductData {
  sku: string
  slug: string
  name: string
  shortDescription?: string
  description?: string
  categoryId?: string | null
  hsCodeId?: string | null
  originCountryId?: string | null
  defaultUnitId?: string | null
  status?: ProductStatus
  isActive?: boolean
  attributes?: AttributeInput[]
  packagingTypeIds?: string[]
}

export interface UpdateProductData {
  sku?: string
  slug?: string
  name?: string
  shortDescription?: string
  description?: string
  categoryId?: string | null
  hsCodeId?: string | null
  originCountryId?: string | null
  defaultUnitId?: string | null
  status?: ProductStatus
  isActive?: boolean
  attributes?: AttributeInput[]
  packagingTypeIds?: string[]
}

export interface ListProductsParams {
  limit: number
  cursor?: string
  sort?: string
  q?: string
  categoryId?: string
  hsCodeId?: string
  originCountryId?: string
  status?: ProductStatus
  isActive?: boolean
  includeDeleted?: boolean
}

const SORTABLE = new Set(['createdAt', 'name', 'sku', 'status'])

export interface ProductRepository {
  create(ctx: MutationCtx, data: CreateProductData): Promise<ProductRecord>
  findById(
    orgId: string,
    id: string,
    opts?: { includeDeleted?: boolean },
  ): Promise<ProductRecord | null>
  findBySku(orgId: string, sku: string): Promise<{ id: string } | null>
  findBySlug(orgId: string, slug: string): Promise<{ id: string } | null>
  list(
    orgId: string,
    params: ListProductsParams,
  ): Promise<{ items: ProductListItem[]; nextCursor: string | null; hasMore: boolean }>
  mutate(
    ctx: MutationCtx,
    id: string,
    expectedVersion: number,
    data: UpdateProductData,
    action: string,
  ): Promise<ProductRecord>
  softDelete(ctx: MutationCtx, id: string, expectedVersion: number): Promise<ProductRecord>
  restore(ctx: MutationCtx, id: string, expectedVersion: number): Promise<ProductRecord>
}

function conflictOnUnique(e: unknown): never {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
    throw new ConflictError('A product with this SKU or slug already exists.')
  }
  throw e
}

async function replaceChildren(tx: Prisma.TransactionClient, id: string, data: UpdateProductData) {
  if (data.attributes !== undefined) {
    await tx.productAttributeValue.deleteMany({ where: { productId: id } })
    if (data.attributes.length) {
      await tx.productAttributeValue.createMany({
        data: data.attributes.map((a) => ({
          productId: id,
          attributeId: a.attributeId,
          value: a.value,
        })),
      })
    }
  }
  if (data.packagingTypeIds !== undefined) {
    await tx.productPackaging.deleteMany({ where: { productId: id } })
    if (data.packagingTypeIds.length) {
      await tx.productPackaging.createMany({
        data: data.packagingTypeIds.map((pid) => ({ productId: id, packagingTypeId: pid })),
      })
    }
  }
}

export const productRepository: ProductRepository = {
  async create(ctx, data) {
    return prisma.$transaction(async (tx) => {
      const { attributes, packagingTypeIds, ...scalars } = data
      const created = await tx.product
        .create({
          data: {
            organizationId: ctx.organizationId,
            ...scalars,
            createdById: ctx.actorId,
            updatedById: ctx.actorId,
            attributes: attributes?.length
              ? { create: attributes.map((a) => ({ attributeId: a.attributeId, value: a.value })) }
              : undefined,
            packaging: packagingTypeIds?.length
              ? { create: packagingTypeIds.map((pid) => ({ packagingTypeId: pid })) }
              : undefined,
          },
          select: detailSelect,
        })
        .catch(conflictOnUnique)
      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.actorId,
        requestId: ctx.requestId,
        entityType: 'Product',
        entityId: created.id,
        action: 'product.created',
        after: created,
      })
      return created
    })
  },

  findById(orgId, id, opts) {
    return prisma.product.findFirst({
      where: { id, organizationId: orgId, ...(opts?.includeDeleted ? {} : { deletedAt: null }) },
      select: detailSelect,
    })
  },

  findBySku(orgId, sku) {
    return prisma.product.findFirst({
      where: { organizationId: orgId, sku, deletedAt: null },
      select: { id: true },
    })
  },
  findBySlug(orgId, slug) {
    return prisma.product.findFirst({
      where: { organizationId: orgId, slug, deletedAt: null },
      select: { id: true },
    })
  },

  async list(orgId, params) {
    const desc = !params.sort || params.sort.startsWith('-')
    const raw = params.sort?.replace(/^-/, '') ?? 'createdAt'
    const field = SORTABLE.has(raw) ? raw : 'createdAt'
    const dir: Prisma.SortOrder = desc ? 'desc' : 'asc'
    const where: Prisma.ProductWhereInput = {
      organizationId: orgId,
      ...(params.includeDeleted ? {} : { deletedAt: null }),
      ...(params.categoryId ? { categoryId: params.categoryId } : {}),
      ...(params.hsCodeId ? { hsCodeId: params.hsCodeId } : {}),
      ...(params.originCountryId ? { originCountryId: params.originCountryId } : {}),
      ...(params.status ? { status: params.status } : {}),
      ...(params.isActive !== undefined ? { isActive: params.isActive } : {}),
      ...(params.q
        ? {
            OR: [
              { name: { contains: params.q, mode: 'insensitive' } },
              { sku: { contains: params.q, mode: 'insensitive' } },
              { shortDescription: { contains: params.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    }
    const cursorId = params.cursor ? decodeCursor(params.cursor) : undefined
    const rows = await prisma.product.findMany({
      where,
      select: listSelect,
      orderBy: [{ [field]: dir }, { id: dir }],
      take: params.limit + 1,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
    })
    const hasMore = rows.length > params.limit
    const items = hasMore ? rows.slice(0, params.limit) : rows
    const last = items.at(-1)
    return { items, hasMore, nextCursor: hasMore && last ? encodeCursor(last.id) : null }
  },

  async mutate(ctx, id, expectedVersion, data, action) {
    return prisma.$transaction(async (tx) => {
      const before = await tx.product.findFirst({
        where: { id, organizationId: ctx.organizationId, deletedAt: null },
        select: detailSelect,
      })
      if (!before) throw new NotFoundError('Product not found.')
      const { attributes: _a, packagingTypeIds: _p, ...scalars } = data
      const res = await tx.product
        .updateMany({
          where: {
            id,
            organizationId: ctx.organizationId,
            deletedAt: null,
            version: expectedVersion,
          },
          data: { ...scalars, updatedById: ctx.actorId, version: { increment: 1 } },
        })
        .catch(conflictOnUnique)
      if (res.count === 0) throw new PreconditionFailedError()
      await replaceChildren(tx, id, data)
      const after = await tx.product.findFirstOrThrow({ where: { id }, select: detailSelect })
      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.actorId,
        requestId: ctx.requestId,
        entityType: 'Product',
        entityId: id,
        action,
        before,
        after,
      })
      return after
    })
  },

  async softDelete(ctx, id, expectedVersion) {
    return prisma.$transaction(async (tx) => {
      const before = await tx.product.findFirst({
        where: { id, organizationId: ctx.organizationId, deletedAt: null },
        select: detailSelect,
      })
      if (!before) throw new NotFoundError('Product not found.')
      const res = await tx.product.updateMany({
        where: {
          id,
          organizationId: ctx.organizationId,
          deletedAt: null,
          version: expectedVersion,
        },
        data: {
          deletedAt: new Date(),
          deletedById: ctx.actorId,
          isActive: false,
          version: { increment: 1 },
        },
      })
      if (res.count === 0) throw new PreconditionFailedError()
      const after = await tx.product.findFirstOrThrow({ where: { id }, select: detailSelect })
      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.actorId,
        requestId: ctx.requestId,
        entityType: 'Product',
        entityId: id,
        action: 'product.deleted',
        before,
        after,
      })
      return after
    })
  },

  async restore(ctx, id, expectedVersion) {
    return prisma.$transaction(async (tx) => {
      const before = await tx.product.findFirst({
        where: { id, organizationId: ctx.organizationId, deletedAt: { not: null } },
        select: detailSelect,
      })
      if (!before) throw new NotFoundError('Deleted product not found.')
      const res = await tx.product.updateMany({
        where: {
          id,
          organizationId: ctx.organizationId,
          deletedAt: { not: null },
          version: expectedVersion,
        },
        data: { deletedAt: null, deletedById: null, version: { increment: 1 } },
      })
      if (res.count === 0) throw new PreconditionFailedError()
      const after = await tx.product.findFirstOrThrow({ where: { id }, select: detailSelect })
      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.actorId,
        requestId: ctx.requestId,
        entityType: 'Product',
        entityId: id,
        action: 'product.restored',
        before,
        after,
      })
      return after
    })
  },
}
