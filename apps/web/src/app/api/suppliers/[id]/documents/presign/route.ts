import { presignSupplierDocumentSchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { enforceWriteLimit, ok, parseBody, route } from '@/lib/api'
import { supplierDocumentService } from '@/lib/supplier-master-service'

type Ctx = { params: Promise<{ id: string }> }

// POST /api/suppliers/:id/documents/presign - step one of the upload.
//
// Returns a short-lived URL the browser PUTs the file to directly, so a 20 MB
// catalogue never occupies an API request. Mirrors /api/v1/documents/presign,
// which does the same for the Account-scoped Document module.
export function POST(req: Request, { params }: Ctx) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { id } = await params
    const dto = await parseBody(req, presignSupplierDocumentSchema)
    const presigned = await supplierDocumentService.presign({ ...auth, requestId }, id, dto)
    return ok(presigned, { requestId })
  })
}
