import { reviewQuoteRequestSchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { enforceWriteLimit, etag, ok, parseBody, requireIfMatch, route } from '@/lib/api'
import { quoteRequestService } from '@/lib/quote-request-service'

type Params = { params: Promise<{ id: string }> }

// GET /api/v1/quote-requests/:id
export function GET(req: Request, { params }: Params) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const { id } = await params
    const found = await quoteRequestService.get({ ...auth, requestId }, id)
    return ok(found, { requestId, etag: etag(found.version) })
  })
}

// PATCH /api/v1/quote-requests/:id — triage.
//
// If-Match required, like every other mutable record here: two operators
// triaging the same enquiry is the exact race optimistic concurrency exists for.
export function PATCH(req: Request, { params }: Params) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { id } = await params
    const expectedVersion = requireIfMatch(req)
    const dto = await parseBody(req, reviewQuoteRequestSchema)
    const updated = await quoteRequestService.review(
      { ...auth, requestId },
      id,
      expectedVersion,
      dto,
    )
    return ok(updated, { requestId, etag: etag(updated.version) })
  })
}
