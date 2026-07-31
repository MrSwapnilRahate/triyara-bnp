import { requireAuth } from '@/auth/context'
import { ok, route } from '@/lib/api'
import { rfqService } from '@/lib/rfq-service'

type Ctx = { params: Promise<{ id: string }> }

// GET /api/rfqs/:id/revisions - line-item revisions, newest first.
//
// Each entry carries the snapshot taken before the lines were replaced, so a
// reviewer can see what an RFQ asked for at the point a supplier quoted against
// it. Read-only: revisions are written by reviseItems, never directly.
export function GET(req: Request, { params }: Ctx) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const { id } = await params
    const revisions = await rfqService.revisionHistory({ ...auth, requestId }, id)
    return ok(revisions, {
      requestId,
      meta: {
        rfqId: id,
        count: revisions.length,
        currentRevision: revisions[0]?.revisionNumber ?? 0,
      },
    })
  })
}
