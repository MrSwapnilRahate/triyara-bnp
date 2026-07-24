import { updateCategorySchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { enforceWriteLimit, etag, ok, parseBody, requireIfMatch, route } from '@/lib/api'
import { categoryService } from '@/lib/product-service'

type Params = { params: Promise<{ id: string }> }

export function PATCH(req: Request, { params }: Params) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { id } = await params
    const version = requireIfMatch(req)
    const dto = await parseBody(req, updateCategorySchema)
    const cat = await categoryService.update({ ...auth, requestId }, id, dto, version)
    return ok(cat, { requestId, etag: etag(cat.version) })
  })
}

export function DELETE(req: Request, { params }: Params) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { id } = await params
    const version = requireIfMatch(req)
    const cat = await categoryService.remove({ ...auth, requestId }, id, version)
    return ok(cat, { requestId, etag: etag(cat.version) })
  })
}
