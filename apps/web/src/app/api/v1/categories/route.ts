import { createCategorySchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { enforceWriteLimit, etag, ok, parseBody, route } from '@/lib/api'
import { categoryService } from '@/lib/product-service'

export function GET(req: Request) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const includeDeleted = new URL(req.url).searchParams.get('includeDeleted') === 'true'
    const items = await categoryService.list(auth, includeDeleted)
    return ok(items, { requestId })
  })
}

export function POST(req: Request) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const dto = await parseBody(req, createCategorySchema)
    const cat = await categoryService.create({ ...auth, requestId }, dto)
    return ok(cat, { requestId, status: 201, etag: etag(cat.version) })
  })
}
