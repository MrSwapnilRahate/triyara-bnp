import { supplierRegistrationSchema } from '@triyara/validation'

import { ok, parseBody, route } from '@/lib/api'
import { enforcePublicSubmitLimit } from '@/lib/public-rate-limit'
import { supplierRegistrationService } from '@/lib/supplier-registration-service'

// POST /api/public/supplier-registration
//
// UNAUTHENTICATED by design: a supplier we have never met is the entire point.
// There is no `requireAuth` here, so the controls that would normally follow
// from a session are replaced explicitly:
//
//   - rate limiting keys on the client address rather than a user id
//   - the organization comes from configuration, never from the body
//   - the response says only that the submission landed
//
// The last one matters. Echoing the created record back would tell an anonymous
// caller our internal supplier reference and confirm what we stored; a
// submitter needs to know it worked, and nothing else.
export function POST(req: Request) {
  return route(req, async (requestId) => {
    enforcePublicSubmitLimit(req)
    const dto = await parseBody(req, supplierRegistrationSchema)
    const supplier = await supplierRegistrationService.submit({ requestId }, dto)
    return ok({ submitted: true, companyName: supplier.companyName }, { requestId, status: 201 })
  })
}
