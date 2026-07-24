import { listActivitiesQuerySchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { activityService } from '@/lib/activity-service'
import { ok, parseQuery, route } from '@/lib/api'

export function GET(req: Request) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const query = parseQuery(new URL(req.url).searchParams, listActivitiesQuerySchema)
    const result = await activityService.list(auth, query)
    return ok(result.items, {
      requestId,
      meta: {
        pagination: { limit: query.limit, nextCursor: result.nextCursor, hasMore: result.hasMore },
      },
    })
  })
}
