import { presignRegistrationUploadSchema } from '@triyara/validation'

import { ok, parseBody, route } from '@/lib/api'
import { buyerRegistrationService } from '@/lib/buyer-registration-service'
import { enforcePublicUploadLimit } from '@/lib/public-rate-limit'

// POST /api/public/buyer-registration/presign
//
// Reuses the supplier presign CONTRACT unchanged — same schema, same allow-list,
// same ceiling — because the question "may this file be written to our storage"
// has one answer regardless of which form is asking.
export function POST(req: Request) {
  return route(req, async (requestId) => {
    enforcePublicUploadLimit(req)
    const dto = await parseBody(req, presignRegistrationUploadSchema)
    const presigned = await buyerRegistrationService.presign({ requestId }, dto)
    return ok(presigned, { requestId, status: 201 })
  })
}
