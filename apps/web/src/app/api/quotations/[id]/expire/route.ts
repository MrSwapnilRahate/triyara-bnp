import { quotationApprovalSchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { enforceWriteLimit, etag, ok, parseBody, requireIfMatch, route } from '@/lib/api'
import { quotationService } from '@/lib/quotation-service'

type Ctx = { params: Promise<{ id: string }> }

const commentsSchema = quotationApprovalSchema.pick({ comments: true })

// POST /api/quotations/:id/expire - Lapses a quotation whose validity has run out. Explicit rather than inferred from validUntil on read, so the lapse carries an actor and a timestamp.
// Requires If-Match: a workflow move is a mutation like any other.
export function POST(req: Request, { params }: Ctx) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { id } = await params
    const expectedVersion = requireIfMatch(req)
    const { comments } = await parseBody(req, commentsSchema)
    const quotation = await quotationService.expire(
      { ...auth, requestId },
      id,
      expectedVersion,
      comments,
    )
    return ok(quotation, {
      requestId,
      etag: etag(quotation.version),
      meta: { status: quotation.status },
    })
  })
}
