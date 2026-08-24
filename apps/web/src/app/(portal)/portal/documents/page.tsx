import type { Metadata } from 'next'

import { requireAuth } from '@/auth/context'
import { DocumentList } from '@/features/portal/components/document-list'
import { buyerPortalService } from '@/lib/buyer-portal-service'
import { portalContextService } from '@/lib/portal-context-service'

export const metadata: Metadata = { title: 'Your documents · Triyara BNP' }

// Resolved per request: an account that is blocked, deleted or moved between
// tenants must stop working on the next request rather than at session expiry.
export const dynamic = 'force-dynamic'

/**
 * The documents on the buyer's own account.
 *
 * Takes no props, no `params` and no `searchParams`. There is nothing for a URL
 * to influence: the account comes from the session through `resolve`, and the
 * read is scoped by what that returned. The browser cannot ask this page to show
 * it another company's documents, because there is no input through which to
 * ask.
 *
 * `resolve` runs first and on its own - it is what proves the party is approved,
 * in this organization, and a buyer. Only then is anything read.
 *
 * No document is addressable from here. There is no detail route and no
 * download: a `Document` carries no business identifier, only a row id, and this
 * portal has kept row ids out of every buyer-facing projection. File access is a
 * separate batch with its own account-scoped lookup.
 */
export default async function Page() {
  const auth = await requireAuth()
  const party = await portalContextService.resolve(auth)
  const list = await buyerPortalService.listDocuments(party)

  return <DocumentList list={list} />
}
