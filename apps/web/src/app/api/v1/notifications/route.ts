import { listNotificationsQuerySchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { ok, parseQuery, route } from '@/lib/api'
import { notificationService } from '@/lib/notification-service'

export function GET(req: Request) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const query = parseQuery(new URL(req.url).searchParams, listNotificationsQuerySchema)
    const [result, unreadCount] = await Promise.all([
      notificationService.list(auth, query),
      notificationService.unreadCount(auth),
    ])
    return ok(result.items, {
      requestId,
      meta: {
        unreadCount,
        pagination: { limit: query.limit, nextCursor: result.nextCursor, hasMore: result.hasMore },
      },
    })
  })
}
