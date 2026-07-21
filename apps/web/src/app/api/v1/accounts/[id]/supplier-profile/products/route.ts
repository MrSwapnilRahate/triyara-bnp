import { addSupplierProductSchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { enforceWriteLimit, etag, ok, parseBody, requireIfMatch, route } from '@/lib/api'
import { supplierService } from '@/lib/supplier-service'

type Params = { params: Promise<{ id: string }> }

export function POST(req: Request, { params }: Params) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { id } = await params
    const version = requireIfMatch(req)
    const dto = await parseBody(req, addSupplierProductSchema)
    const profile = await supplierService.addProduct({ ...auth, requestId }, id, dto, version)
    return ok(profile, { requestId, status: 201, etag: etag(profile.version) })
  })
}
