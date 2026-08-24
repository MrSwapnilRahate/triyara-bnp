import type { Metadata } from 'next'

import { requireAuth } from '@/auth/context'
import { RequirementDetail } from '@/features/portal/components/requirement-detail'
import { buyerPortalService } from '@/lib/buyer-portal-service'
import { portalContextService } from '@/lib/portal-context-service'

export const metadata: Metadata = { title: 'Requirement · Triyara BNP' }

// Resolved per request: an account that is blocked, deleted or moved between
// tenants must stop working on the next request rather than at session expiry.
export const dynamic = 'force-dynamic'

/**
 * One of the buyer's own requirements.
 *
 * The route carries `rfqNumber` and nothing else, and that identifier cannot
 * widen anything: it is matched inside a query already narrowed to this
 * organization and this account, so the worst a guessed or edited number does is
 * fail to match. Organization and account come from `resolve`, never from the
 * URL.
 *
 * `rfqNumber` rather than the row id, because the number is what the buyer
 * already sees on their own list - unique per organization, which is exactly the
 * scope the query carries anyway - and the id is deliberately absent from every
 * buyer-facing projection.
 *
 * A miss throws like any other refusal and the portal error boundary renders one
 * generic message. That is deliberate: distinguishing "no such requirement" from
 * "not yours" would disclose whether somebody else's exists.
 */
export default async function Page({ params }: { params: Promise<{ rfqNumber: string }> }) {
  const auth = await requireAuth()
  const party = await portalContextService.resolve(auth)
  const { rfqNumber } = await params
  const requirement = await buyerPortalService.getRequirement(party, rfqNumber)

  return <RequirementDetail requirement={requirement} />
}
