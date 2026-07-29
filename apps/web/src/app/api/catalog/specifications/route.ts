import { listSpecificationsQuerySchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { ok, parseQuery, route } from '@/lib/api'
import { catalogReferenceService } from '@/lib/catalog-service'

// GET /api/catalog/specifications - specification definitions (master data)
export function GET(req: Request) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const query = parseQuery(new URL(req.url).searchParams, listSpecificationsQuerySchema)
    const result = await catalogReferenceService.listSpecifications({ ...auth, requestId }, query)
    return ok(result.items, {
      requestId,
      meta: { pagination: { limit: query.limit, nextCursor: result.nextCursor } },
    })
  })
}
