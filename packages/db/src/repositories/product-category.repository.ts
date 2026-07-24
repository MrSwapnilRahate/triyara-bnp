import { Prisma } from '@prisma/client'
import { ConflictError, NotFoundError, PreconditionFailedError } from '@triyara/lib'

import { writeAudit } from '../audit'
import { prisma } from '../client'
import type { MutationCtx } from './account.repository'

const categorySelect = {
  id: true,
  organizationId: true,
  parentId: true,
  name: true,
  slug: true,
  displayOrder: true,
  isActive: true,
  version: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ProductCategorySelect

export type CategoryRecord = Prisma.ProductCategoryGetPayload<{ select: typeof categorySelect }>

export interface CategoryData {
  name?: string
  slug?: string
  parentId?: string | null
  displayOrder?: number
  isActive?: boolean
}

export interface ProductCategoryRepository {
  create(
    ctx: MutationCtx,
    data: { name: string; slug: string; parentId?: string | null; displayOrder?: number },
  ): Promise<CategoryRecord>
  findById(orgId: string, id: string): Promise<CategoryRecord | null>
  findBySlug(orgId: string, slug: string): Promise<CategoryRecord | null>
  list(orgId: string, includeDeleted?: boolean): Promise<CategoryRecord[]>
  mutate(
    ctx: MutationCtx,
    id: string,
    expectedVersion: number,
    data: CategoryData,
    action: string,
  ): Promise<CategoryRecord>
  softDelete(ctx: MutationCtx, id: string, expectedVersion: number): Promise<CategoryRecord>
}

export const productCategoryRepository: ProductCategoryRepository = {
  async create(ctx, data) {
    return prisma.$transaction(async (tx) => {
      const created = await tx.productCategory
        .create({
          data: {
            organizationId: ctx.organizationId,
            name: data.name,
            slug: data.slug,
            parentId: data.parentId,
            displayOrder: data.displayOrder ?? 0,
            createdById: ctx.actorId,
            updatedById: ctx.actorId,
          },
          select: categorySelect,
        })
        .catch((e) => {
          if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
            throw new ConflictError('A category with this slug already exists.')
          throw e
        })
      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.actorId,
        requestId: ctx.requestId,
        entityType: 'ProductCategory',
        entityId: created.id,
        action: 'category.created',
        after: created,
      })
      return created
    })
  },

  findById(orgId, id) {
    return prisma.productCategory.findFirst({
      where: { id, organizationId: orgId },
      select: categorySelect,
    })
  },

  findBySlug(orgId, slug) {
    return prisma.productCategory.findFirst({
      where: { organizationId: orgId, slug, deletedAt: null },
      select: categorySelect,
    })
  },

  list(orgId, includeDeleted) {
    return prisma.productCategory.findMany({
      where: { organizationId: orgId, ...(includeDeleted ? {} : { deletedAt: null }) },
      select: categorySelect,
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
    })
  },

  async mutate(ctx, id, expectedVersion, data, action) {
    return prisma.$transaction(async (tx) => {
      const before = await tx.productCategory.findFirst({
        where: { id, organizationId: ctx.organizationId, deletedAt: null },
        select: categorySelect,
      })
      if (!before) throw new NotFoundError('Category not found.')
      const res = await tx.productCategory
        .updateMany({
          where: {
            id,
            organizationId: ctx.organizationId,
            deletedAt: null,
            version: expectedVersion,
          },
          data: { ...data, updatedById: ctx.actorId, version: { increment: 1 } },
        })
        .catch((e) => {
          if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
            throw new ConflictError('A category with this slug already exists.')
          throw e
        })
      if (res.count === 0) throw new PreconditionFailedError()
      const after = await tx.productCategory.findFirstOrThrow({
        where: { id },
        select: categorySelect,
      })
      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.actorId,
        requestId: ctx.requestId,
        entityType: 'ProductCategory',
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
      const before = await tx.productCategory.findFirst({
        where: { id, organizationId: ctx.organizationId, deletedAt: null },
        select: categorySelect,
      })
      if (!before) throw new NotFoundError('Category not found.')
      const children = await tx.productCategory.count({ where: { parentId: id, deletedAt: null } })
      if (children > 0) throw new ConflictError('Cannot delete a category that has sub-categories.')
      const res = await tx.productCategory.updateMany({
        where: {
          id,
          organizationId: ctx.organizationId,
          deletedAt: null,
          version: expectedVersion,
        },
        data: { deletedAt: new Date(), version: { increment: 1 } },
      })
      if (res.count === 0) throw new PreconditionFailedError()
      const after = await tx.productCategory.findFirstOrThrow({
        where: { id },
        select: categorySelect,
      })
      await writeAudit(tx, {
        organizationId: ctx.organizationId,
        actorId: ctx.actorId,
        requestId: ctx.requestId,
        entityType: 'ProductCategory',
        entityId: id,
        action: 'category.deleted',
        before,
        after,
      })
      return after
    })
  },
}
