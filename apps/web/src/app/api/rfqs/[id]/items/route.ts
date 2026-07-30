import { replaceRfqItemsSchema } from '@triyara/validation'
import { z } from 'zod'

import { requireAuth } from '@/auth/context'
import { enforceWriteLimit, etag, ok, parseBody, requireIfMatch, route } from '@/lib/api'
import { rfqService } from '@/lib/rfq-service'

type Ctx = { params: Promise<{ id: string }> }

// The service accepts a revision reason; the base schema does not carry one, so
// the API adds it rather than leaving revisions without a stated cause.
const reviseItemsSchema = replaceRfqItemsSchema.extend({
  reason: z.string().trim().max(500).optional(),
})

// GET /api/rfqs/:id/items - the RFQ's lines, in line-number order.
export function GET(req: Request, { params }: Ctx) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const { id } = await params
    const rfq = await rfqService.get({ ...auth, requestId }, id)
    return ok(rfq.items, {
      requestId,
      meta: { rfqId: id, rfqNumber: rfq.rfqNumber, status: rfq.status, count: rfq.items.length },
    })
  })
}

// POST /api/rfqs/:id/items - REPLACES the line set and cuts a revision. Not an
// append: an RFQ's lines are quoted as a set, so they version as a set. Requires
// If-Match, because replacing lines is a mutation of the RFQ itself.
export function POST(req: Request, { params }: Ctx) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { id } = await params
    const expectedVersion = requireIfMatch(req)
    const dto = await parseBody(req, reviseItemsSchema)
    const rfq = await rfqService.reviseItems(
      { ...auth, requestId },
      id,
      expectedVersion,
      dto,
      dto.reason,
    )
    return ok(rfq.items, {
      requestId,
      status: 201,
      etag: etag(rfq.version),
      meta: { rfqId: id, revision: rfq.currentRevision, count: rfq.items.length },
    })
  })
}
