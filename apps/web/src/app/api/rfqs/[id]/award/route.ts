import { rfqAwardSchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { enforceWriteLimit, etag, ok, parseBody, requireIfMatch, route } from '@/lib/api'
import { rfqService } from '@/lib/rfq-service'

type Ctx = { params: Promise<{ id: string }> }

// POST /api/rfqs/:id/award - Awards the sourcing round to one supplier.
// Requires If-Match: two reviewers awarding at once must not both win.
// Authorization: ADMIN only (`manage Account`) - committing to a supplier is
// not the same authority as editing the RFQ.
// Irreversible in Stage-1: there is no un-award endpoint.
export function POST(req: Request, { params }: Ctx) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { id } = await params
    const expectedVersion = requireIfMatch(req)
    const dto = await parseBody(req, rfqAwardSchema)
    const rfq = await rfqService.award(
      { ...auth, requestId },
      id,
      expectedVersion,
      dto.participationId,
    )
    return ok(rfq, {
      requestId,
      etag: etag(rfq.version),
      meta: { status: rfq.status, awardedSupplierId: rfq.awardedSupplierId },
    })
  })
}
