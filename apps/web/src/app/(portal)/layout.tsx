import { requireExternalAccountContext } from '@triyara/auth'
import { SkipToContent } from '@triyara/ui'
import type { ReactNode } from 'react'

import { logoutAction } from '@/auth/actions'
import { requireAuth } from '@/auth/context'
import { SignOutButton } from '@/components/layout/sign-out-button'
import { PortalNav } from '@/features/portal/components/portal-nav'

/**
 * The external party's shell (TRY-BNP-EXT-PROVISION).
 *
 * Deliberately NOT `AppChrome`. That component renders the internal navigation -
 * accounts, suppliers, RFQs, quotations, verifications - and reusing it here
 * would put the entire operations menu in front of a buyer, whether or not the
 * links worked. The whole point of a separate route group is that there is no
 * shared chrome to leak.
 *
 * Nor is there an `AbilityProvider`. EXTERNAL_PARTY holds no CASL rule, so every
 * `can()` a provider fed would answer false, and having one would suggest the
 * portal is meant to be gated that way. It is not: external access is a route
 * boundary in this batch, and record-level rules arrive with the records.
 *
 * The guard runs here as well as in the middleware. The middleware is the fence;
 * this is the check the page itself makes, and it holds even if a route is ever
 * added that the matcher does not cover. `requireExternalAccountContext` also
 * proves the thing the middleware cannot: that this login actually has an
 * account, rather than merely holding the role.
 */
export default async function PortalLayout({ children }: { children: ReactNode }) {
  const ctx = await requireAuth()
  requireExternalAccountContext(ctx)

  return (
    <div className="bg-background text-foreground min-h-screen">
      {/* Before the navigation, so a keyboard user reaches it on the first tab
          rather than after every link on every page. */}
      <SkipToContent />
      <header className="border-b">
        <div className="mx-auto max-w-3xl px-6 py-4">
          <div className="flex items-center justify-between">
            <span className="font-semibold">TRIYARA Partner Portal</span>
            <form action={logoutAction}>
              <SignOutButton />
            </form>
          </div>
          <div className="mt-3">
            <PortalNav />
          </div>
        </div>
      </header>
      <main id="main-content" className="mx-auto max-w-3xl px-6 py-10">
        {children}
      </main>
    </div>
  )
}
