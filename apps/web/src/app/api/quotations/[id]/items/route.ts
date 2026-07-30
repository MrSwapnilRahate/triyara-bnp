import { requireAuth } from '@/auth/context'
import { ok, route } from '@/lib/api'
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
