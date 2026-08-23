import { publicQuoteRequestSchema } from '@triyara/validation'

import { ok, parseBody, route } from '@/lib/api'
import { publicCorsHeaders, publicCorsPreflight } from '@/lib/public-cors'
import { enforcePublicSubmitLimit } from '@/lib/public-rate-limit'
import { quoteRequestService } from '@/lib/quote-request-service'

// POST /api/v1/public/quote-requests
//
// UNAUTHENTICATED. The Request Quote form on the marketing site posts here.
//
// This is what makes an enquiry a platform record rather than an email. The row
// written below is the system of record; the notification that follows is a
// convenience, and losing it loses nothing.
//
// It creates an INTAKE record only - never an RFQ, never an Account. Promotion
// into the commercial sourcing workflow is a separate act by a signed-in
// operator, which is what keeps anonymous traffic out of the supplier network.
//
// The same limiter as the registration forms, deliberately rather than a second
// one: a submission is a submission, and an attacker should not get a fresh
// allowance by switching forms.
//
// The response says only that it landed, plus the reference so the sender has
// something to quote. It deliberately echoes nothing else back - not the row id,
// not the tenant, not the stored values - because confirming what we recorded is
// a question an anonymous caller has no business asking.
export async function POST(req: Request) {
  const response = await route(req, async (requestId) => {
    enforcePublicSubmitLimit(req)
    const dto = await parseBody(req, publicQuoteRequestSchema)
    const created = await quoteRequestService.submit({ requestId }, dto)
    return ok({ submitted: true, reference: created.reference }, { requestId, status: 201 })
  })

  // Applied to every outcome, not just success. A rate-limited or invalid
  // submission has to reach the marketing site's error handling too - without
  // these headers the browser hides the response and the visitor sees a generic
  // network failure instead of the reason.
  for (const [key, value] of Object.entries(publicCorsHeaders(req))) {
    response.headers.set(key, value)
  }
  return response
}

export function OPTIONS(req: Request) {
  return publicCorsPreflight(req)
}
