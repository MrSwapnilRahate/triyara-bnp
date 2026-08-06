import { supplierHistoryQuerySchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { ok, parseQuery, route } from '@/lib/api'
import { supplierMatchingService } from '@/lib/supplier-master-service'

type Ctx = { params: Promise<{ id: string }> }

// GET /api/suppliers/:id/rfqs - what we have asked this supplier for
//
// The inverse of GET /api/rfqs/:id/suppliers, which lists suppliers for an RFQ.
// Sourcing needs this direction: what has this supplier been asked for, and did
// they answer.
export function GET(req: Request, { params }: Ctx) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const { id } = await params
    const query = parseQuery(new URL(req.url).searchParams, supplierHistoryQuerySchema)
    const result = await supplierMatchingService.rfqs({ ...auth, requestId }, id, query)
    return ok(result.items, {
      requestId,
      meta: { supplierId: id, pagination: { limit: query.limit, nextCursor: result.nextCursor } },
    })
  })
}
