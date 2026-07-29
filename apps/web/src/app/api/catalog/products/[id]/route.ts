import { updateProductSchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { enforceWriteLimit, etag, ok, parseBody, requireIfMatch, route } from '@/lib/api'
import { productService } from '@/lib/catalog-service'

type Ctx = { params: Promise<{ id: string }> }

// GET /api/catalog/products/:id  (?includeDeleted=true to read a soft-deleted row)
export function GET(req: Request, { params }: Ctx) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const { id } = await params
    const includeDeleted = new URL(req.url).searchParams.get('includeDeleted') === 'true'
    const product = await productService.get({ ...auth, requestId }, id, { includeDeleted })
    return ok(product, { requestId, etag: etag(product.version) })
  })
}

// PATCH /api/catalog/products/:id - requires If-Match (optimistic concurrency)
export function PATCH(req: Request, { params }: Ctx) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { id } = await params
    const expectedVersion = requireIfMatch(req)
    const dto = await parseBody(req, updateProductSchema)
    const product = await productService.update({ ...auth, requestId }, id, expectedVersion, dto)
    return ok(product, { requestId, etag: etag(product.version) })
  })
}

// DELETE /api/catalog/products/:id - soft delete, requires If-Match
export function DELETE(req: Request, { params }: Ctx) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { id } = await params
    const expectedVersion = requireIfMatch(req)
    const product = await productService.remove({ ...auth, requestId }, id, expectedVersion)
    return ok(product, { requestId, etag: etag(product.version) })
  })
}
