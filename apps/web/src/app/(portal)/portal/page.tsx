import type { Metadata } from 'next'

import { requireAuth } from '@/auth/context'
import { portalContextService } from '@/lib/portal-context-service'

export const metadata: Metadata = { title: 'Partner Portal · Triyara BNP' }

// Resolved per request against the database, never cached: an account that is
// blocked, deleted or moved between tenants must stop working on the next
// request rather than at session expiry.
export const dynamic = 'force-dynamic'

/**
 * The portal landing page.
 *
 * Its whole job is to prove the context resolves. It reads nothing beyond the
 * party's own identity - no requirements, no quotations, no documents, no
 * counterparties - because record scoping for external parties does not exist
 * yet and a screen that queried anything now would be the first place to get it
 * wrong.
 *
 * A refusal from `resolve` throws, which the portal error boundary turns into a
 * generic message. Rendering happens only after the account has been found in
 * this organization, confirmed approved, and confirmed to be a buyer.
 */
export default async function Page() {
  const auth = await requireAuth()
  const party = await portalContextService.resolve(auth)

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Welcome to the TRIYARA Partner Portal</h1>
        <p className="text-muted-foreground">
          Your account is set up. We&rsquo;re preparing your portal &mdash; your requirements,
          quotations and documents will appear here.
        </p>
      </div>

      <dl className="grid gap-4 rounded-lg border p-6 sm:grid-cols-2">
        <div className="space-y-1">
          <dt className="text-muted-foreground text-sm">Company</dt>
          <dd className="font-medium">{party.companyName}</dd>
        </div>
        <div className="space-y-1">
          <dt className="text-muted-foreground text-sm">Account type</dt>
          {/* Resolved from the account's profiles, not from the signed-in role -
              every external login holds the same role. */}
          <dd className="font-medium">Buyer</dd>
        </div>
        {party.country ? (
          <div className="space-y-1">
            <dt className="text-muted-foreground text-sm">Country</dt>
            <dd className="font-medium">{party.country}</dd>
          </div>
        ) : null}
      </dl>

      <p className="text-muted-foreground">
        In the meantime, your TRIYARA contact remains the best way to reach us.
      </p>
    </section>
  )
}
