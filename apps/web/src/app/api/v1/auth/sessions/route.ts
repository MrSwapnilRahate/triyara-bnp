import { listSessionsQuerySchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { ok, parseQuery, route } from '@/lib/api'
import { sessionService } from '@/lib/auth-extension-service'

// GET /api/v1/auth/sessions -> own sessions, or a user's with read:User
export function GET(req: Request) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const query = parseQuery(new URL(req.url).searchParams, listSessionsQuerySchema)
    const result = await sessionService.list({ ...auth, requestId }, query)
    return ok(result.items, {
      requestId,
      meta: { pagination: { limit: query.limit, nextCursor: result.nextCursor } },
    })
  })
}
