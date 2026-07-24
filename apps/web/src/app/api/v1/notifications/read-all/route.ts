import { requireAuth } from '@/auth/context'
import { ok, route } from '@/lib/api'
import { notificationService } from '@/lib/notification-service'

export function PATCH(req: Request) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const updated = await notificationService.markAllRead(auth)
    return ok({ updated }, { requestId })
  })
}
