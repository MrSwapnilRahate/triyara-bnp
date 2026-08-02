import { updateSupplierCertificationSchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { enforceWriteLimit, etag, ok, parseBody, requireIfMatch, route } from '@/lib/api'
import { supplierCertificationService } from '@/lib/supplier-master-service'

type Ctx = { params: Promise<{ id: string; certificationId: string }> }

// PATCH /api/suppliers/:id/certifications/:certificationId
//
// Requires If-Match. A certificate's expiry and status are exactly the fields
// two people update from two different renewal emails, so the second writer is
// told rather than silently overwriting the first.
export function PATCH(req: Request, { params }: Ctx) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { id, certificationId } = await params
    const expectedVersion = requireIfMatch(req)
    const dto = await parseBody(req, updateSupplierCertificationSchema)
    const certification = await supplierCertificationService.update(
      { ...auth, requestId },
      id,
      certificationId,
      expectedVersion,
      dto,
    )
    return ok(certification, { requestId, etag: etag(certification.version) })
  })
}

// DELETE /api/suppliers/:id/certifications/:certificationId - soft delete.
export function DELETE(req: Request, { params }: Ctx) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { id, certificationId } = await params
    const expectedVersion = requireIfMatch(req)
    const certification = await supplierCertificationService.remove(
      { ...auth, requestId },
      id,
      certificationId,
      expectedVersion,
    )
    return ok(certification, { requestId, etag: etag(certification.version) })
  })
}
