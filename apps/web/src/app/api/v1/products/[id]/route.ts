import { updateProductSchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { enforceWriteLimit, etag, ok, parseBody, requireIfMatch, route } from '@/lib/api'
import { productService } from '@/lib/product-service'

type Params = { params: Promise<{ id: string }> }

export function GET(req: Request, { params }: Params) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const { id } = await params
    const includeDeleted = new URL(req.url).searchParams.get('includeDeleted') === 'true'
    const product = await productService.get({ ...auth, requestId }, id, { includeDeleted })
    return ok(product, { requestId, etag: etag(product.version) })
  })
}

export function PATCH(req: Request, { params }: Params) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { id } = await params
    const version = requireIfMatch(req)
    const dto = await parseBody(req, updateProductSchema)
    const product = await productService.update({ ...auth, requestId }, id, dto, version)
    return ok(product, { requestId, etag: etag(product.version) })
  })
}

export function DELETE(req: Request, { params }: Params) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { id } = await params
    const version = requireIfMatch(req)
    const product = await productService.remove({ ...auth, requestId }, id, version)
    return ok(product, { requestId, etag: etag(product.version) })
  })
}
