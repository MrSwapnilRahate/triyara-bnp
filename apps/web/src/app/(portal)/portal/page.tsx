import type { PortalPartyType } from '@triyara/core'
import type { Metadata } from 'next'

import { requireAuth } from '@/auth/context'
import {
  PortalOverview,
  type PortalOverviewView,
} from '@/features/portal/components/portal-overview'
import { buyerPortalService } from '@/lib/buyer-portal-service'
import { portalContextService } from '@/lib/portal-context-service'

export const metadata: Metadata = { title: 'Partner Portal · Triyara BNP' }

// Resolved per request against the database, never cached: an account that is
// blocked, deleted or moved between tenants must stop working on the next
// request rather than at session expiry.
export const dynamic = 'force-dynamic'

/**
 * How a resolved party type reads to the person it describes.
 *
 * A lookup rather than a literal in the markup, so the label is derived from
 * what the context actually resolved. Writing "Buyer" directly in the component
 * would keep rendering "Buyer" if the resolver ever returned something else -
 * the screen would be confidently wrong rather than failing.
 *
 * `Record<PortalPartyType, string>` is what enforces that: adding a member to
 * the union without adding its label stops compiling here.
 */
const PARTY_TYPE_LABELS: Record<PortalPartyType, string> = {
  BUYER: 'Buyer',
}

/**
 * The buyer's portal overview.
 *
 * Takes no props, no `params` and no `searchParams`, deliberately. There is
 * nothing for a URL to influence: the account comes from the session through
 * `resolve`, which itself accepts only an AuthContext. The browser cannot ask
 * this page to show it a different company, because there is no input through
 * which to ask.
 *
 * It reads no domain data beyond the party's own identity. Counts of
 * requirements or quotations would each need a portal-scoped read model that
 * does not exist yet - every service that could produce one gates on CASL, and
 * EXTERNAL_PARTY holds no ability. An invented number would be worse than an
 * honest absence, so there are none.
 */
export default async function Page() {
  const auth = await requireAuth()
  const party = await portalContextService.resolve(auth)

  // Scoped by the same resolved party as every other portal read. Counted in the
  // database rather than measured off a list, each with the scope its own page
  // uses, so a tile cannot claim a number that page does not show.
  const summary = await buyerPortalService.getSummary(party)

  // The display projection. Built field by field from two trusted sources and
  // never by spreading either: `party` carries identifiers that exist for
  // scoping and must not reach the DOM, and `auth.user` is the viewer's own
  // record.
  const view: PortalOverviewView = {
    companyName: party.companyName,
    country: party.country,
    partyTypeLabel: PARTY_TYPE_LABELS[party.partyType],
    // The viewer's own identity, from their own session - no second user is
    // looked up. Name when we have one, email otherwise, because a login always
    // has an email and a name is only as good as what they typed at sign-up.
    signedInAs: auth.user.name || auth.user.email,
  }

  return <PortalOverview view={view} summary={summary} />
}
