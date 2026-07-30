import { quotationApprovalSchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { enforceWriteLimit, etag, ok, parseBody, requireIfMatch, route } from '@/lib/api'
import { quotationService } from '@/lib/quotation-service'

type Ctx = { params: Promise<{ id: string }> }

// The decision is fixed by the endpoint, so the body carries only the comments.
const commentsSchema = quotationApprovalSchema.pick({ comments: true })

// POST /api/quotations/:id/reject - Rejects the quotation. Terminal: a rejected quotation is revised into a new one rather than reopened.
// Requires If-Match: a workflow move is a mutation like any other.
export function POST(req: Request, { params }: Ctx) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { id } = await params
    const expectedVersion = requireIfMatch(req)
    const { comments } = await parseBody(req, commentsSchema)
    const quotation = await quotationService.transition(
      { ...auth, requestId },
      id,
      expectedVersion,
      {
        decision: 'REJECTED',
        ...(comments === undefined ? {} : { comments }),
      },
    )
    return ok(quotation, {
      requestId,
      etag: etag(quotation.version),
      meta: { status: quotation.status },
    })
  })
}
