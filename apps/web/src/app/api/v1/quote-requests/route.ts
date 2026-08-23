import { listQuoteRequestsQuerySchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { ok, parseQuery, route } from '@/lib/api'
import { quoteRequestService } from '@/lib/quote-request-service'

// GET /api/v1/quote-requests — the internal intake queue.
//
// Read only. There is no POST: the sole way an intake record comes into being is
// a member of the public submitting one through the public endpoint. An operator
// who wants to raise sourcing work by hand creates an RFQ directly.
export function GET(req: Request) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const query = parseQuery(new URL(req.url).searchParams, listQuoteRequestsQuerySchema)
    const result = await quoteRequestService.list({ ...auth, requestId }, query)
    return ok(result.items, {
      requestId,
      meta: { pagination: { limit: query.limit, nextCursor: result.nextCursor } },
    })
  })
}
