import { listActivitiesQuerySchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { activityService } from '@/lib/activity-service'
import { ok, parseQuery, route } from '@/lib/api'

type Params = { params: Promise<{ id: string }> }

export function GET(req: Request, { params }: Params) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const { id } = await params
    const query = parseQuery(new URL(req.url).searchParams, listActivitiesQuerySchema)
    const result = await activityService.listForAccount(auth, id, query)
    return ok(result.items, {
      requestId,
      meta: {
        pagination: { limit: query.limit, nextCursor: result.nextCursor, hasMore: result.hasMore },
      },
    })
  })
}
