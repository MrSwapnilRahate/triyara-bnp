import { buyerRegistrationSchema } from '@triyara/validation'

import { ok, parseBody, route } from '@/lib/api'
import { buyerRegistrationService } from '@/lib/buyer-registration-service'
import { enforcePublicSubmitLimit } from '@/lib/public-rate-limit'

// POST /api/public/buyer-registration
//
// UNAUTHENTICATED, like its supplier counterpart, and using the same limiter
// rather than a second one: a submission is a submission, and one attacker
// should not get a fresh allowance simply by switching forms.
//
// The response says only that it landed. Echoing the created account back would
// tell an anonymous caller our internal id and confirm what we stored.
export function POST(req: Request) {
  return route(req, async (requestId) => {
    enforcePublicSubmitLimit(req)
    const dto = await parseBody(req, buyerRegistrationSchema)
    const account = await buyerRegistrationService.submit({ requestId }, dto)
    return ok({ submitted: true, companyName: account.legalName }, { requestId, status: 201 })
  })
}
