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
    // `bg-canvas` and `text-content`, not `bg-background`/`text-foreground`.
    // The latter two are not colour keys in the Tailwind preset, so they
    // produced no rule at all: the shell was transparent and inherited its text
    // colour from the body. It looked correct only because `globals.css`
    // already paints the body.
    <div className="min-h-screen bg-canvas text-content">
      {/* Before the navigation, so a keyboard user reaches it on the first tab
          rather than after every link on every page. */}
      <SkipToContent />
      {/* `bg-surface` so the chrome reads as chrome. A transparent header
          separated from the page by a single hairline does not. */}
      <header className="border-b border-line bg-surface">
        <div className="mx-auto max-w-3xl px-gutter py-4">
          <div className="flex items-center justify-between gap-gap-lg">
            {/* The display face, because this is the one place the portal says
                whose it is. No gold rule here: `PageHeader` carries the one
                identity mark per screen, and two would make it decoration. */}
            <span className="font-serif text-md font-semibold text-content">
              TRIYARA Partner Portal
            </span>
            {/* `SignOutButton` is shared with the staff shell, where it sits
                inside a menu and its danger tint reads as a menu item. Bare in
                this header it was the loudest thing on every portal page, for
                an act that is not destructive. The component takes no
                `className`, so the portal restates the tone from outside
                rather than editing a component the staff application also
                uses. Behaviour, markup and accessible name are untouched. */}
            <form
              action={logoutAction}
              className="[&_button:hover]:bg-transparent [&_button:hover]:text-content [&_button]:text-content-muted"
            >
              <SignOutButton />
            </form>
          </div>
          <div className="mt-gap-lg">
            <PortalNav />
          </div>
        </div>
      </header>
      {/* No top padding: each screen opens with a `PageHeader` that bleeds to
          the edges of this column, so the header band sits flush under the
          chrome the way it does in the staff application. */}
      <main id="main-content" className="mx-auto max-w-3xl px-gutter pb-section-lg">
        {children}
      </main>
    </div>
  )
}
