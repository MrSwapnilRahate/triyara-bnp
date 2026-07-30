import { updateSupplierSchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { enforceWriteLimit, etag, ok, parseBody, requireIfMatch, route } from '@/lib/api'
import { supplierMasterService } from '@/lib/supplier-master-service'

type Ctx = { params: Promise<{ id: string }> }

// GET /api/suppliers/:id
export function GET(req: Request, { params }: Ctx) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const { id } = await params
    const supplier = await supplierMasterService.get({ ...auth, requestId }, id)
    return ok(supplier, { requestId, etag: etag(supplier.version) })
  })
}

// PATCH /api/suppliers/:id - requires If-Match (optimistic concurrency)
export function PATCH(req: Request, { params }: Ctx) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { id } = await params
    const expectedVersion = requireIfMatch(req)
    const dto = await parseBody(req, updateSupplierSchema)
    const supplier = await supplierMasterService.update(
      { ...auth, requestId },
      id,
      expectedVersion,
      dto,
    )
    return ok(supplier, { requestId, etag: etag(supplier.version) })
  })
}

// DELETE /api/suppliers/:id - soft delete, requires If-Match
export function DELETE(req: Request, { params }: Ctx) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { id } = await params
    const expectedVersion = requireIfMatch(req)
    const supplier = await supplierMasterService.remove({ ...auth, requestId }, id, expectedVersion)
    return ok(supplier, { requestId, etag: etag(supplier.version) })
  })
}
