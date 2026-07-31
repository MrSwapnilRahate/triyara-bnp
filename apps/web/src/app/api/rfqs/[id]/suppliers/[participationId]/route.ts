import { supplierParticipationSchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { enforceWriteLimit, etag, ok, parseBody, requireIfMatch, route } from '@/lib/api'
import { rfqSupplierService } from '@/lib/rfq-service'

type Ctx = { params: Promise<{ id: string; participationId: string }> }

// PATCH /api/rfqs/:id/suppliers/:participationId - record where a supplier
// stands: viewed, accepted, declined, withdrawn.
//
// Requires If-Match, like every other mutation. SUBMITTED is refused by the
// service - a bid is recorded by POSTing a response, so a participation can
// never claim a bid that does not exist.
export function PATCH(req: Request, { params }: Ctx) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { participationId } = await params
    const expectedVersion = requireIfMatch(req)
    const dto = await parseBody(req, supplierParticipationSchema)
    const participation = await rfqSupplierService.setParticipation(
      { ...auth, requestId },
      participationId,
      expectedVersion,
      dto,
    )
    return ok(participation, {
      requestId,
      etag: etag(participation.version),
      meta: { status: participation.status },
    })
  })
}
