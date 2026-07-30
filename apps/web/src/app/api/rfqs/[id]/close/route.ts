import { requireAuth } from '@/auth/context'
import { enforceWriteLimit, etag, ok, requireIfMatch, route } from '@/lib/api'
import { rfqService } from '@/lib/rfq-service'

type Ctx = { params: Promise<{ id: string }> }

// POST /api/rfqs/:id/close - Closes a sourcing round. Legal predecessors come from the service's transition table.
// Requires If-Match: a workflow move is a mutation like any other.
// Authorization: ADMIN, EXPORT_MANAGER.
export function POST(req: Request, { params }: Ctx) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { id } = await params
    const expectedVersion = requireIfMatch(req)
    const rfq = await rfqService.close({ ...auth, requestId }, id, expectedVersion)
    return ok(rfq, { requestId, etag: etag(rfq.version), meta: { status: rfq.status } })
  })
}
