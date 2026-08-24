import type { Metadata } from 'next'

import { requireAuth } from '@/auth/context'
import { RequirementList } from '@/features/portal/components/requirement-list'
import { buyerPortalService } from '@/lib/buyer-portal-service'
import { portalContextService } from '@/lib/portal-context-service'

export const metadata: Metadata = { title: 'Your requirements · Triyara BNP' }

// Resolved per request: an account that is blocked, deleted or moved between
// tenants must stop working on the next request rather than at session expiry.
export const dynamic = 'force-dynamic'

/**
 * The buyer's own requirements.
 *
 * Takes no props, no `params` and no `searchParams`. There is nothing for a URL
 * to influence - the account comes from the session through `resolve`, and the
 * read is scoped by what that returned. The browser cannot ask this page to show
 * it another company's requirements, because there is no input through which to
 * ask.
 *
 * `resolve` runs first and on its own: it is what proves the party is approved,
 * in this organization, and a buyer. Only then is anything read.
 */
export default async function Page() {
  const auth = await requireAuth()
  const party = await portalContextService.resolve(auth)
  const list = await buyerPortalService.listRequirements(party)

  return <RequirementList list={list} />
}
