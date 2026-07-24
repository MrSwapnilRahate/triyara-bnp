import { requireAuth } from '@/auth/context'
import { ok, route } from '@/lib/api'
import { notificationService } from '@/lib/notification-service'

type Params = { params: Promise<{ id: string }> }

export function GET(req: Request, { params }: Params) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const { id } = await params
    const n = await notificationService.get(auth, id)
    return ok(n, { requestId })
  })
}
