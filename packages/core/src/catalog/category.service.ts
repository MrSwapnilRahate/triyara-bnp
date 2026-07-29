import { assertAbility, type AuthContext } from '@triyara/auth'
import type {
  CategoryListResult,
  CategoryRecord,
  CategoryRepository,
  MutationCtx,
} from '@triyara/db'
import { type EventBus, makeEvent } from '@triyara/events'
import { ConflictError, NotFoundError } from '@triyara/lib'
import type { CreateCategoryDto, ListCategoriesQuery, UpdateCategoryDto } from '@triyara/validation'

// Category service (TRY-BNP-CATALOG-S1). Catalog data is authorized as
// `ReferenceData`: readable by every role, writable by ADMIN only under the
// frozen ability model.

export type CategoryServiceCtx = AuthContext & { requestId?: string }

export interface CategoryServiceDeps {
  repo: CategoryRepository
  events: EventBus
}

export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 200)
}

function mutationCtx(ctx: CategoryServiceCtx): MutationCtx {
  return { actorId: ctx.user.id, organizationId: ctx.organizationId, requestId: ctx.requestId }
}

export function createCategoryService({ repo, events }: CategoryServiceDeps) {
  async function emit(ctx: CategoryServiceCtx, type: string, data: Record<string, unknown>) {
    await events.emit(
      makeEvent({ type, organizationId: ctx.organizationId, actorId: ctx.user.id, data }),
    )
  }

  return {
    async list(ctx: CategoryServiceCtx, query: ListCategoriesQuery): Promise<CategoryListResult> {
      assertAbility(ctx, 'read', 'ReferenceData')
      return repo.list({
        organizationId: ctx.organizationId,
        parentId: query.parentId,
        pathPrefix: query.pathPrefix,
        isActive: query.isActive === undefined ? undefined : query.isActive === 'true',
        q: query.q,
        limit: query.limit,
        cursor: query.cursor,
      })
    },

    async get(ctx: CategoryServiceCtx, id: string): Promise<CategoryRecord> {
      assertAbility(ctx, 'read', 'ReferenceData')
      const category = await repo.findById(ctx.organizationId, id)
      if (!category) throw new NotFoundError('Category not found.')
      return category
    },

    async create(ctx: CategoryServiceCtx, dto: CreateCategoryDto): Promise<CategoryRecord> {
      assertAbility(ctx, 'create', 'ReferenceData')
      const slug = dto.slug ?? slugify(dto.name)
      if (await repo.findBySlug(ctx.organizationId, slug)) {
        throw new ConflictError(`A category with the slug "${slug}" already exists.`)
      }

      const category = await repo.create(mutationCtx(ctx), { ...dto, slug })
      await emit(ctx, 'category.created', { categoryId: category.id, slug: category.slug })
      return category
    },

    async update(
      ctx: CategoryServiceCtx,
      id: string,
      expectedVersion: number,
      dto: UpdateCategoryDto,
    ): Promise<CategoryRecord> {
      assertAbility(ctx, 'update', 'ReferenceData')

      if (dto.slug) {
        const clash = await repo.findBySlug(ctx.organizationId, dto.slug)
        if (clash && clash.id !== id) {
          throw new ConflictError(`A category with the slug "${dto.slug}" already exists.`)
        }
      }

      const category = await repo.mutate(mutationCtx(ctx), id, expectedVersion, dto)
      await emit(ctx, 'category.updated', { categoryId: category.id, slug: category.slug })
      return category
    },

    async remove(
      ctx: CategoryServiceCtx,
      id: string,
      expectedVersion: number,
    ): Promise<CategoryRecord> {
      assertAbility(ctx, 'delete', 'ReferenceData')
      const category = await repo.softDelete(mutationCtx(ctx), id, expectedVersion)
      await emit(ctx, 'category.deleted', { categoryId: category.id })
      return category
    },

    async restore(
      ctx: CategoryServiceCtx,
      id: string,
      expectedVersion: number,
    ): Promise<CategoryRecord> {
      assertAbility(ctx, 'update', 'ReferenceData')
      const category = await repo.restore(mutationCtx(ctx), id, expectedVersion)
      await emit(ctx, 'category.restored', { categoryId: category.id })
      return category
    },
  }
}

export type CategoryService = ReturnType<typeof createCategoryService>
