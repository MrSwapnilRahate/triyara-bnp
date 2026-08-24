import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@triyara/ui'

/**
 * What the portal overview is allowed to show (TRY-BNP-PORTAL-VIEW).
 *
 * A second, narrower projection than `PortalPartyContext`. That type carries
 * `accountId`, `organizationId` and `userId` so the server can scope queries by
 * them - they are the reason it exists - and none of the three belongs in a
 * rendered page. Passing the context straight to a component would make every
 * future screen one careless `{...party}` away from putting a tenant identifier
 * in the DOM.
 *
 * So the boundary is explicit and one-directional:
 *
 *   Account (20+ internal fields)
 *     -> PortalPartyContext (6)    server-side, for scoping
 *       -> PortalOverviewView (4)  display only, no identifiers
 *
 * Presentational on purpose: it takes this object and nothing else - no context,
 * no session, no repository - so what reaches the screen is decided in one place
 * and can be asserted directly in a test.
 */
export interface PortalOverviewView {
  /** The trading name the company gave us, or its legal name. Chosen upstream. */
  readonly companyName: string
  /** ISO 3166-1 alpha-2, or null when the company never told us. */
  readonly country: string | null
  /** Derived from the resolved party type, never written by hand at the call site. */
  readonly partyTypeLabel: string
  /** The viewer's own name or email - their identity, not anybody else's. */
  readonly signedInAs: string
}

export function PortalOverview({ view }: { view: PortalOverviewView }) {
  return (
    <div className="space-y-gap-lg">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-content">Your TRIYARA portal</h1>
        <p className="text-content-muted">
          You&rsquo;re signed in as {view.signedInAs}. Your requirements, quotations and documents
          will appear here as we set them up with you.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle as="h2">{view.companyName}</CardTitle>
          <CardDescription>The company this portal is showing you.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-gap-lg sm:grid-cols-2">
            <div className="space-y-1">
              <dt className="text-sm text-content-muted">Account type</dt>
              <dd>
                <Badge>{view.partyTypeLabel}</Badge>
              </dd>
            </div>
            {/* Rendered only when we actually hold a country. An empty row would
                claim we know something about the company that we do not. */}
            {view.country ? (
              <div className="space-y-1">
                <dt className="text-sm text-content-muted">Country</dt>
                <dd className="font-medium text-content">{view.country}</dd>
              </div>
            ) : null}
          </dl>
        </CardContent>
      </Card>

      <p className="text-sm text-content-muted">
        Your TRIYARA contact remains the best way to reach us in the meantime.
      </p>
    </div>
  )
}
