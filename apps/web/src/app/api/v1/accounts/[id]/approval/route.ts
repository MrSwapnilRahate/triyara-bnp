import { buyerApprovalSchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { enforceWriteLimit, etag, ok, parseBody, requireIfMatch, route } from '@/lib/api'
import { buyerRegistrationService } from '@/lib/buyer-registration-service'

type Params = { params: Promise<{ id: string }> }

// POST /v1/accounts/:id/approval - onboarding review decision (ADMIN)
//
// Deliberately NOT the same endpoint as ../status. That one moves
// `relationshipStatus`, the commercial ladder sales walks an account along.
// This moves `registrationStatus`, which records whether anyone has checked the
// company is real. Collapsing them into one endpoint would make it impossible
// to tell a verification from a sales reclassification in the audit trail.
//
// If-Match is required: two reviewers opening the same pending enquiry is
// exactly the case optimistic concurrency exists for, and an approval that
// silently overwrote a rejection would be the worst loss available here.
export function POST(req: Request, { params }: Params) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { id } = await params
    const version = requireIfMatch(req)
    const dto = await parseBody(req, buyerApprovalSchema)
    const account = await buyerRegistrationService.decide({ ...auth, requestId }, id, version, dto)
    return ok(account, { requestId, etag: etag(account.version) })
  })
}

// GET /v1/accounts/:id/approval - the decision trail
export function GET(req: Request, { params }: Params) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const { id } = await params
    const history = await buyerRegistrationService.approvalHistory({ ...auth, requestId }, id)
    return ok(history, { requestId, meta: { accountId: id } })
  })
}
