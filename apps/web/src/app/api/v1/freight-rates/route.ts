import { createFreightRateSchema, listFreightRatesQuerySchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { enforceWriteLimit, etag, ok, parseBody, parseQuery, route } from '@/lib/api'
import { freightRateService } from '@/lib/freight-service'

// GET  /api/v1/freight-rates -> this organization's rates
// POST /api/v1/freight-rates -> record a negotiated rate
//
// Organization-scoped, unlike /ports and /container-types: a rate is a
// commercial term. Money crosses as a STRING in both directions (ADR-0012).
export function GET(req: Request) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const query = parseQuery(new URL(req.url).searchParams, listFreightRatesQuerySchema)
    const result = await freightRateService.list({ ...auth, requestId }, query)
    return ok(result.items, {
      requestId,
      meta: { pagination: { limit: query.limit, nextCursor: result.nextCursor } },
    })
  })
}

export function POST(req: Request) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const dto = await parseBody(req, createFreightRateSchema)
    const rate = await freightRateService.create({ ...auth, requestId }, dto)
    return ok(rate, { requestId, status: 201, etag: etag(rate.version) })
  })
}
