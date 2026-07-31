'use client'

import {
  BarChart,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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
      <PageHeader title="Dashboard" description="What the organization is working on right now." />

      <div className="space-y-gutter p-gutter">
        {/* ---- KPI cards ---- */}
        {summary.isError ? (
          <InlineQueryError error={summary.error} onRetry={() => void summary.refetch()} />
        ) : (
          <section>
            <ul
              aria-label="Key figures"
              className="grid grid-cols-2 gap-gap-lg sm:grid-cols-3 xl:grid-cols-5"
            >
              <Kpi
                label="Products"
                value={s?.products.total}
                loading={summary.isPending}
                href="/catalog/products"
              />
              <Kpi
                label="Suppliers"
                value={s?.suppliers.total}
                loading={summary.isPending}
                href="/suppliers"
              />
              <Kpi label="RFQs" value={s?.rfqs.total} loading={summary.isPending} href="/rfqs" />
              <Kpi
                label="Pending RFQs"
                value={s?.rfqs.pendingApproval}
                loading={summary.isPending}
                href="/rfqs?status=PENDING_APPROVAL"
                tone={s && s.rfqs.pendingApproval > 0 ? 'attention' : 'plain'}
              />
              <Kpi
                label="Issued RFQs"
                value={s?.rfqs.issued}
                loading={summary.isPending}
                href="/rfqs?status=ISSUED"
              />
              <Kpi
                label="Quotations"
                value={s?.quotations.total}
                loading={summary.isPending}
                href="/quotations"
              />
              <Kpi
                label="Pending quotations"
                value={s?.quotations.pendingApproval}
                loading={summary.isPending}
                href="/quotations?status=PENDING_APPROVAL"
                tone={s && s.quotations.pendingApproval > 0 ? 'attention' : 'plain'}
              />
              <Kpi
                label="Sent"
                value={s?.quotations.sent}
                loading={summary.isPending}
                href="/quotations?status=SENT"
              />
              <Kpi
                label="Accepted"
                value={s?.quotations.accepted}
                loading={summary.isPending}
                href="/quotations?status=ACCEPTED"
              />
              <Kpi
                label="Expired"
                value={s?.quotations.expired}
                loading={summary.isPending}
                href="/quotations?status=EXPIRED"
              />
            </ul>
          </section>
        )}

        {/* ---- Charts ---- */}
        <section aria-label="Trends">
          {trends.isError ? (
            <InlineQueryError error={trends.error} onRetry={() => void trends.refetch()} />
          ) : trends.isPending ? (
            <div className="grid gap-gutter lg:grid-cols-2" aria-busy="true">
              {[0, 1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardContent className="py-gutter">
                    <Skeleton variant="text" className="w-40" />
                    <Skeleton className="mt-gap-lg h-40 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="grid gap-gutter lg:grid-cols-2">
              <Card>
                <CardContent className="py-gutter">
                  <BarChart
                    title="Monthly RFQs"
                    description={`Raised per month since ${monthLabel(trends.data.window.from)}.`}
                    points={trends.data.rfqs.map((p) => ({
                      label: monthLabel(p.month),
                      value: p.count,
                    }))}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardContent className="py-gutter">
                  <BarChart
                    title="Monthly quotations"
                    description={`Issued per month since ${monthLabel(trends.data.window.from)}.`}
                    points={trends.data.quotations.map((p) => ({
                      label: monthLabel(p.month),
                      value: p.count,
                    }))}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardContent className="py-gutter">
                  <LineChart
                    title="Supplier growth"
                    description="Suppliers onboarded per month."
                    points={trends.data.supplierGrowth.map((p) => ({
                      label: monthLabel(p.month),
                      value: p.count,
                    }))}
                  />
                </CardContent>
              </Card>

              <Card>
                <CardContent className="py-gutter">
                  <RankedBars
                    title="Top countries"
                    description="Where this organization sources from."
                    points={trends.data.topCountries.map((c) => ({
                      label: c.country,
                      value: c.suppliers,
                    }))}
                  />
                </CardContent>
              </Card>

              <Card className="lg:col-span-2">
                <CardContent className="grid gap-gutter py-gutter sm:grid-cols-2">
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
                </CardContent>
              </Card>
            </div>
          )}
        </section>

        {/* ---- Lists ---- */}
        <div className="grid gap-gutter lg:grid-cols-2">
          <Panel
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
          </Panel>

          <Panel
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
          </Panel>

          <Panel
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
          </Panel>

          <Panel
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
          </Panel>
        </div>

        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle as="h2">Recent activity</CardTitle>
            <Button asChild size="sm" variant="ghost" leadingIcon={<Activity />}>
              <Link href="/activity">Open activity feed</Link>
            </Button>
          </CardHeader>
          <CardContent className="text-sm text-content-muted">
            The full activity feed lives on its own screen, where it can be filtered and paged.
          </CardContent>
        </Card>
      </div>
    </>
  )
}

function Kpi({
  label,
  value,
  loading,
  href,
  tone = 'plain',
}: {
  label: string
  value: number | undefined
  loading: boolean
  href: string
  tone?: 'plain' | 'attention'
}) {
  return (
    <li>
      <Link
        href={href}
        className="focus-ring block rounded-md border border-line bg-surface px-gap-lg py-gap-lg transition-colors hover:border-line-strong"
      >
        <span className="block text-2xs uppercase tracking-wide text-content-subtle">{label}</span>
        {loading ? (
          <Skeleton variant="text" className="mt-gap-xs h-7 w-12" />
        ) : (
          <span
            className={`mt-gap-xs block text-2xl font-semibold tabular-nums ${
              tone === 'attention' ? 'text-warning-fg' : 'text-content'
            }`}
          >
            {value ?? '—'}
          </span>
        )}
      </Link>
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

function Panel<T>({
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
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle as="h2">{title}</CardTitle>
        <Button asChild size="sm" variant="ghost">
          <Link href={href}>View all</Link>
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {query.isPending ? (
          <div className="space-y-gap px-gutter py-gap-lg" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} variant="text" className="w-full" />
            ))}
          </div>
        ) : query.isError ? (
          <div className="px-gutter py-gap-lg">
            <InlineQueryError error={query.error} onRetry={() => query.refetch()} />
          </div>
        ) : items.length === 0 ? (
          <EmptyState size="sm" icon={icon} title={empty} />
        ) : (
          <ul className="divide-y divide-line">{children(items)}</ul>
        )}
      </CardContent>
    </Card>
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
        className="focus-ring flex items-center justify-between gap-gap-lg px-gutter py-gap-lg hover:bg-surface-sunken"
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
