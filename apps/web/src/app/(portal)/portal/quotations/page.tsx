import type { Metadata } from 'next'

import { requireAuth } from '@/auth/context'
import { QuotationList } from '@/features/portal/components/quotation-list'
import { buyerPortalService } from '@/lib/buyer-portal-service'
import { portalContextService } from '@/lib/portal-context-service'

export const metadata: Metadata = { title: 'Your quotations · Triyara BNP' }

// Resolved per request: an account that is blocked, deleted or moved between
// tenants must stop working on the next request rather than at session expiry.
export const dynamic = 'force-dynamic'

/**
 * The offers TRIYARA has sent this buyer.
 *
 * Takes no props, no params and no searchParams. There is nothing for a URL to
 * influence: the account comes from the session through `resolve`, and which
 * quotations count as the buyer's to see is decided in the repository query, not
 * by anything a caller can pass.
 */
export default async function Page() {
  const auth = await requireAuth()
  const party = await portalContextService.resolve(auth)
  const list = await buyerPortalService.listQuotations(party)

  return <QuotationList list={list} />
}
