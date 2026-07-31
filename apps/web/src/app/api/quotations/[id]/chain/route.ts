import { requireAuth } from '@/auth/context'
import { ok, route } from '@/lib/api'
import { quotationService } from '@/lib/quotation-service'

type Ctx = { params: Promise<{ id: string }> }

// GET /api/quotations/:id/chain - every revision sharing this quotation number.
//
// `revise` creates a NEW quotation and marks the old one SUPERSEDED, so the
// lineage is a set of sibling records rather than versions of one row. Without
// this, a superseded quotation is a dead end: nothing in the API points at the
// document that replaced it.
//
// Keyed by id rather than by number so the caller does not have to know the
// number first, and so the org scoping is the same as every other route here -
// the id is resolved through `get`, which already 404s across tenants.
export function GET(req: Request, { params }: Ctx) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const { id } = await params
    const quotation = await quotationService.get({ ...auth, requestId }, id)
    const chain = await quotationService.history({ ...auth, requestId }, quotation.quotationNumber)
    return ok(chain, {
      requestId,
      meta: {
        quotationId: id,
        quotationNumber: quotation.quotationNumber,
        count: chain.length,
        currentRevision: quotation.revisionNumber,
      },
    })
  })
}
