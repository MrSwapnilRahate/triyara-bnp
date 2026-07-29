import { updateCategorySchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { enforceWriteLimit, etag, ok, parseBody, requireIfMatch, route } from '@/lib/api'
import { categoryService } from '@/lib/catalog-service'

type Ctx = { params: Promise<{ id: string }> }

// GET /api/catalog/categories/:id
export function GET(req: Request, { params }: Ctx) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const { id } = await params
    const category = await categoryService.get({ ...auth, requestId }, id)
    return ok(category, { requestId, etag: etag(category.version) })
  })
}

// PATCH /api/catalog/categories/:id - requires If-Match (optimistic concurrency)
export function PATCH(req: Request, { params }: Ctx) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { id } = await params
    const expectedVersion = requireIfMatch(req)
    const dto = await parseBody(req, updateCategorySchema)
    const category = await categoryService.update({ ...auth, requestId }, id, expectedVersion, dto)
    return ok(category, { requestId, etag: etag(category.version) })
  })
}

// DELETE /api/catalog/categories/:id - soft delete, requires If-Match
export function DELETE(req: Request, { params }: Ctx) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { id } = await params
    const expectedVersion = requireIfMatch(req)
    const category = await categoryService.remove({ ...auth, requestId }, id, expectedVersion)
    return ok(category, { requestId, etag: etag(category.version) })
  })
}
