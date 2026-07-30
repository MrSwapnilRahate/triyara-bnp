import { supplierFacetQuerySchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { ok, parseQuery, route } from '@/lib/api'
import { supplierMasterService } from '@/lib/supplier-master-service'

// GET /api/suppliers/countries - filter vocabulary for `?country=`.
// Reports the countries this tenant actually sources from, with counts, rather
// than the 249 ISO codes of which most would be empty.
export function GET(req: Request) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const query = parseQuery(new URL(req.url).searchParams, supplierFacetQuerySchema)
    const countries = await supplierMasterService.countries({ ...auth, requestId }, query)
    return ok(countries, {
      requestId,
      meta: {
        count: countries.length,
        includeDeleted: query.includeDeleted === 'true',
      },
    })
  })
}
