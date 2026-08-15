import { requireAuth } from '@/auth/context'
import { enforceWriteLimit, etag, ok, requireIfMatch, route } from '@/lib/api'
import { supplierMasterService } from '@/lib/supplier-master-service'

type Params = { params: Promise<{ id: string }> }

// POST /api/suppliers/:id/restore - undoes a soft delete. Authorized `update Supplier` - ADMIN and EXPORT_MANAGER.
//
// If-Match is required for the same reason it is on the delete: the version
// proves the caller is acting on the record they last read, so a stale tab
// cannot resurrect something another administrator has since changed.
export function POST(req: Request, { params }: Params) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { id } = await params
    const version = requireIfMatch(req)
    const record = await supplierMasterService.restore({ ...auth, requestId }, id, version)
    return ok(record, { requestId, etag: etag(record.version) })
  })
}
