import type { Metadata } from 'next'

import { requireAuth } from '@/auth/context'
import { QuotationDetail } from '@/features/portal/components/quotation-detail'
import { buyerPortalService } from '@/lib/buyer-portal-service'
import { portalContextService } from '@/lib/portal-context-service'

export const metadata: Metadata = { title: 'Quotation · Triyara BNP' }

// Resolved per request: an account that is blocked, deleted or moved between
// tenants must stop working on the next request rather than at session expiry.
export const dynamic = 'force-dynamic'

/**
 * One of the offers TRIYARA has sent this buyer.
 *
 * The route carries `quotationNumber` and nothing else, and that identifier
 * cannot widen anything: it is matched inside a query already narrowed to this
 * organization, this account, the buyer-visible statuses and the undeleted
 * rows, so the worst a guessed or edited number does is fail to match.
 * Organization and account come from `resolve`, never from the URL.
 *
 * `quotationNumber` rather than the row id, because the number is what the
 * buyer already sees on their own list, and the id is deliberately absent from
 * every buyer-facing projection. Unlike an RFQ number it is not unique on its
 * own - one number holds a row per revision - so the repository orders by
 * revision and answers with the offer currently standing.
 *
 * A miss throws like any other refusal and the portal error boundary renders
 * one generic message. That is deliberate: distinguishing "no such quotation"
 * from "not yours" from "withdrawn" would disclose whether somebody else's
 * exists.
 */
export default async function Page({ params }: { params: Promise<{ quotationNumber: string }> }) {
  const auth = await requireAuth()
  const party = await portalContextService.resolve(auth)
  const { quotationNumber } = await params
  const quotation = await buyerPortalService.getQuotation(party, quotationNumber)

  return <QuotationDetail quotation={quotation} />
}
