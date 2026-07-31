import { replaceQuotationItemsSchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { enforceWriteLimit, etag, ok, parseBody, requireIfMatch, route } from '@/lib/api'
import { quotationService } from '@/lib/quotation-service'

type Ctx = { params: Promise<{ id: string }> }

// GET /api/quotations/:id/items - the priced lines, in line-number order.
// Per-line unitCost and marginPercent are redacted by the service unless the
// caller can `manage Account`.
export function GET(req: Request, { params }: Ctx) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const { id } = await params
    const quotation = await quotationService.get({ ...auth, requestId }, id)
    return ok(quotation.items, {
      requestId,
      meta: {
        quotationId: id,
        quotationNumber: quotation.quotationNumber,
        revisionNumber: quotation.revisionNumber,
        status: quotation.status,
        currency: quotation.currency,
        count: quotation.items.length,
      },
    })
  })
}

// POST /api/quotations/:id/items - replace every line and re-total.
//
// Lines were readable but not writable: `replaceItems` had no route, so a
// quotation's pricing could never be corrected over HTTP. Replacement is
// wholesale by design - the service owns the arithmetic, and a per-line PATCH
// would let a caller leave the stored totals disagreeing with the lines.
//
// The service refuses this once the quotation is past APPROVED: after SENT the
// document is a commitment, and changing it means a revision.
export function POST(req: Request, { params }: Ctx) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { id } = await params
    const expectedVersion = requireIfMatch(req)
    const dto = await parseBody(req, replaceQuotationItemsSchema)
    const quotation = await quotationService.replaceItems(
      { ...auth, requestId },
      id,
      expectedVersion,
      dto,
    )
    return ok(quotation.items, {
      requestId,
      status: 201,
      etag: etag(quotation.version),
      meta: {
        quotationId: id,
        status: quotation.status,
        count: quotation.items.length,
        // The recomputed totals, so a caller does not have to re-read to learn
        // what replacing the lines did to the money.
        subtotal: quotation.subtotal,
        grandTotal: quotation.grandTotal,
        currency: quotation.currency,
      },
    })
  })
}
