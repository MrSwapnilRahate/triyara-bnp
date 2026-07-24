import { assertAbility, type AuthContext } from '@triyara/auth'
import type { ActivityRecord, ActivityRepository, ListActivitiesParams } from '@triyara/db'
import { NotFoundError } from '@triyara/lib'
import type { ListActivitiesQuery } from '@triyara/validation'

export type ActivityServiceCtx = AuthContext

export function createActivityService({ repo }: { repo: ActivityRepository }) {
  function toParams(
    query: ListActivitiesQuery,
    override: Partial<ListActivitiesParams> = {},
  ): ListActivitiesParams {
    return {
      limit: query.limit,
      cursor: query.cursor,
      q: query.q,
      accountId: query.accountId,
      actorId: query.actorId,
      entityType: query.entityType,
      eventName: query.eventName,
      activityType: query.activityType,
      from: query.from,
      to: query.to,
      ...override,
    }
  }

  return {
    async list(
      ctx: ActivityServiceCtx,
      query: ListActivitiesQuery,
    ): Promise<{ items: ActivityRecord[]; nextCursor: string | null; hasMore: boolean }> {
      assertAbility(ctx, 'read', 'Activity')
      return repo.list(ctx.organizationId, toParams(query))
    },

    async listForAccount(ctx: ActivityServiceCtx, accountId: string, query: ListActivitiesQuery) {
      assertAbility(ctx, 'read', 'Activity')
      return repo.list(ctx.organizationId, toParams(query, { accountId }))
    },

    async get(ctx: ActivityServiceCtx, id: string): Promise<ActivityRecord> {
      assertAbility(ctx, 'read', 'Activity')
      const activity = await repo.findById(ctx.organizationId, id)
      if (!activity) throw new NotFoundError('Activity not found.')
      return activity
    },
  }
}

export type ActivityService = ReturnType<typeof createActivityService>
