import {
  type NotificationChannel,
  type NotificationPriority,
  type NotificationType,
  Prisma,
} from '@prisma/client'

import { prisma } from '../client'
import { decodeCursor, encodeCursor } from './account.repository'

const feedSelect = {
  id: true,
  readAt: true,
  archivedAt: true,
  createdAt: true,
  notification: {
    select: {
      id: true,
      type: true,
      priority: true,
      title: true,
      body: true,
      actorId: true,
      entityType: true,
      entityId: true,
      accountId: true,
      eventName: true,
      metadata: true,
      createdAt: true,
    },
  },
} satisfies Prisma.NotificationRecipientSelect

export type NotificationFeedItem = Prisma.NotificationRecipientGetPayload<{
  select: typeof feedSelect
}>

export interface NewNotification {
  organizationId: string
  type: NotificationType
  priority: NotificationPriority
  actorId?: string | null
  entityType?: string | null
  entityId?: string | null
  accountId?: string | null
  eventName: string
  title: string
  body: string
  metadata?: Record<string, unknown>
}

export interface RecipientSpec {
  userId: string
  channels: NotificationChannel[]
}

export type NotificationFilter = 'all' | 'unread' | 'read' | 'archived'

export interface ListNotificationsParams {
  limit: number
  cursor?: string
  q?: string
  type?: NotificationType
  filter: NotificationFilter
}

export interface NotificationRepository {
  createWithRecipients(input: NewNotification, recipients: RecipientSpec[]): Promise<void>
  listForRecipient(
    orgId: string,
    userId: string,
    params: ListNotificationsParams,
  ): Promise<{ items: NotificationFeedItem[]; nextCursor: string | null; hasMore: boolean }>
  getForRecipient(orgId: string, userId: string, id: string): Promise<NotificationFeedItem | null>
  markRead(orgId: string, userId: string, id: string): Promise<number>
  markAllRead(orgId: string, userId: string): Promise<number>
  archive(orgId: string, userId: string, id: string): Promise<number>
  unreadCount(orgId: string, userId: string): Promise<number>
}

function filterWhere(filter: NotificationFilter): Prisma.NotificationRecipientWhereInput {
  switch (filter) {
    case 'unread':
      return { readAt: null, archivedAt: null }
    case 'read':
      return { readAt: { not: null }, archivedAt: null }
    case 'archived':
      return { archivedAt: { not: null } }
    default:
      return { archivedAt: null }
  }
}

export const notificationRepository: NotificationRepository = {
  async createWithRecipients(input, recipients) {
    if (recipients.length === 0) return
    await prisma.notification.create({
      data: {
        organizationId: input.organizationId,
        type: input.type,
        priority: input.priority,
        actorId: input.actorId,
        entityType: input.entityType,
        entityId: input.entityId,
        accountId: input.accountId,
        eventName: input.eventName,
        title: input.title,
        body: input.body,
        metadata:
          input.metadata === undefined
            ? Prisma.JsonNull
            : (input.metadata as Prisma.InputJsonValue),
        recipients: {
          create: recipients.map((r) => ({
            recipientId: r.userId,
            organizationId: input.organizationId,
            deliveries: {
              create: (r.channels.length ? r.channels : (['IN_APP'] as NotificationChannel[])).map(
                (ch) => ({
                  channel: ch,
                  status: ch === 'IN_APP' ? 'DELIVERED' : 'QUEUED',
                  attemptedAt: ch === 'IN_APP' ? new Date() : null,
                  deliveredAt: ch === 'IN_APP' ? new Date() : null,
                }),
              ),
            },
          })),
        },
      },
      select: { id: true },
    })
  },

  async listForRecipient(orgId, userId, params) {
    const where: Prisma.NotificationRecipientWhereInput = {
      organizationId: orgId,
      recipientId: userId,
      ...filterWhere(params.filter),
      ...(params.type || params.q
        ? {
            notification: {
              ...(params.type ? { type: params.type } : {}),
              ...(params.q
                ? {
                    OR: [
                      { title: { contains: params.q, mode: 'insensitive' } },
                      { body: { contains: params.q, mode: 'insensitive' } },
                    ],
                  }
                : {}),
            },
          }
        : {}),
    }
    const cursorId = params.cursor ? decodeCursor(params.cursor) : undefined
    const rows = await prisma.notificationRecipient.findMany({
      where,
      select: feedSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: params.limit + 1,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
    })
    const hasMore = rows.length > params.limit
    const items = hasMore ? rows.slice(0, params.limit) : rows
    const last = items.at(-1)
    return { items, hasMore, nextCursor: hasMore && last ? encodeCursor(last.id) : null }
  },

  getForRecipient(orgId, userId, id) {
    return prisma.notificationRecipient.findFirst({
      where: { id, organizationId: orgId, recipientId: userId },
      select: feedSelect,
    })
  },

  async markRead(orgId, userId, id) {
    const res = await prisma.notificationRecipient.updateMany({
      where: { id, organizationId: orgId, recipientId: userId, readAt: null },
      data: { readAt: new Date() },
    })
    return res.count
  },

  async markAllRead(orgId, userId) {
    const res = await prisma.notificationRecipient.updateMany({
      where: { organizationId: orgId, recipientId: userId, readAt: null, archivedAt: null },
      data: { readAt: new Date() },
    })
    return res.count
  },

  async archive(orgId, userId, id) {
    const res = await prisma.notificationRecipient.updateMany({
      where: { id, organizationId: orgId, recipientId: userId },
      data: { archivedAt: new Date(), readAt: new Date() },
    })
    return res.count
  },

  unreadCount(orgId, userId) {
    return prisma.notificationRecipient.count({
      where: { organizationId: orgId, recipientId: userId, readAt: null, archivedAt: null },
    })
  },
}
