import type { AuthContext } from '@triyara/auth'
import type { NotificationFeedItem, NotificationRepository } from '@triyara/db'
import { NotFoundError } from '@triyara/lib'
import type { ListNotificationsQuery } from '@triyara/validation'

export type NotificationServiceCtx = AuthContext

export function createNotificationService({ repo }: { repo: NotificationRepository }) {
  return {
    list(
      ctx: NotificationServiceCtx,
      query: ListNotificationsQuery,
    ): Promise<{ items: NotificationFeedItem[]; nextCursor: string | null; hasMore: boolean }> {
      return repo.listForRecipient(ctx.organizationId, ctx.user.id, {
        limit: query.limit,
        cursor: query.cursor,
        q: query.q,
        type: query.type,
        filter: query.filter,
      })
    },
    async get(ctx: NotificationServiceCtx, id: string): Promise<NotificationFeedItem> {
      const n = await repo.getForRecipient(ctx.organizationId, ctx.user.id, id)
      if (!n) throw new NotFoundError('Notification not found.')
      return n
    },
    markRead(ctx: NotificationServiceCtx, id: string): Promise<number> {
      return repo.markRead(ctx.organizationId, ctx.user.id, id)
    },
    markAllRead(ctx: NotificationServiceCtx): Promise<number> {
      return repo.markAllRead(ctx.organizationId, ctx.user.id)
    },
    archive(ctx: NotificationServiceCtx, id: string): Promise<number> {
      return repo.archive(ctx.organizationId, ctx.user.id, id)
    },
    unreadCount(ctx: NotificationServiceCtx): Promise<number> {
      return repo.unreadCount(ctx.organizationId, ctx.user.id)
    },
  }
}
export type NotificationService = ReturnType<typeof createNotificationService>
