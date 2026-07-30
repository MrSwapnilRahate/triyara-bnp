import { listResponsesQuerySchema, submitResponseSchema } from '@triyara/validation'
import { z } from 'zod'

import { requireAuth } from '@/auth/context'
import { enforceWriteLimit, ok, parseBody, parseQuery, route } from '@/lib/api'
import { rfqSupplierService } from '@/lib/rfq-service'

type Ctx = { params: Promise<{ id: string }> }

// A bid is submitted against a supplier's INVITATION, so the body names the
// participation. The service verifies it belongs to the RFQ in the path.
const submitForRfqSchema = submitResponseSchema.extend({
  rfqSupplierId: z.string().min(1),
})

// GET /api/rfqs/:id/responses - every bid on this RFQ, cheapest line first.
// Current revisions only unless `currentOnly=false`.
export function GET(req: Request, { params }: Ctx) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const { id } = await params
    const query = parseQuery(new URL(req.url).searchParams, listResponsesQuerySchema)
    const result = await rfqSupplierService.listResponsesForRfq({ ...auth, requestId }, id, query)
    return ok(result.items, {
      requestId,
      meta: {
        rfqId: id,
        pagination: { limit: query.limit, nextCursor: result.nextCursor },
        filters: {
          rfqItemId: query.rfqItemId ?? null,
          rfqSupplierId: query.rfqSupplierId ?? null,
          currentOnly: query.currentOnly ?? 'true',
        },
      },
    })
  })
}

// POST /api/rfqs/:id/responses - submit or re-submit a supplier's bid. A
// re-submission supersedes the previous one; lateness is stamped at submit time.
export function POST(req: Request, { params }: Ctx) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { id } = await params
    const { rfqSupplierId, ...dto } = await parseBody(req, submitForRfqSchema)
    const result = await rfqSupplierService.submitResponseForRfq(
      { ...auth, requestId },
      id,
      rfqSupplierId,
      dto,
    )
    return ok(result, {
      requestId,
      status: 201,
      meta: { rfqId: id, rfqSupplierId, lines: result.lines.length },
    })
  })
}
