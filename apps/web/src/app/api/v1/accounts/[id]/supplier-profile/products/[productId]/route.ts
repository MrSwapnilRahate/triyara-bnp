import { requireAuth } from '@/auth/context'
import { enforceWriteLimit, etag, ok, requireIfMatch, route } from '@/lib/api'
import { supplierService } from '@/lib/supplier-service'

type Params = { params: Promise<{ id: string; productId: string }> }

export function DELETE(req: Request, { params }: Params) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { id, productId } = await params
    const version = requireIfMatch(req)
    const profile = await supplierService.removeProduct(
      { ...auth, requestId },
      id,
      productId,
      version,
    )
    return ok(profile, { requestId, etag: etag(profile.version) })
  })
}
