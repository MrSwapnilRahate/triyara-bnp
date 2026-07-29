import { createProductSchema, listProductsQuerySchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { enforceWriteLimit, etag, ok, parseBody, parseQuery, route } from '@/lib/api'
import { productService } from '@/lib/catalog-service'

// GET  /api/catalog/products - list with search, filters, sorting, cursor paging
// POST /api/catalog/products - create (ADMIN)
export function GET(req: Request) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const query = parseQuery(new URL(req.url).searchParams, listProductsQuerySchema)
    const result = await productService.list({ ...auth, requestId }, query)
    return ok(result.items, {
      requestId,
      meta: {
        pagination: { limit: query.limit, nextCursor: result.nextCursor },
        filters: {
          q: query.q ?? null,
          categoryId: query.categoryId ?? null,
          categoryPathPrefix: query.categoryPathPrefix ?? null,
          status: query.status ?? null,
          brand: query.brand ?? null,
          countryOfOrigin: query.countryOfOrigin ?? null,
          hsCode: query.hsCode ?? null,
          tagId: query.tagId ?? null,
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
    const dto = await parseBody(req, createProductSchema)
    const product = await productService.create({ ...auth, requestId }, dto)
    return ok(product, { requestId, status: 201, etag: etag(product.version) })
  })
}
