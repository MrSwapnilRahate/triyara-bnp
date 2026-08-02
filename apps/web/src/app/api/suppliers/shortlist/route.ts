import { listSuppliersQuerySchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { ok, parseQuery, route } from '@/lib/api'
import { supplierMatchingService } from '@/lib/supplier-master-service'

// GET /api/suppliers/shortlist - supplier search with a readiness score
//
// The SAME query contract as GET /api/suppliers, deliberately: this is that
// search with scores attached, not a second search that could answer the same
// filters differently. Anything the supplier list can filter on, this can.
//
// Scores ride in `meta`, not merged into the items, so a supplier returned here
// is byte-identical to one returned anywhere else.
export function GET(req: Request) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const query = parseQuery(new URL(req.url).searchParams, listSuppliersQuerySchema)
    const result = await supplierMatchingService.shortlist({ ...auth, requestId }, query)

    return ok(result.items, {
      requestId,
      meta: {
        pagination: { limit: query.limit, nextCursor: result.nextCursor },
        scores: result.scores,
        filters: {
          q: query.q ?? null,
          status: query.status ?? null,
          country: query.country ?? null,
          productId: query.productId ?? null,
          maxMoq: query.maxMoq ?? null,
          certification: query.certification ?? null,
          packaging: query.packaging ?? null,
          paymentTerms: query.paymentTerms ?? null,
          exportCountry: query.exportCountry ?? null,
          isVerified: query.isVerified ?? null,
        },
      },
    })
  })
}
