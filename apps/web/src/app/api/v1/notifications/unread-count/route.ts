import { requireAuth } from '@/auth/context'
import { ok, route } from '@/lib/api'
import { notificationService } from '@/lib/notification-service'

export function GET(req: Request) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const count = await notificationService.unreadCount(auth)
    return ok({ count }, { requestId })
  })
}
