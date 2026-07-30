import { updateQuotationSchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { enforceWriteLimit, etag, ok, parseBody, requireIfMatch, route } from '@/lib/api'
import { quotationService } from '@/lib/quotation-service'

type Ctx = { params: Promise<{ id: string }> }

// GET /api/quotations/:id
// Internal cost and margin are redacted by the service unless the caller can
// `manage Account`; the route never sees the unredacted record.
export function GET(req: Request, { params }: Ctx) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const { id } = await params
    const quotation = await quotationService.get({ ...auth, requestId }, id)
    return ok(quotation, { requestId, etag: etag(quotation.version) })
  })
}

// PATCH /api/quotations/:id - requires If-Match. Editing is refused once the
// quotation is SENT; that rule lives in the service, not here.
export function PATCH(req: Request, { params }: Ctx) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { id } = await params
    const expectedVersion = requireIfMatch(req)
    const dto = await parseBody(req, updateQuotationSchema)
    const quotation = await quotationService.update(
      { ...auth, requestId },
      id,
      expectedVersion,
      dto,
    )
    return ok(quotation, { requestId, etag: etag(quotation.version) })
  })
}

// DELETE /api/quotations/:id - withdraws rather than erases, requires If-Match.
export function DELETE(req: Request, { params }: Ctx) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { id } = await params
    const expectedVersion = requireIfMatch(req)
    const quotation = await quotationService.remove({ ...auth, requestId }, id, expectedVersion)
    return ok(quotation, { requestId, etag: etag(quotation.version) })
  })
}
