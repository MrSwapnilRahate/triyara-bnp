'use client'

import {
  BarChart,
  Button,
  EmptyState,
  FunnelChart,
  LineChart,
  PageHeader,
  RankedBars,
  Skeleton,
  StatusBadge,
} from '@triyara/ui'
import { Activity, FileSearch, Inbox, Quote, Truck } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'

import { InlineQueryError } from '@/components/data/query-boundary'
import { useQuotations } from '@/features/quotations/api/quotations'
import { formatMoney } from '@/features/quotations/types'
import { useRfqs } from '@/features/rfqs/api/rfqs'

import { useDashboardSummary, useDashboardTrends } from '../api/admin'
import { humanise, monthLabel } from '../types'

/**
 * Organization dashboard (TRY-BNP-PORTAL-01 §9).
 *
 * Two kinds of data, from two kinds of endpoint, and the split is deliberate:
 *
 *  - COUNTS and TRENDS come from the summary and trends endpoints, because
 *    cursor pagination cannot produce a total and the browser must not compute
 *    analytics. Nothing on this screen is aggregated client-side.
 *  - LISTS come from the real module list endpoints, so a row shown here and
 *    the same row on its own screen cannot disagree about its contents.
 *
 * Each panel owns its loading and error state. A dashboard that blanks entirely
 * because one of six queries failed is less useful than one that shows five
 * panels and says which one is missing.
 *
 * READ IN ORDER, NOT IN A GRID. This used to open on ten identically-weighted
 * metric tiles, five across, four of which read zero against live data - the
 * shape of every admin template ever generated, and one that gave a lifetime
 * total the same voice as a decision somebody is waiting on. The bands below
 * are ordered the way the desk actually works:
 *
 *   1. what needs a decision           - the only thing that is urgent
 *   2. what is moving                  - the queues, as documents not cards
 *   3. where the organization stands   - a ledger, read when you want it
 *   4. how it got here                 - six months of shape
 *
 * The summary endpoint already returned `pendingApprovals`, `rfqs.awarded`,
 * `rfqs.draft`, `quotations.draft`, `suppliers.approved`, `suppliers.pendingReview`
 * and `products.active`, and the old composition displayed none of them. No new
 * request was added to fix that - the data was always arriving.
 */
