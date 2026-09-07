import type { BuyerPortalSummary } from '@triyara/core'
import { Badge, PageHeader } from '@triyara/ui'
import Link from 'next/link'

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

/**
 * The first screen of the portal.
 *
 * Composed as a masthead and then a standing position, rather than a row of
 * equal tiles. The four tiles this replaced gave a count, a count, a count and
 * a sentence the same weight and the same box, which said that starting a new
 * requirement is a fourth measurement and that three unequal facts are peers.
 * On a phone it became four tall boxes holding one word and one digit each,
 * which is a lot of scrolling to learn very little.
 *
 * The counts stay - they are honest and they are the way in to each page - but
 * they are set as an index, not as figures worth reading on their own. The one
 * thing here that can actually need a buyer's attention is
 * `pendingRequirements`, so it is the only line allowed to qualify a row.
 */
export function PortalOverview({
  view,
  summary,
}: {
  view: PortalOverviewView
  summary: BuyerPortalSummary
}) {
  return (
    <>
      {/* `-mx-gutter` cancels the padding of the portal's content column, so
          the header band runs to the column's edges the way it does under the
          staff application's chrome. */}
      <PageHeader
        className="-mx-gutter mb-section"
        title="Your TRIYARA portal"
        description={`You’re signed in as ${view.signedInAs}. Here is what you have with us.`}
      />

      {/* Whose portal this is. It was the last thing on the page, inside a
          card, below three counts; it is the one fact that makes the screen
          theirs rather than anybody's. */}
      <section aria-labelledby="portal-company" className="border-b border-line pb-gap-lg">
        <div className="flex flex-wrap items-baseline justify-between gap-gap-lg">
          <h2 id="portal-company" className="text-lg font-semibold text-content">
            {view.companyName}
          </h2>
          <dl className="flex flex-wrap items-baseline gap-x-section gap-y-gap">
            <div className="flex items-baseline gap-gap">
              <dt className="text-sm text-content-muted">Account type</dt>
              <dd>
                <Badge>{view.partyTypeLabel}</Badge>
              </dd>
            </div>
            {/* Rendered only when we actually hold a country. An empty row would
                claim we know something about the company that we do not. */}
            {view.country ? (
              <div className="flex items-baseline gap-gap">
                <dt className="text-sm text-content-muted">Country</dt>
                {/* An ISO 3166-1 code is a reference, not prose. */}
                <dd className="font-mono text-sm text-content">{view.country}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      </section>

      {/* A way in to each page, carrying the one fact a summary can honestly
          give: how many. Every figure is counted with the same scope its page
          uses, so a row and the page behind it cannot disagree. Label and
          figure sit inside one link, so a reader who lands on either has the
          other. */}
      <ul aria-label="What you have with us" className="divide-y divide-line">
        <StandingRow
          href="/portal/requirements"
          label="Requirements"
          count={summary.requirements}
          hint={
            summary.pendingRequirements > 0
              ? `${summary.pendingRequirements} awaiting review`
              : undefined
          }
        />
        <StandingRow href="/portal/quotations" label="Quotations" count={summary.quotations} />
        <StandingRow href="/portal/documents" label="Documents" count={summary.documents} />
      </ul>

      {/* Below the rule, because it is an act rather than a standing figure. */}
      <div className="mt-section border-t border-line pt-gap-lg">
        <Link
          href="/portal/requirements/new"
          className="focus-ring inline-flex min-h-6 items-center text-md font-medium text-accent hover:text-accent-hover"
        >
          New requirement
        </Link>
        <p className="mt-gap-xs text-base text-content-muted">Tell us what you need.</p>
      </div>

      <p className="mt-section text-sm text-content-muted">
        Your TRIYARA contact remains the best way to reach us in the meantime.
      </p>
    </>
  )
}

/**
 * One line of the standing position: what it is, how many, and the page.
 *
 * A link rather than a figure on its own. A number the buyer cannot act on is
 * an interruption; the point of the row is the page behind it.
 */
function StandingRow({
  href,
  label,
  count,
  hint,
}: {
  href: string
  label: string
  count: number
  hint?: string
}) {
  return (
    <li>
      <Link
        href={href}
        className="focus-ring group flex items-baseline justify-between gap-gap-lg py-gap-lg"
      >
        <span className="text-md font-medium text-content group-hover:underline">{label}</span>
        <span className="flex items-baseline gap-gap-lg">
          {hint ? <span className="text-sm text-content-muted">{hint}</span> : null}
          {/* Tabular and monospaced so the column reads as a column. */}
          <span className="w-8 text-right font-mono text-lg tabular-nums text-content">
            {count}
          </span>
        </span>
      </Link>
    </li>
  )
}
