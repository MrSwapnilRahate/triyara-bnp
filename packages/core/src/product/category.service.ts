import { assertAbility, type AuthContext } from '@triyara/auth'
import type {
  CategoryData,
  CategoryRecord,
  MutationCtx,
  ProductCategoryRepository,
} from '@triyara/db'
import { type EventBus, makeEvent } from '@triyara/events'
import { ConflictError, NotFoundError } from '@triyara/lib'
import type { CreateCategoryDto, UpdateCategoryDto } from '@triyara/validation'

import { slugify } from './product.service'

export type CategoryServiceCtx = AuthContext & { requestId?: string }

export function createCategoryService({
  repo,
  events,
}: {
  repo: ProductCategoryRepository
  events: EventBus
}) {
  function mctx(ctx: CategoryServiceCtx): MutationCtx {
    return { actorId: ctx.user.id, organizationId: ctx.organizationId, requestId: ctx.requestId }
  }
  async function emit(ctx: CategoryServiceCtx, type: string, data: Record<string, unknown>) {
    await events.emit(
      makeEvent({ type, organizationId: ctx.organizationId, actorId: ctx.user.id, data }),
    )
  }

  return {
    async list(ctx: CategoryServiceCtx, includeDeleted?: boolean): Promise<CategoryRecord[]> {
      assertAbility(ctx, 'read', 'ReferenceData')
      return repo.list(ctx.organizationId, includeDeleted)
    },

    async create(ctx: CategoryServiceCtx, dto: CreateCategoryDto): Promise<CategoryRecord> {
      assertAbility(ctx, 'create', 'ReferenceData')
      const slug = dto.slug ?? slugify(dto.name)
      if (await repo.findBySlug(ctx.organizationId, slug))
        throw new ConflictError('Category slug already in use.')
      if (dto.parentId) {
        const parent = await repo.findById(ctx.organizationId, dto.parentId)
        if (!parent || parent.deletedAt) throw new NotFoundError('Parent category not found.')
      }
      const cat = await repo.create(mctx(ctx), {
        name: dto.name,
        slug,
        parentId: dto.parentId,
        displayOrder: dto.displayOrder,
      })
      await emit(ctx, 'category.created', { categoryId: cat.id })
      return cat
    },

    async update(
      ctx: CategoryServiceCtx,
      id: string,
      dto: UpdateCategoryDto,
      expectedVersion: number,
    ): Promise<CategoryRecord> {
      assertAbility(ctx, 'update', 'ReferenceData')
      if (dto.slug) {
        const bySlug = await repo.findBySlug(ctx.organizationId, dto.slug)
        if (bySlug && bySlug.id !== id) throw new ConflictError('Category slug already in use.')
      }
      if (dto.parentId) {
        if (dto.parentId === id) throw new ConflictError('A category cannot be its own parent.')
        const parent = await repo.findById(ctx.organizationId, dto.parentId)
        if (!parent || parent.deletedAt) throw new NotFoundError('Parent category not found.')
      }
      const data: CategoryData = { ...dto }
      const cat = await repo.mutate(mctx(ctx), id, expectedVersion, data, 'category.updated')
      await emit(ctx, 'category.updated', { categoryId: id })
      return cat
    },

    async remove(
      ctx: CategoryServiceCtx,
      id: string,
      expectedVersion: number,
    ): Promise<CategoryRecord> {
      assertAbility(ctx, 'delete', 'ReferenceData')
      const cat = await repo.softDelete(mctx(ctx), id, expectedVersion)
      await emit(ctx, 'category.deleted', { categoryId: id })
      return cat
    },
  }
}

export type CategoryService = ReturnType<typeof createCategoryService>
