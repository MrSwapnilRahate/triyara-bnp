import { searchSuppliersQuerySchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { ok, parseQuery, route } from '@/lib/api'
import { supplierMasterService } from '@/lib/supplier-master-service'

// GET /api/suppliers/search?q= - typeahead picker.
//
// A static segment, so Next.js resolves it before /api/suppliers/[id]; a
// supplier can never be named "search" in a way that shadows this route.
export function GET(req: Request) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const query = parseQuery(new URL(req.url).searchParams, searchSuppliersQuerySchema)
    const hits = await supplierMasterService.search({ ...auth, requestId }, query)
    return ok(hits, {
      requestId,
      meta: {
        query: query.q,
        count: hits.length,
        limit: query.limit,
        filters: {
          status: query.status ?? null,
          productId: query.productId ?? null,
          country: query.country ?? null,
        },
      },
    })
  })
}
