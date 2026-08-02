import { presignRegistrationUploadSchema } from '@triyara/validation'

import { ok, parseBody, route } from '@/lib/api'
import { enforcePublicUploadLimit } from '@/lib/public-rate-limit'
import { supplierRegistrationService } from '@/lib/supplier-registration-service'

// POST /api/public/supplier-registration/presign
//
// Issues an upload target for a registrant who has no account. Reuses the
// platform storage pipeline unchanged — the same `StorageProvider`, the same
// HMAC-signed PUT target, the same MIME allow-list and the same size ceiling
// the authenticated document upload uses. A public caller gets no wider
// latitude over what may be written to our storage than a member of staff.
export function POST(req: Request) {
  return route(req, async (requestId) => {
    enforcePublicUploadLimit(req)
    const dto = await parseBody(req, presignRegistrationUploadSchema)
    const presigned = await supplierRegistrationService.presign({ requestId }, dto)
    return ok(presigned, { requestId, status: 201 })
  })
}