export function AdminDashboard() {
  const summary = useDashboardSummary()
  const trends = useDashboardTrends('6m')

  const recentRfqs = useRfqs({ limit: 5, sort: '-createdAt' })
  const recentQuotations = useQuotations({ limit: 5, sort: '-createdAt' })
  const pendingRfqs = useRfqs({ limit: 5, status: 'PENDING_APPROVAL' })
  const pendingQuotations = useQuotations({ limit: 5, status: 'PENDING_APPROVAL' })
  const supplierRfqs = useRfqs({ limit: 5, status: 'ISSUED' })

  const s = summary.data

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Open decisions first, then what is moving, then where the organization stands."
        actions={
          <Button asChild size="sm" variant="ghost" leadingIcon={<Activity />}>
            <Link href="/activity">Activity feed</Link>
          </Button>
        }
      />

      <div className="space-y-section-lg p-gutter">
        {/* ---- Band 1: what needs a decision ----
            Full-bleed within the padded page, bounded by two hairlines rather
            than boxed. A count of zero is not a smaller card here - it does not
            render at all, because a queue nobody is waiting in is not news. */}
        <section
          aria-labelledby="attention"
          className="-mx-gutter border-y border-line bg-surface-sunken px-gutter py-gutter"
        >
          <h2 id="attention" className="text-base font-semibold text-content">
            Needs a decision
          </h2>
          {summary.isError ? (
            <div className="mt-gap-lg">
              <InlineQueryError error={summary.error} onRetry={() => void summary.refetch()} />
            </div>
          ) : summary.isPending ? (
            <div className="mt-gap-lg" aria-busy="true">
              <Skeleton variant="text" className="w-64" />
            </div>
          ) : (
            <Attention summary={s} />
          )}
        </section>

        {/* ---- Band 2: what is moving ----
            One column until `xl`. The old two-column card grid left each row
            185px of text at 1024, which truncated the RFQ number as well as the
            title - a reference nobody can read is not a reference. */}
        <div className="grid gap-section xl:grid-cols-2">
          <Queue
            title="Pending approvals"
            icon={<Inbox />}
            href="/rfqs?status=PENDING_APPROVAL"
            query={pendingRfqs}
            empty="Nothing is waiting on a decision."
          >
            {(items) => (
              <>
                {items.map((rfq) => (
                  <Row
                    key={rfq.id}
                    href={`/rfqs/${rfq.id}`}
                    primary={rfq.title}
                    secondary={rfq.rfqNumber}
                    badge={<StatusBadge status={rfq.status} size="sm" />}
                  />
                ))}
                {(pendingQuotations.data?.items ?? []).map((q) => (
                  <Row
                    key={q.id}
                    href={`/quotations/${q.id}`}
                    primary={q.title}
                    secondary={q.quotationNumber}
                    badge={<StatusBadge status={q.status} size="sm" />}
                  />
                ))}
              </>
            )}
          </Queue>

          <Queue
            title="Recent RFQs"
            icon={<FileSearch />}
            href="/rfqs"
            query={recentRfqs}
            empty="No RFQs yet."
          >
            {(items) =>
              items.map((rfq) => (
                <Row
                  key={rfq.id}
                  href={`/rfqs/${rfq.id}`}
                  primary={rfq.title}
                  secondary={rfq.rfqNumber}
                  badge={<StatusBadge status={rfq.status} size="sm" />}
                />
              ))
            }
          </Queue>

          <Queue
            title="Recent quotations"
            icon={<Quote />}
            href="/quotations"
            query={recentQuotations}
            empty="No quotations yet."
          >
            {(items) =>
              items.map((q) => (
                <Row
                  key={q.id}
                  href={`/quotations/${q.id}`}
                  primary={q.title}
                  secondary={`${q.quotationNumber} · ${formatMoney(q.grandTotal, q.currency)}`}
                  badge={<StatusBadge status={q.status} size="sm" />}
                />
              ))
            }
          </Queue>

          <Queue
            title="Supplier activity"
            icon={<Truck />}
            href="/rfqs?status=ISSUED"
            query={supplierRfqs}
            empty="Nothing is out with suppliers."
          >
            {(items) =>
              items.map((rfq) => (
                <Row
                  key={rfq.id}
                  href={`/rfqs/${rfq.id}`}
                  primary={rfq.title}
                  secondary={`${rfq.rfqNumber} · out for quotation`}
                  badge={<StatusBadge status={rfq.status} size="sm" />}
                />
              ))
            }
          </Queue>
        </div>

        {/* ---- Band 3: where the organization stands ----
            A ledger, not tiles: four columns of related figures under one rule,
            each line a label against its number in the mono face. The list and
            its name survive from the tile wall it replaces, and so does the rule
            that a figure and the count beside it are one link - a ledger line is
            a thing you click, not a label next to a thing you click. */}
        <section aria-labelledby="standing-position">
          <h2 id="standing-position" className="text-base font-semibold text-content">
            Standing position
          </h2>

          {summary.isError ? (
            <div className="mt-gap-lg">
              <InlineQueryError error={summary.error} onRetry={() => void summary.refetch()} />
            </div>
          ) : (
            <ul
              aria-label="Key figures"
              className="mt-gap-lg grid gap-gutter sm:grid-cols-2 xl:grid-cols-4"
            >
              <LedgerGroup
                loading={summary.isPending}
                figures={[
                  { label: 'RFQs', value: s?.rfqs.total, href: '/rfqs' },
                  {
                    label: 'Pending RFQs',
                    value: s?.rfqs.pendingApproval,
                    href: '/rfqs?status=PENDING_APPROVAL',
                  },
                  { label: 'Issued RFQs', value: s?.rfqs.issued, href: '/rfqs?status=ISSUED' },
                  { label: 'Awarded RFQs', value: s?.rfqs.awarded },
                  { label: 'Draft RFQs', value: s?.rfqs.draft },
                ]}
              />
              <LedgerGroup
                loading={summary.isPending}
                figures={[
                  { label: 'Quotations', value: s?.quotations.total, href: '/quotations' },
                  {
                    label: 'Pending quotations',
                    value: s?.quotations.pendingApproval,
                    href: '/quotations?status=PENDING_APPROVAL',
                  },
                  { label: 'Sent', value: s?.quotations.sent, href: '/quotations?status=SENT' },
                  {
                    label: 'Accepted',
                    value: s?.quotations.accepted,
                    href: '/quotations?status=ACCEPTED',
                  },
                  {
                    label: 'Expired',
                    value: s?.quotations.expired,
                    href: '/quotations?status=EXPIRED',
                  },
                  { label: 'Draft quotations', value: s?.quotations.draft },
                ]}
              />
              <LedgerGroup
                loading={summary.isPending}
                figures={[
                  { label: 'Suppliers', value: s?.suppliers.total, href: '/suppliers' },
                  { label: 'Approved suppliers', value: s?.suppliers.approved },
                  { label: 'Suppliers pending review', value: s?.suppliers.pendingReview },
                ]}
              />
              <LedgerGroup
                loading={summary.isPending}
                figures={[
                  { label: 'Products', value: s?.products.total, href: '/catalog/products' },
                  { label: 'Active products', value: s?.products.active },
                ]}
              />
            </ul>
          )}
        </section>

        {/* ---- Band 4: how it got here ----
            The funnels lead because a stage with nothing in it is the finding.
            The six-month charts follow, quieter, and are not deleted when the
            months are thin: an empty month is information about the months. */}
        <section aria-labelledby="six-month-view">
          <h2 id="six-month-view" className="text-base font-semibold text-content">
            Six-month view
          </h2>

          {trends.isError ? (
            <div className="mt-gap-lg">
              <InlineQueryError error={trends.error} onRetry={() => void trends.refetch()} />
            </div>
          ) : trends.isPending ? (
            <div className="mt-gap-lg grid gap-gutter lg:grid-cols-2" aria-busy="true">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="border-t border-line pt-gap-lg">
                  <Skeleton variant="text" className="w-40" />
                  <Skeleton className="mt-gap-lg h-40 w-full" />
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-gap-lg space-y-section">
              <div className="grid gap-gutter border-t border-line pt-gap-lg lg:grid-cols-2">
                <FunnelChart
                  title="RFQ approval funnel"
                  description="In lifecycle order, so an empty stage reads as a gap."
                  points={trends.data.approvalFunnel.rfqs.map((f) => ({
                    label: humanise(f.stage),
                    value: f.count,
                  }))}
                />
                <FunnelChart
                  title="Quotation approval funnel"
                  points={trends.data.approvalFunnel.quotations.map((f) => ({
                    label: humanise(f.stage),
                    value: f.count,
                  }))}
                />
              </div>

              <div className="grid gap-gutter lg:grid-cols-2">
                <div className="min-w-0 border-t border-line pt-gap-lg">
                  <BarChart
                    title="Monthly RFQs"
                    description={`Raised per month since ${monthLabel(trends.data.window.from)}.`}
                    points={trends.data.rfqs.map((p) => ({
                      label: monthLabel(p.month),
                      value: p.count,
                    }))}
                  />
                </div>
                <div className="min-w-0 border-t border-line pt-gap-lg">
                  <BarChart
                    title="Monthly quotations"
                    description={`Issued per month since ${monthLabel(trends.data.window.from)}.`}
                    points={trends.data.quotations.map((p) => ({
                      label: monthLabel(p.month),
                      value: p.count,
                    }))}
                  />
                </div>
                <div className="min-w-0 border-t border-line pt-gap-lg">
                  <LineChart
                    title="Supplier growth"
                    description="Suppliers onboarded per month."
                    points={trends.data.supplierGrowth.map((p) => ({
                      label: monthLabel(p.month),
                      value: p.count,
                    }))}
                  />
                </div>
                <div className="min-w-0 border-t border-line pt-gap-lg">
                  <RankedBars
                    title="Top countries"
                    description="Where this organization sources from."
                    points={trends.data.topCountries.map((c) => ({
                      label: c.country,
                      value: c.suppliers,
                    }))}
                  />
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </>
  )
}

/**
 * What is waiting on somebody.
 *
 * Only non-zero queues render. When every one of them is empty the section says
 * so in a sentence rather than showing four zeroes, because four zeroes look
 * like a broken screen and a sentence looks like an answer.
 *
 * `pendingApprovals` is the server's own total, printed as it arrives. The
 * figures beside it are the components the same response already carries -
 * nothing here is added up in the browser.
 */
function Attention({ summary }: { summary: ReturnType<typeof useDashboardSummary>['data'] }) {
  if (!summary) return <p className="mt-gap text-base text-content-muted">—</p>

  const waiting = [
    {
      label: 'RFQs',
      value: summary.rfqs.pendingApproval,
      href: '/rfqs?status=PENDING_APPROVAL',
    },
    {
      label: 'Quotations',
      value: summary.quotations.pendingApproval,
      href: '/quotations?status=PENDING_APPROVAL',
    },
    { label: 'Suppliers to review', value: summary.suppliers.pendingReview, href: '/suppliers' },
  ].filter((item) => item.value > 0)

  // The server's own total, printed only when it is one. A zero standing beside
  // a live count reads as an equal item and it is not one.
  const outstanding = summary.pendingApprovals > 0

  if (waiting.length === 0 && !outstanding) {
    return <p className="mt-gap text-base text-content-muted">Nothing is waiting on a decision.</p>
  }

  return (
    // The whole item is the target, label included. A link whose only content is
    // a numeral is a ten-pixel hit area and a screen reader announcement of "5".
    <ul aria-label="Waiting on a decision" className="mt-gap-lg flex flex-wrap gap-gutter">
      {waiting.map((item) => (
        <li key={item.label} className="min-w-0">
          <Link
            href={item.href}
            className="focus-ring block rounded-xs py-gap-xs pr-section hover:text-content"
          >
            <span className="block text-sm text-content-muted">{item.label}</span>
            <span className="mt-gap-xs block font-mono text-xl font-semibold tabular-nums text-content">
              {item.value}
            </span>
          </Link>
        </li>
      ))}
      {outstanding ? (
        <li className="min-w-0 py-gap-xs pr-section">
          <span className="block text-sm text-content-muted">Approvals outstanding</span>
          <span className="mt-gap-xs block font-mono text-xl font-semibold tabular-nums text-content">
            {summary.pendingApprovals}
          </span>
        </li>
      ) : null}
    </ul>
  )
}

/**
 * One column of the standing position.
 *
 * A `li` in the "Key figures" list, holding its own list of lines. The grouping
 * is the column and the rule above it, not a heading - four headings over four
 * short lists is how a ledger turns back into cards.
 */
function LedgerGroup({
  loading,
  figures,
}: {
  loading: boolean
  figures: Array<{ label: string; value: number | undefined; href?: string }>
}) {
  return (
    <li className="min-w-0 border-t border-line pt-gap-lg">
      <ul className="divide-y divide-line">
        {figures.map((f) => (
          <LedgerLine key={f.label} loading={loading} {...f} />
        ))}
      </ul>
    </li>
  )
}

/**
 * One line of the ledger.
 *
 * Label and figure inside a single link, because the whole line is the target -
 * and because a label that is not part of the link is a label a screen reader
 * reads separately from the thing it names.
 *
 * Figures the summary carries but no list page filters on are printed rather
 * than linked to a query parameter that would be ignored.
 */
function LedgerLine({
  label,
  value,
  href,
  loading,
}: {
  label: string
  value: number | undefined
  href?: string
  loading: boolean
}) {
  const line = (
    <>
      <span className="min-w-0 truncate text-sm text-content-muted">{label}</span>
      {loading ? (
        <Skeleton variant="text" className="h-4 w-8 shrink-0" />
      ) : (
        <span className="shrink-0 font-mono text-base tabular-nums text-content">
          {value ?? '\u2014'}
        </span>
      )}
    </>
  )

  return (
    <li>
      {href ? (
        <Link
          href={href}
          className="focus-ring flex items-baseline justify-between gap-gap rounded-xs py-gap hover:text-content"
        >
          {line}
        </Link>
      ) : (
        <span className="flex items-baseline justify-between gap-gap py-gap">{line}</span>
      )}
    </li>
  )
}

interface PanelQuery<T> {
  isPending: boolean
  isError: boolean
  error: unknown
  refetch: () => void
  data?: { items: T[] } | undefined
}

/**
 * One work queue.
 *
 * Was a Card. It is a section under a hairline now, which is not only quieter:
 * the card's own horizontal padding was a third of the text width at 1024, and
 * removing it is most of what makes an RFQ number readable there.
 */
function Queue<T>({
  title,
  icon,
  href,
  query,
  empty,
  children,
}: {
  title: string
  icon: ReactNode
  href: string
  query: PanelQuery<T>
  empty: string
  children: (items: T[]) => ReactNode
}) {
  const items = query.data?.items ?? []
  return (
    // min-w-0: a grid item's automatic minimum size is its min-content width, so
    // without this the track is floored by the longest RFQ title and the whole
    // row of queues grows past a phone viewport. The rows below already ask to
    // truncate; this is what lets them.
    <section className="min-w-0">
      <div className="flex items-center justify-between gap-gap border-b border-line pb-gap">
        <h2 className="text-base font-semibold text-content">{title}</h2>
        <Button asChild size="sm" variant="ghost">
          <Link href={href}>View all</Link>
        </Button>
      </div>

      {query.isPending ? (
        <div className="space-y-gap py-gap-lg" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} variant="text" className="w-full" />
          ))}
        </div>
      ) : query.isError ? (
        <div className="py-gap-lg">
          <InlineQueryError error={query.error} onRetry={() => query.refetch()} />
        </div>
      ) : items.length === 0 ? (
        <EmptyState size="sm" icon={icon} title={empty} />
      ) : (
        <ul className="divide-y divide-line">{children(items)}</ul>
      )}
    </section>
  )
}

function Row({
  href,
  primary,
  secondary,
  badge,
}: {
  href: string
  primary: string
  secondary: string
  badge?: ReactNode
}) {
  return (
    <li>
      <Link
        href={href}
        className="focus-ring flex items-center justify-between gap-gap-lg py-gap-lg hover:bg-surface-sunken"
      >
        <span className="min-w-0">
          <span className="block truncate text-base text-content">{primary}</span>
          <span className="block truncate font-mono text-2xs text-content-subtle">{secondary}</span>
        </span>
        {badge}
      </Link>
    </li>
  )
}
