import { quotationApprovalSchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { enforceWriteLimit, etag, ok, parseBody, requireIfMatch, route } from '@/lib/api'
import { quotationService } from '@/lib/quotation-service'

type Ctx = { params: Promise<{ id: string }> }

// GET  /api/quotations/:id/approvals - the decision trail, newest first.
// POST /api/quotations/:id/approvals - record any approval decision.
//
// The existing /approve and /reject routes hard-code their decision, so only
// APPROVED and REJECTED were reachable. `PENDING` - the decision that moves a
// DRAFT to PENDING_APPROVAL - had no route at all, which made the review step
// of the lifecycle unreachable over HTTP.
//
// This route takes the decision as data rather than as a path segment. It does
// not replace /approve and /reject; those stay as the named, convenient form of
// the two common cases. Every rule (the TRANSITIONS table, the value threshold
// and margin floor that demand ADMIN) stays in the service.
export function GET(req: Request, { params }: Ctx) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const { id } = await params
    const history = await quotationService.approvalHistory({ ...auth, requestId }, id)
    return ok(history, { requestId, meta: { quotationId: id, count: history.length } })
  })
}

export function POST(req: Request, { params }: Ctx) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { id } = await params
    const expectedVersion = requireIfMatch(req)
    const dto = await parseBody(req, quotationApprovalSchema)
    const quotation = await quotationService.transition(
      { ...auth, requestId },
      id,
      expectedVersion,
      dto,
    )
    return ok(quotation, {
      requestId,
      status: 201,
      etag: etag(quotation.version),
      meta: { status: quotation.status, decision: dto.decision },
    })
  })
}
