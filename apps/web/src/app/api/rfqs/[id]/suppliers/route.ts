import { inviteSuppliersSchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { enforceWriteLimit, ok, parseBody, route } from '@/lib/api'
import { rfqSupplierService } from '@/lib/rfq-service'

type Ctx = { params: Promise<{ id: string }> }

// GET  /api/rfqs/:id/suppliers - who was invited, and where each one stands.
// POST /api/rfqs/:id/suppliers - invite suppliers to bid.
//
// These close the gap that made the sourcing lifecycle unreachable over HTTP:
// `issue()` refuses an RFQ with no invited suppliers, and nothing exposed
// `invite`. Both handlers only parse, authorize and delegate - every rule
// (which statuses may still be invited to, de-duplication of an already-invited
// supplier) already lives in rfqSupplierService and is unchanged.
export function GET(req: Request, { params }: Ctx) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const { id } = await params
    const participants = await rfqSupplierService.list({ ...auth, requestId }, id)
    return ok(participants, {
      requestId,
      meta: {
        rfqId: id,
        count: participants.length,
        submitted: participants.filter((p) => p.status === 'SUBMITTED').length,
      },
    })
  })
}

export function POST(req: Request, { params }: Ctx) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { id } = await params
    const dto = await parseBody(req, inviteSuppliersSchema)
    const participants = await rfqSupplierService.invite({ ...auth, requestId }, id, dto)
    // 200, not 201: inviting is idempotent per supplier - an already-invited
    // supplier is skipped rather than duplicated, so this is not "created".
    return ok(participants, {
      requestId,
      meta: { rfqId: id, requested: dto.supplierIds.length, total: participants.length },
    })
  })
}
