import {
  createQuotationSchema,
  listQuotationsQuerySchema,
  replaceQuotationItemsSchema,
} from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { enforceWriteLimit, etag, ok, parseBody, parseQuery, route } from '@/lib/api'
import { quotationService } from '@/lib/quotation-service'

// A quotation is created with its lines in one request: its stored totals are
// computed from the lines, so a lineless quotation would carry a priced zero
// that means nothing.
const createQuotationWithItemsSchema = createQuotationSchema.extend({
  items: replaceQuotationItemsSchema.shape.items,
})

// GET  /api/quotations - list with search, filters, sorting, cursor paging
// POST /api/quotations - raise a quotation with its lines (ADMIN, EXPORT_MANAGER)
export function GET(req: Request) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const query = parseQuery(new URL(req.url).searchParams, listQuotationsQuerySchema)
    const result = await quotationService.list({ ...auth, requestId }, query)
    return ok(result.items, {
      requestId,
      meta: {
        pagination: { limit: query.limit, nextCursor: result.nextCursor },
        filters: {
          q: query.q ?? null,
          type: query.type ?? null,
          status: query.status ?? null,
          buyerId: query.buyerId ?? null,
          rfqId: query.rfqId ?? null,
          currency: query.currency ?? null,
          currentOnly: query.currentOnly ?? null,
          validBefore: query.validBefore ?? null,
          validAfter: query.validAfter ?? null,
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
    const { items, ...header } = await parseBody(req, createQuotationWithItemsSchema)
    const quotation = await quotationService.create({ ...auth, requestId }, header, { items })
    return ok(quotation, { requestId, status: 201, etag: etag(quotation.version) })
  })
}
