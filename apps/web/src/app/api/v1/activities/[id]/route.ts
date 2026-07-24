import { requireAuth } from '@/auth/context'
import { activityService } from '@/lib/activity-service'
import { ok, route } from '@/lib/api'

type Params = { params: Promise<{ id: string }> }

export function GET(req: Request, { params }: Params) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const { id } = await params
    const activity = await activityService.get(auth, id)
    return ok(activity, { requestId })
  })
}
