import { type ActivityType, Prisma } from '@prisma/client'

import { prisma } from '../client'
import { decodeCursor, encodeCursor } from './account.repository'

const activitySelect = {
  id: true,
  organizationId: true,
  accountId: true,
  actorId: true,
  actorType: true,
  entityType: true,
  entityId: true,
  eventName: true,
  activityType: true,
  description: true,
  metadata: true,
  createdAt: true,
} satisfies Prisma.ActivitySelect

export type ActivityRecord = Prisma.ActivityGetPayload<{ select: typeof activitySelect }>

export interface NewActivity {
  organizationId: string
  accountId?: string | null
  actorId?: string | null
  actorType: string
  entityType: string
  entityId?: string | null
  eventName: string
  activityType: ActivityType
  description: string
  metadata?: Record<string, unknown>
}

export interface ListActivitiesParams {
  limit: number
  cursor?: string
  q?: string
  accountId?: string
  actorId?: string
  entityType?: string
  eventName?: string
  activityType?: ActivityType
  from?: Date
  to?: Date
}

export interface ActivityRepository {
  create(input: NewActivity): Promise<ActivityRecord>
  findById(orgId: string, id: string): Promise<ActivityRecord | null>
  list(
    orgId: string,
    params: ListActivitiesParams,
  ): Promise<{ items: ActivityRecord[]; nextCursor: string | null; hasMore: boolean }>
}

export const activityRepository: ActivityRepository = {
  create(input) {
    return prisma.activity.create({
      data: {
        ...input,
        metadata:
          input.metadata === undefined
            ? Prisma.JsonNull
            : (input.metadata as Prisma.InputJsonValue),
      },
      select: activitySelect,
    })
  },

  findById(orgId, id) {
    return prisma.activity.findFirst({
      where: { id, organizationId: orgId },
      select: activitySelect,
    })
  },

  async list(orgId, params) {
    const where: Prisma.ActivityWhereInput = {
      organizationId: orgId,
      ...(params.accountId ? { accountId: params.accountId } : {}),
      ...(params.actorId ? { actorId: params.actorId } : {}),
      ...(params.entityType ? { entityType: params.entityType } : {}),
      ...(params.eventName ? { eventName: params.eventName } : {}),
      ...(params.activityType ? { activityType: params.activityType } : {}),
      ...(params.from || params.to
        ? {
            createdAt: {
              ...(params.from ? { gte: params.from } : {}),
              ...(params.to ? { lte: params.to } : {}),
            },
          }
        : {}),
      ...(params.q ? { description: { contains: params.q, mode: 'insensitive' } } : {}),
    }
    const cursorId = params.cursor ? decodeCursor(params.cursor) : undefined
    const rows = await prisma.activity.findMany({
      where,
      select: activitySelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: params.limit + 1,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
    })
    const hasMore = rows.length > params.limit
    const items = hasMore ? rows.slice(0, params.limit) : rows
    const last = items.at(-1)
    return { items, hasMore, nextCursor: hasMore && last ? encodeCursor(last.id) : null }
  },
}
