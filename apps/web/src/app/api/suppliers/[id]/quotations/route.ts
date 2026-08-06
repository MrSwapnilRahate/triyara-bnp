import { supplierHistoryQuerySchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { ok, parseQuery, route } from '@/lib/api'
import { supplierMatchingService } from '@/lib/supplier-master-service'

type Ctx = { params: Promise<{ id: string }> }

// GET /api/suppliers/:id/quotations - what this supplier was costed into
//
// Reads QuotationSourceOption, so a row is one costed line rather than a whole
// quotation. `isSelected` is the fact worth reading: quoted often but chosen
// rarely says something a count of appearances does not.
export function GET(req: Request, { params }: Ctx) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const { id } = await params
    const query = parseQuery(new URL(req.url).searchParams, supplierHistoryQuerySchema)
    const result = await supplierMatchingService.quotations({ ...auth, requestId }, id, query)
    return ok(result.items, {
      requestId,
      meta: { supplierId: id, pagination: { limit: query.limit, nextCursor: result.nextCursor } },
    })
  })
}
