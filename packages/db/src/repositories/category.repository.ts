import { Prisma } from '@prisma/client'
import {
  ConflictError,
  NotFoundError,
  PreconditionFailedError,
  ValidationError,
} from '@triyara/lib'

import { writeAudit } from '../audit'
import { prisma } from '../client'
import { decodeCursor, encodeCursor, type MutationCtx } from './account.repository'

// Product category hierarchy (TRY-BNP-CATALOG-S1). Unlimited nesting via an
// adjacency list plus a materialised `path`, which this repository is
// responsible for keeping correct - including rewriting a whole subtree on move.

const categorySelect = {
  id: true,
  organizationId: true,
  parentId: true,
  name: true,
  slug: true,
  description: true,
  path: true,
  depth: true,
  sortOrder: true,
  isActive: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
} satisfies Prisma.CategorySelect

export type CategoryRecord = Prisma.CategoryGetPayload<{ select: typeof categorySelect }>

export interface CreateCategoryData {
  name: string
  slug: string
  description?: string
  parentId?: string
  sortOrder?: number
  isActive?: boolean
}

export interface UpdateCategoryData {
  name?: string
  slug?: string
  description?: string
  parentId?: string | null
  sortOrder?: number
  isActive?: boolean
}

export interface ListCategoriesParams {
  organizationId: string
  parentId?: string
  pathPrefix?: string
  isActive?: boolean
  q?: string
  limit: number
  cursor?: string
}

export interface CategoryListResult {
  items: CategoryRecord[]
  nextCursor: string | null
}

function conflictOnUnique(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    throw new ConflictError('A category with that slug already exists.')
  }
  throw error
}

