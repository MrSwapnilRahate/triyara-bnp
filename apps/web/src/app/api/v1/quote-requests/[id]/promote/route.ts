import { promoteQuoteRequestSchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { enforceWriteLimit, etag, ok, parseBody, requireIfMatch, route } from '@/lib/api'
import { quoteRequestService } from '@/lib/quote-request-service'

// POST /api/v1/quote-requests/:id/promote
//
// Turns a qualified enquiry into a real RFQ. The service authorizes on both
// `update QuoteRequest` and `create RFQ` - promoting is triaging a lead and
// raising an RFQ, and whoever does it must already be allowed to do each.
//
// This is the ONLY crossing from intake into the commercial workflow, and it is
// always a deliberate act by a signed-in operator.
export function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { id } = await params
    const expectedVersion = requireIfMatch(req)
    const dto = await parseBody(req, promoteQuoteRequestSchema)
    const result = await quoteRequestService.promote(
      { ...auth, requestId },
      id,
      expectedVersion,
      dto,
    )
    return ok(
      { quoteRequest: result.quoteRequest, rfqId: result.rfqId, rfqNumber: result.rfqNumber },
      { requestId, status: 201, etag: etag(result.quoteRequest.version) },
    )
  })
}
