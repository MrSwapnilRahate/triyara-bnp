import { quotationChargeSchema, quotationTaxSchema } from '@triyara/validation'
import { z } from 'zod'

import { requireAuth } from '@/auth/context'
import { enforceWriteLimit, etag, ok, parseBody, requireIfMatch, route } from '@/lib/api'
import { quotationService } from '@/lib/quotation-service'

type Ctx = { params: Promise<{ id: string }> }

// Charges and taxes are set together, in one request, because the service sets
// them together: `setConditions` replaces both sets and re-totals once. Two
// endpoints would mean two re-totals and a window where the stored totals
// reflect new charges but old taxes.
const conditionsSchema = z.object({
  charges: z.array(quotationChargeSchema).max(100).default([]),
  taxes: z.array(quotationTaxSchema).max(100).default([]),
})

// GET /api/quotations/:id/conditions - the charges and taxes as stored.
export function GET(req: Request, { params }: Ctx) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const { id } = await params
    const quotation = await quotationService.get({ ...auth, requestId }, id)
    return ok(
      { charges: quotation.charges, taxes: quotation.taxes },
      {
        requestId,
        meta: {
          quotationId: id,
          status: quotation.status,
          currency: quotation.currency,
          charges: quotation.charges.length,
          taxes: quotation.taxes.length,
          subtotal: quotation.subtotal,
          grandTotal: quotation.grandTotal,
        },
      },
    )
  })
}

// PUT /api/quotations/:id/conditions - replace charges and taxes, then re-total.
//
// PUT, not PATCH: this is a whole-collection replacement. Sending an empty
// array clears that side, which is the only way to express "no charges" and is
// why both keys default to [] rather than being optional.
//
// The service validates that a line-scoped charge or tax names a line that is
// actually on this quotation, and refuses the whole call once the quotation is
// past APPROVED.
export function PUT(req: Request, { params }: Ctx) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { id } = await params
    const expectedVersion = requireIfMatch(req)
    const { charges, taxes } = await parseBody(req, conditionsSchema)
    const quotation = await quotationService.setConditions(
      { ...auth, requestId },
      id,
      expectedVersion,
      charges,
      taxes,
    )
    return ok(
      { charges: quotation.charges, taxes: quotation.taxes },
      {
        requestId,
        etag: etag(quotation.version),
        meta: {
          quotationId: id,
          status: quotation.status,
          charges: quotation.charges.length,
          taxes: quotation.taxes.length,
          subtotal: quotation.subtotal,
          chargesTotal: quotation.chargesTotal,
          discountTotal: quotation.discountTotal,
          taxTotal: quotation.taxTotal,
          grandTotal: quotation.grandTotal,
          currency: quotation.currency,
        },
      },
    )
  })
}
