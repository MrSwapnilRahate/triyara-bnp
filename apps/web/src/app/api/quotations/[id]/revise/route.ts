import { replaceQuotationItemsSchema, reviseQuotationSchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { enforceWriteLimit, etag, ok, parseBody, requireIfMatch, route } from '@/lib/api'
import { quotationService } from '@/lib/quotation-service'

type Ctx = { params: Promise<{ id: string }> }

// Revising takes the new lines AND the reason in one body, because the service
// takes both: it creates the successor and supersedes the original in a single
// transaction. Splitting them would allow a superseded quotation with no
// successor.
const reviseWithItemsSchema = reviseQuotationSchema.extend({
  items: replaceQuotationItemsSchema.shape.items,
})

// POST /api/quotations/:id/revise - supersede this quotation with a new revision.
//
// This is the only way to change a quotation that is already SENT: the original
// becomes SUPERSEDED and a new one is created carrying the next revision number
// under the same quotation number. `revise` had no route, so a sent quotation
// was permanently frozen - the document could be rejected or expired, but never
// corrected.
//
// Returns 201 with the NEW quotation, and its ETag. The caller's old version is
// deliberately not usable afterwards: the id in the response is a different
// record.
export function POST(req: Request, { params }: Ctx) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { id } = await params
    const expectedVersion = requireIfMatch(req)
    const { items, ...revision } = await parseBody(req, reviseWithItemsSchema)
    const quotation = await quotationService.revise(
      { ...auth, requestId },
      id,
      expectedVersion,
      { items },
      revision,
    )
    return ok(quotation, {
      requestId,
      status: 201,
      etag: etag(quotation.version),
      meta: {
        supersededId: id,
        quotationNumber: quotation.quotationNumber,
        revisionNumber: quotation.revisionNumber,
        status: quotation.status,
      },
    })
  })
}
