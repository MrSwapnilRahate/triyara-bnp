import { rfqApprovalSchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { enforceWriteLimit, etag, ok, parseBody, requireIfMatch, route } from '@/lib/api'
import { rfqService } from '@/lib/rfq-service'

type Ctx = { params: Promise<{ id: string }> }

// GET  /api/rfqs/:id/approvals - the decision trail, newest first.
// POST /api/rfqs/:id/approvals - record an approval decision.
//
// This is the other half of the lifecycle gap. `issue()` refuses anything that
// is not APPROVED, and the only path to APPROVED is `decide()` - which nothing
// exposed. Without this route an RFQ raised over HTTP could never be published
// over HTTP, whatever suppliers were invited.
//
// The decision vocabulary is the approval status (DRAFT, PENDING, APPROVED,
// REJECTED, CANCELLED); the service maps each to the sourcing status it drives
// and refuses a move the TRANSITIONS table does not allow. None of that logic
// is repeated here.
export function GET(req: Request, { params }: Ctx) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const { id } = await params
    const history = await rfqService.approvalHistory({ ...auth, requestId }, id)
    return ok(history, { requestId, meta: { rfqId: id, count: history.length } })
  })
}

export function POST(req: Request, { params }: Ctx) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { id } = await params
    const expectedVersion = requireIfMatch(req)
    const dto = await parseBody(req, rfqApprovalSchema)
    const rfq = await rfqService.decide({ ...auth, requestId }, id, expectedVersion, dto)
    return ok(rfq, {
      requestId,
      status: 201,
      etag: etag(rfq.version),
      meta: { status: rfq.status, decision: dto.decision },
    })
  })
}
