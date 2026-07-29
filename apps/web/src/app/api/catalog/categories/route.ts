import { createCategorySchema, listCategoriesQuerySchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { enforceWriteLimit, etag, ok, parseBody, parseQuery, route } from '@/lib/api'
import { categoryService } from '@/lib/catalog-service'

// GET  /api/catalog/categories  - cursor-paginated list
// POST /api/catalog/categories  - create (ADMIN)
export function GET(req: Request) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const query = parseQuery(new URL(req.url).searchParams, listCategoriesQuerySchema)
    const result = await categoryService.list({ ...auth, requestId }, query)
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
    const dto = await parseBody(req, createCategorySchema)
    const category = await categoryService.create({ ...auth, requestId }, dto)
    return ok(category, { requestId, status: 201, etag: etag(category.version) })
  })
}
