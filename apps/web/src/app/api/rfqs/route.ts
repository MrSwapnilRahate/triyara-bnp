import { createRfqSchema, listRfqsQuerySchema, replaceRfqItemsSchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { enforceWriteLimit, etag, ok, parseBody, parseQuery, route } from '@/lib/api'
import { rfqService } from '@/lib/rfq-service'

// An RFQ is created with its lines in one request: the service refuses an RFQ
// with no lines at approval, and a two-step create would leave an unusable
// record behind if the second call never arrived.
const createRfqWithItemsSchema = createRfqSchema.extend({
  items: replaceRfqItemsSchema.shape.items,
})

// GET  /api/rfqs - list with search, filters, sorting, cursor paging
// POST /api/rfqs - raise an RFQ with its lines (ADMIN, EXPORT_MANAGER)
export function GET(req: Request) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const query = parseQuery(new URL(req.url).searchParams, listRfqsQuerySchema)
    const result = await rfqService.list({ ...auth, requestId }, query)
    return ok(result.items, {
      requestId,
      meta: {
        pagination: { limit: query.limit, nextCursor: result.nextCursor },
        filters: {
          q: query.q ?? null,
          type: query.type ?? null,
          status: query.status ?? null,
          priority: query.priority ?? null,
          buyerId: query.buyerId ?? null,
          supplierId: query.supplierId ?? null,
          productId: query.productId ?? null,
          destinationCountry: query.destinationCountry ?? null,
          destinationPort: query.destinationPort ?? null,
          deadlineBefore: query.deadlineBefore ?? null,
          deadlineAfter: query.deadlineAfter ?? null,
          includeDeleted: query.includeDeleted ?? null,
        },
        sort: query.sort ?? '-createdAt',
      },
    })
  })
}

export function POST(req: Request) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { items, ...header } = await parseBody(req, createRfqWithItemsSchema)
    const rfq = await rfqService.create({ ...auth, requestId }, header, items)
    return ok(rfq, { requestId, status: 201, etag: etag(rfq.version) })
  })
}
