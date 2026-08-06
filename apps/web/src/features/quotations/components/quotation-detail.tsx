'use client'

import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DataTable,
  DataTableCell,
  DataTableHead,
  DataTableRow,
  EmptyState,
  PageHeader,
  Skeleton,
  StatusBadge,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@triyara/ui'
import { GitBranch, ListPlus, Pencil, Receipt } from 'lucide-react'
import Link from 'next/link'

import { InlineQueryError } from '@/components/data/query-boundary'
import { Can } from '@/lib/ability-context'

import { useQuotation } from '../api/quotations'
import {
  canRevise,
  formatMoney,
  formatPercent,
  formatQuantity,
  isEditable,
  isLapsed,
  type QuotationItem,
} from '../types'
import { humanise } from './humanise'
import { QuotationCharges, QuotationTaxes, QuotationTotals } from './quotation-money'
import { QuotationRevisions } from './quotation-revisions'
import { QuotationTimeline } from './quotation-timeline'
import { QuotationWorkflowActions } from './quotation-workflow-actions'

/** Quotation detail (TRY-BNP-PORTAL-01 §9). */
export function QuotationDetail({ id }: { id: string }) {
  const query = useQuotation(id)

  if (query.isPending) return <QuotationDetailSkeleton />
  if (query.isError)
    return (
      <div className="p-gutter">
        <InlineQueryError error={query.error} onRetry={() => void query.refetch()} />
      </div>
    )

  const { quotation, version } = query.data
  const editable = isEditable(quotation.status)
  const lapsed = isLapsed(quotation)
  // Cost is redacted wholesale, so one null implies the other.
  const costHidden = quotation.costTotal === null && quotation.marginPercent === null

  return (
    <PageHeader
      title={quotation.title}
      identifier={`${quotation.quotationNumber} · rev ${quotation.revisionNumber}`}
      status={
        <>
          <StatusBadge status={quotation.status} />
          {lapsed ? (
            <Badge tone="danger" dot>
              Lapsed
            </Badge>
          ) : null}
          {quotation.supersededAt ? <Badge tone="neutral">Superseded</Badge> : null}
        </>
      }
      meta={[
        { label: 'Type', value: humanise(quotation.type) },
        { label: 'Total', value: formatMoney(quotation.grandTotal, quotation.currency) },
        { label: 'Incoterm', value: quotation.incoterm ?? '—' },
        {
          label: 'Destination',
          value:
            [quotation.destinationPort, quotation.destinationCountry].filter(Boolean).join(', ') ||
            '—',
        },
        {
          label: 'Valid until',
          value: quotation.validUntil ? new Date(quotation.validUntil).toLocaleDateString() : '—',
        },
        {
          label: 'Lead time',
          value: quotation.leadTimeDays ? `${quotation.leadTimeDays} days` : '—',
        },
      ]}
      actions={
        <>
          {editable ? (
            <Can action="update" subject="Account">
              <Button asChild variant="ghost" leadingIcon={<Pencil />}>
                <Link href={`/quotations/${quotation.id}/edit`}>Edit</Link>
              </Button>
            </Can>
          ) : null}
          {canRevise(quotation) ? (
            <Can action="update" subject="Account">
              <Button asChild variant="secondary" leadingIcon={<GitBranch />}>
                <Link href={`/quotations/${quotation.id}/revise`}>Revise</Link>
              </Button>
            </Can>
          ) : null}
          <QuotationWorkflowActions quotation={quotation} version={version} />
        </>
      }
      tabs={
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="items" count={quotation.items.length}>
              Items
            </TabsTrigger>
            <TabsTrigger value="charges" count={quotation.charges.length}>
              Charges
            </TabsTrigger>
            <TabsTrigger value="taxes" count={quotation.taxes.length}>
              Taxes
            </TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="revisions">Revisions</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-gutter p-gutter">
            {!editable ? (
              <Alert tone="info" title="This quotation is a commitment">
                It is {humanise(quotation.status).toLowerCase()}, so its pricing is frozen. Changing
                it means creating a revision, which supersedes this document rather than editing it.
              </Alert>
            ) : null}

            {lapsed ? (
              <Alert tone="warning" title="Past its validity date">
                The offer lapsed on {new Date(quotation.validUntil!).toLocaleDateString()}. The
                status has not been moved to expired yet.
              </Alert>
            ) : null}

            {quotation.rejectionReason ? (
              <Alert tone="danger" title="Rejected">
                {quotation.rejectionReason}
              </Alert>
            ) : null}

            <div className="grid gap-gutter lg:grid-cols-[minmax(0,1fr)_auto]">
              <div className="grid gap-gutter sm:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle as="h2">Customer</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <dl className="grid gap-gap">
                      <Row label="Buyer account" value={quotation.buyerId} mono />
                      <Row label="From RFQ" value={quotation.primaryRfqId} mono />
                      <Row label="Payment terms" value={quotation.paymentTermsText} />
                    </dl>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle as="h2">Commercial terms</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <dl className="grid gap-gap">
                      <Row label="Currency" value={quotation.currency} />
                      <Row label="Incoterm" value={quotation.incoterm} />
                      <Row label="Named place" value={quotation.namedPlace} />
                      <Row
                        label="Valid from"
                        value={
                          quotation.validFrom
                            ? new Date(quotation.validFrom).toLocaleDateString()
                            : null
                        }
                      />
                    </dl>
                  </CardContent>
                </Card>

                <Card className="sm:col-span-2">
                  <CardHeader>
                    <CardTitle as="h2">Supply</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <dl className="grid gap-gap sm:grid-cols-2">
                      <Row label="Packing" value={quotation.packingSummary} />
                      <Row label="Sampling" value={quotation.samplingTerms} />
                      <Row
                        label="Lead time"
                        value={quotation.leadTimeDays ? `${quotation.leadTimeDays} days` : null}
                      />
                      <Row label="Description" value={quotation.description} />
                    </dl>
                  </CardContent>
                </Card>
              </div>

              <QuotationTotals quotation={quotation} />
            </div>
          </TabsContent>

          <TabsContent value="items" className="space-y-gap-lg p-gutter">
            <div className="flex items-center justify-between gap-gap-lg">
              <p className="text-sm text-content-muted">
                {quotation.items.length} line{quotation.items.length === 1 ? '' : 's'}
                {costHidden ? ' · cost and margin are not visible to your role' : ''}
              </p>
              {editable ? (
                <Can action="update" subject="Account">
                  <Button asChild size="sm" variant="secondary" leadingIcon={<ListPlus />}>
                    <Link href={`/quotations/${quotation.id}/items`}>Edit lines</Link>
                  </Button>
                </Can>
              ) : null}
            </div>

            {quotation.items.length === 0 ? (
              <EmptyState
                size="sm"
                icon={<ListPlus />}
                title="No lines yet"
                description="A quotation needs at least one priced line before it can be approved."
                action={
                  <Can action="update" subject="Account">
                    <Button asChild variant="primary">
                      <Link href={`/quotations/${quotation.id}/items`}>Add lines</Link>
                    </Button>
                  </Can>
                }
              />
            ) : (
              <Card>
                <CardContent className="p-0">
                  <DataTable caption="Quotation lines">
                    <DataTableHead>
                      <tr>
                        <th scope="col">#</th>
                        <th scope="col">Product</th>
                        <th scope="col">Quantity</th>
                        <th scope="col">Unit price</th>
                        {!costHidden ? <th scope="col">Unit cost</th> : null}
                        {!costHidden ? <th scope="col">Margin</th> : null}
                        <th scope="col">Line total</th>
                      </tr>
                    </DataTableHead>
                    <tbody>
                      {quotation.items.map((item) => (
                        <DataTableRow key={item.id}>
                          <DataTableCell className="tabular-nums text-content-subtle">
                            {item.lineNumber}
                          </DataTableCell>
                          <DataTableCell className="font-medium">
                            {lineLabel(item)}
                            {item.product ? (
                              <span className="ml-gap font-mono text-2xs text-content-subtle">
                                {item.product.sku}
                              </span>
                            ) : null}
                            {item.hsCode ? (
                              <span className="mt-gap-xs block text-2xs text-content-subtle">
                                HS {item.hsCode}
                                {item.countryOfOrigin ? ` · ${item.countryOfOrigin}` : ''}
                              </span>
                            ) : null}
                          </DataTableCell>
                          <DataTableCell className="tabular-nums">
                            {formatQuantity(item.quantity, item.unit)}
                          </DataTableCell>
                          <DataTableCell className="tabular-nums">
                            {formatMoney(item.unitPrice, quotation.currency)}
                          </DataTableCell>
                          {!costHidden ? (
                            <DataTableCell className="tabular-nums text-content-muted">
                              {formatMoney(item.unitCost, quotation.currency)}
                            </DataTableCell>
                          ) : null}
                          {!costHidden ? (
                            <DataTableCell className="tabular-nums text-content-muted">
                              {formatPercent(item.marginPercent)}
                            </DataTableCell>
                          ) : null}
                          <DataTableCell className="font-medium tabular-nums">
                            {formatMoney(item.lineTotal, quotation.currency)}
                          </DataTableCell>
                        </DataTableRow>
                      ))}
                    </tbody>
                  </DataTable>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="charges" className="space-y-gap-lg p-gutter">
            {editable ? (
              <div className="flex justify-end">
                <Can action="update" subject="Account">
                  <Button asChild size="sm" variant="secondary" leadingIcon={<Receipt />}>
                    <Link href={`/quotations/${quotation.id}/conditions`}>
                      Edit charges and taxes
                    </Link>
                  </Button>
                </Can>
              </div>
            ) : null}
            <QuotationCharges quotation={quotation} />
          </TabsContent>

          <TabsContent value="taxes" className="p-gutter">
            <QuotationTaxes quotation={quotation} />
          </TabsContent>

          <TabsContent value="timeline" className="p-gutter">
            <div className="max-w-2xl">
              <QuotationTimeline quotation={quotation} />
            </div>
          </TabsContent>

          <TabsContent value="revisions" className="p-gutter">
            <QuotationRevisions quotation={quotation} />
          </TabsContent>
        </Tabs>
      }
    />
  )
}

function lineLabel(item: QuotationItem): string {
  return item.product?.name ?? item.customProductName ?? 'Unnamed line'
}

function Row({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-gap-lg">
      <dt className="text-xs text-content-muted">{label}</dt>
      <dd className={`text-base text-content ${mono ? 'font-mono text-xs' : ''}`}>
        {value ?? '—'}
      </dd>
    </div>
  )
}

function QuotationDetailSkeleton() {
  return (
    <div className="border-b border-line bg-surface px-gutter py-gap-lg" aria-busy="true">
      <Skeleton variant="text" className="h-6 w-80" />
      <div className="mt-gap-lg flex gap-section">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="space-y-gap-xs">
            <Skeleton variant="text" className="w-16" />
            <Skeleton variant="text" className="w-24" />
          </div>
        ))}
      </div>
    </div>
  )
}