export const categoryRepository = {
  async create(ctx: MutationCtx, data: CreateCategoryData): Promise<CategoryRecord> {
    try {
      return await prisma.$transaction(async (tx) => {
        let path = `/${data.slug}`
        let depth = 0

        if (data.parentId) {
          const parent = await tx.category.findFirst({
            where: { id: data.parentId, organizationId: ctx.organizationId, deletedAt: null },
            select: { path: true, depth: true },
          })
          if (!parent) throw new NotFoundError('Parent category not found.')
          path = `${parent.path}/${data.slug}`
          depth = parent.depth + 1
        }

        const category = await tx.category.create({
          data: {
            organizationId: ctx.organizationId,
            name: data.name,
            slug: data.slug,
            description: data.description,
            parentId: data.parentId ?? null,
            path,
            depth,
            sortOrder: data.sortOrder ?? 0,
            isActive: data.isActive ?? true,
          },
          select: categorySelect,
        })

        await writeAudit(tx, {
          organizationId: ctx.organizationId,
          actorId: ctx.actorId,
          requestId: ctx.requestId,
          entityType: 'Category',
          entityId: category.id,
          action: 'category.created',
          after: category,
        })

        return category
      })
    } catch (error) {
      return conflictOnUnique(error)
    }
  },

  findById(
    organizationId: string,
    id: string,
    opts: { includeDeleted?: boolean } = {},
  ): Promise<CategoryRecord | null> {
    return prisma.category.findFirst({
      where: { id, organizationId, ...(opts.includeDeleted ? {} : { deletedAt: null }) },
      select: categorySelect,
    })
  },

  findBySlug(organizationId: string, slug: string): Promise<CategoryRecord | null> {
    return prisma.category.findFirst({
      where: { organizationId, slug, deletedAt: null },
      select: categorySelect,
    })
  },

  async list(params: ListCategoriesParams): Promise<CategoryListResult> {
    const where: Prisma.CategoryWhereInput = {
      organizationId: params.organizationId,
      deletedAt: null,
      ...(params.parentId ? { parentId: params.parentId } : {}),
      ...(params.pathPrefix ? { path: { startsWith: params.pathPrefix } } : {}),
      ...(params.isActive === undefined ? {} : { isActive: params.isActive }),
      ...(params.q ? { name: { contains: params.q, mode: 'insensitive' } } : {}),
    }

    const rows = await prisma.category.findMany({
      where,
      select: categorySelect,
      orderBy: [{ path: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }],
      take: params.limit + 1,
      ...(params.cursor ? { cursor: { id: decodeCursor(params.cursor) }, skip: 1 } : {}),
    })

    const items = rows.slice(0, params.limit)
    const nextCursor = rows.length > params.limit ? encodeCursor(items[items.length - 1]!.id) : null
    return { items, nextCursor }
  },

  /**
   * Versioned, audited update. Moving or renaming a category rewrites the
   * materialised path of every descendant in the same transaction, so `path`
   * can never drift from `parentId`.
   */
  async mutate(
    ctx: MutationCtx,
    id: string,
    expectedVersion: number,
    data: UpdateCategoryData,
  ): Promise<CategoryRecord> {
    try {
      return await prisma.$transaction(async (tx) => {
        const before = await tx.category.findFirst({
          where: { id, organizationId: ctx.organizationId, deletedAt: null },
          select: categorySelect,
        })
        if (!before) throw new NotFoundError('Category not found.')

        const reparenting = data.parentId !== undefined
        const renaming = data.slug !== undefined && data.slug !== before.slug

        let path = before.path
        let depth = before.depth

        if (reparenting || renaming) {
          const slugPart = data.slug ?? before.slug
          const parentId = reparenting ? data.parentId : before.parentId

          if (parentId) {
            if (parentId === id) throw new ValidationError('A category cannot be its own parent.')
            const parent = await tx.category.findFirst({
              where: { id: parentId, organizationId: ctx.organizationId, deletedAt: null },
              select: { id: true, path: true, depth: true },
            })
            if (!parent) throw new NotFoundError('Parent category not found.')
            // Moving a node beneath its own descendant would detach the subtree.
            if (parent.path.startsWith(`${before.path}/`)) {
              throw new ValidationError('A category cannot be moved beneath its own descendant.')
            }
            path = `${parent.path}/${slugPart}`
            depth = parent.depth + 1
          } else {
            path = `/${slugPart}`
            depth = 0
          }
        }

        const updated = await tx.category.updateMany({
          where: {
            id,
            organizationId: ctx.organizationId,
            deletedAt: null,
            version: expectedVersion,
          },
          data: {
            ...(data.name === undefined ? {} : { name: data.name }),
            ...(data.slug === undefined ? {} : { slug: data.slug }),
            ...(data.description === undefined ? {} : { description: data.description }),
            ...(reparenting ? { parentId: data.parentId } : {}),
            ...(data.sortOrder === undefined ? {} : { sortOrder: data.sortOrder }),
            ...(data.isActive === undefined ? {} : { isActive: data.isActive }),
            path,
            depth,
            version: { increment: 1 },
          },
        })
        if (updated.count === 0) throw new PreconditionFailedError()

        // Rewrite descendants so path and depth stay consistent with the tree.
        if (path !== before.path) {
          const descendants = await tx.category.findMany({
            where: { organizationId: ctx.organizationId, path: { startsWith: `${before.path}/` } },
            select: { id: true, path: true },
          })
          for (const d of descendants) {
            const suffix = d.path.slice(before.path.length)
            const nextPath = `${path}${suffix}`
            await tx.category.update({
              where: { id: d.id },
              data: { path: nextPath, depth: nextPath.split('/').filter(Boolean).length - 1 },
            })
          }
        }

        const after = await tx.category.findUniqueOrThrow({ where: { id }, select: categorySelect })
        await writeAudit(tx, {
          organizationId: ctx.organizationId,
          actorId: ctx.actorId,
          requestId: ctx.requestId,
          entityType: 'Category',
          entityId: id,
          action: 'category.updated',
          before,
          after,
        })
        return after
      })
    } catch (error) {
      return conflictOnUnique(error)
    }
  },

  /** Soft delete. Refuses while the category still holds children or products. */
  async softDelete(ctx: MutationCtx, id: string, expectedVersion: number): Promise<CategoryRecord> {
    return prisma.$transaction(async (tx) => {
      const before = await tx.category.findFirst({
        where: { id, organizationId: ctx.organizationId, deletedAt: null },
        select: categorySelect,
      })
      if (!before) throw new NotFoundError('Category not found.')

      const children = await tx.category.count({ where: { parentId: id, deletedAt: null } })
      if (children > 0) throw new ConflictError('Remove the sub-categories first.')

      const products = await tx.product.count({ where: { categoryId: id, deletedAt: null } })
      if (products > 0) throw new ConflictError('Reassign the products in this category first.')

      const updated = await tx.category.updateMany({
        where: {
          id,
          organizationId: ctx.organizationId,
          deletedAt: null,
          version: expectedVersion,
        },
        data: { deletedAt: new Date(), version: { increment: 1 } },
      })
      if (updated.count === 0) throw new PreconditionFailedError()

      const after = await tx.category.findUniqueOrThrow({ where: { id }, select: categorySelect })
      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.actorId,
        requestId: ctx.requestId,
        entityType: 'Category',
        entityId: id,
        action: 'category.deleted',
        before,
        after,
      })
      return after
    })
  },

  async restore(ctx: MutationCtx, id: string, expectedVersion: number): Promise<CategoryRecord> {
    return prisma.$transaction(async (tx) => {
      const before = await tx.category.findFirst({
        where: { id, organizationId: ctx.organizationId, NOT: { deletedAt: null } },
        select: categorySelect,
      })
      if (!before) throw new NotFoundError('Deleted category not found.')

      const updated = await tx.category.updateMany({
        where: { id, organizationId: ctx.organizationId, version: expectedVersion },
        data: { deletedAt: null, version: { increment: 1 } },
      })
      if (updated.count === 0) throw new PreconditionFailedError()

      const after = await tx.category.findUniqueOrThrow({ where: { id }, select: categorySelect })
      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.actorId,
        requestId: ctx.requestId,
        entityType: 'Category',
        entityId: id,
        action: 'category.restored',
        before,
        after,
      })
      return after
    })
  },
}

export type CategoryRepository = typeof categoryRepository
