import { requireAuth } from '@/auth/context'
import { enforceWriteLimit, etag, ok, requireIfMatch, route } from '@/lib/api'
import { quotationService } from '@/lib/quotation-service'

type Ctx = { params: Promise<{ id: string }> }

// POST /api/quotations/:id/send - marks an APPROVED quotation as sent to the
// buyer, which freezes it: from here changes require a new revision. The service
// refuses a quotation with no lines or no validity date.
// Requires If-Match: a workflow move is a mutation like any other.
export function POST(req: Request, { params }: Ctx) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { id } = await params
    const expectedVersion = requireIfMatch(req)
    const quotation = await quotationService.send({ ...auth, requestId }, id, expectedVersion)
    return ok(quotation, {
      requestId,
      etag: etag(quotation.version),
      meta: { status: quotation.status, sentAt: quotation.sentAt },
    })
  })
}
