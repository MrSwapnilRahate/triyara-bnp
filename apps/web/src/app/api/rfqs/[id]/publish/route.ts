import { requireAuth } from '@/auth/context'
import { enforceWriteLimit, etag, ok, requireIfMatch, route } from '@/lib/api'
import { rfqService } from '@/lib/rfq-service'

type Ctx = { params: Promise<{ id: string }> }

// POST /api/rfqs/:id/publish - Issues an APPROVED RFQ to its invited suppliers. The service refuses an RFQ that is not APPROVED or has no invited suppliers.
// Requires If-Match: a workflow move is a mutation like any other.
// Authorization: ADMIN, EXPORT_MANAGER.
export function POST(req: Request, { params }: Ctx) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { id } = await params
    const expectedVersion = requireIfMatch(req)
    const rfq = await rfqService.issue({ ...auth, requestId }, id, expectedVersion)
    return ok(rfq, { requestId, etag: etag(rfq.version), meta: { status: rfq.status } })
  })
}
