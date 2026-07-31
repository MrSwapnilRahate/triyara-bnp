import { requireAuth } from '@/auth/context'
import { ok, route } from '@/lib/api'
import { quotationService } from '@/lib/quotation-service'

type Ctx = { params: Promise<{ id: string }> }

// GET /api/quotations/:id/revisions - line revisions on THIS quotation, newest first.
//
// Distinct from /chain: this is the record of edits made to one document, while
// /chain is the lineage of documents that superseded one another. A reviewer
// asking "what changed in this quotation" wants this one.
export function GET(req: Request, { params }: Ctx) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const { id } = await params
    const revisions = await quotationService.revisionHistory({ ...auth, requestId }, id)
    return ok(revisions, {
      requestId,
      meta: {
        quotationId: id,
        count: revisions.length,
        currentRevision: revisions[0]?.toRevision ?? 0,
      },
    })
  })
}
