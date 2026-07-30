'use client'

import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
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
import { ListPlus, Pencil } from 'lucide-react'
import Link from 'next/link'

import { InlineQueryError } from '@/components/data/query-boundary'
import { Can } from '@/lib/ability-context'

import { useRfq } from '../api/rfqs'
import {
  formatMoney,
  formatQuantity,
  isOverdue,
  LINES_FROZEN_IN,
  type RfqItem,
  TERMS_FROZEN_IN,
} from '../types'
import { humanise } from './humanise'
import { RfqResponses } from './rfq-responses'
import { RfqSuppliers } from './rfq-suppliers'
import { RfqTimeline } from './rfq-timeline'
import { RfqWorkflowActions } from './rfq-workflow-actions'

/** RFQ detail (TRY-BNP-PORTAL-01 §9). */
export function RfqDetail({ id }: { id: string }) {
  const query = useRfq(id)

  if (query.isPending) return <RfqDetailSkeleton />
  if (query.isError)
    return (
      <div className="p-gutter">
        <InlineQueryError error={query.error} onRetry={() => void query.refetch()} />
      </div>
    )

  const { rfq, version } = query.data
  const overdue = isOverdue(rfq)
  const termsFrozen = TERMS_FROZEN_IN.includes(rfq.status)
  const linesFrozen = LINES_FROZEN_IN.includes(rfq.status)
  const submitted = rfq.suppliers.filter((p) => p.status === 'SUBMITTED').length

  return (
    <PageHeader
      title={rfq.title}
      identifier={rfq.rfqNumber}
      status={
        <>
          <StatusBadge status={rfq.status} />
          {rfq.priority !== 'NORMAL' ? (
            <Badge tone={rfq.priority === 'URGENT' ? 'danger' : 'warning'}>
              {humanise(rfq.priority)}
            </Badge>
          ) : null}
          {overdue ? (
            <Badge tone="danger" dot>
              Overdue
            </Badge>
          ) : null}
        </>
      }
      meta={[
        { label: 'Type', value: humanise(rfq.type) },
        { label: 'Currency', value: rfq.currency ?? '—' },
        { label: 'Incoterm', value: rfq.incoterm ?? '—' },
        {
          label: 'Destination',
          value: [rfq.destinationPort, rfq.destinationCountry].filter(Boolean).join(', ') || '—',
        },
        {
          label: 'Deadline',
          value: rfq.quotationDeadline ? new Date(rfq.quotationDeadline).toLocaleDateString() : '—',
        },
        { label: 'Revision', value: String(rfq.currentRevision) },
      ]}
      actions={
        <>
          <Can action="update" subject="Account">
            <Button asChild variant="ghost" leadingIcon={<Pencil />}>
              <Link href={`/rfqs/${rfq.id}/edit`}>Edit</Link>
            </Button>
          </Can>
          <RfqWorkflowActions rfq={rfq} version={version} />
        </>
      }
      tabs={
        <Tabs defaultValue="lines">
          <TabsList>
            <TabsTrigger value="lines" count={rfq.items.length}>
              Lines
            </TabsTrigger>
            <TabsTrigger value="suppliers" count={rfq.suppliers.length}>
              Suppliers
            </TabsTrigger>
            <TabsTrigger value="bids" count={submitted}>
              Bids
            </TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
          </TabsList>

          <TabsContent value="lines" className="space-y-gap-lg p-gutter">
            {termsFrozen ? (
              <Alert tone="info" title="Commercial terms are frozen">
                This RFQ is {humanise(rfq.status).toLowerCase()} and out with suppliers. Currency,
                incoterm, deadline and destination can no longer change; revising the lines cuts a
                new revision instead.
              </Alert>
            ) : null}

            <div className="flex items-center justify-between gap-gap-lg">
              <p className="text-sm text-content-muted">
                {rfq.items.length} line{rfq.items.length === 1 ? '' : 's'} · revision{' '}
                {rfq.currentRevision}
              </p>
              {!linesFrozen ? (
                <Can action="update" subject="Account">
                  <Button asChild size="sm" variant="secondary" leadingIcon={<ListPlus />}>
                    <Link href={`/rfqs/${rfq.id}/items`}>Revise lines</Link>
                  </Button>
                </Can>
              ) : null}
            </div>

            {rfq.items.length === 0 ? (
              <EmptyState
                size="sm"
                icon={<ListPlus />}
                title="No lines yet"
                description="An RFQ needs at least one line before it can be approved."
                action={
                  <Can action="update" subject="Account">
                    <Button asChild variant="primary">
                      <Link href={`/rfqs/${rfq.id}/items`}>Add lines</Link>
                    </Button>
                  </Can>
                }
              />
            ) : (
              <Card>
                <CardContent className="p-0">
                  <DataTable caption="RFQ lines">
                    <DataTableHead>
                      <tr>
                        <th scope="col">#</th>
                        <th scope="col">Product</th>
                        <th scope="col">Quantity</th>
                        <th scope="col">Target price</th>
                        <th scope="col">Certifications</th>
                        <th scope="col">Packaging</th>
                      </tr>
                    </DataTableHead>
                    <tbody>
                      {rfq.items.map((item) => (
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
                            {item.remarks ? (
                              <span className="mt-gap-xs block text-xs text-content-muted">
                                {item.remarks}
                              </span>
                            ) : null}
                          </DataTableCell>
                          <DataTableCell className="tabular-nums">
                            {formatQuantity(item.quantity, item.unit)}
                          </DataTableCell>
                          <DataTableCell className="tabular-nums text-content-muted">
                            {formatMoney(item.targetPrice, item.targetCurrency ?? rfq.currency)}
                          </DataTableCell>
                          <DataTableCell>
                            {item.requiredCertifications.length === 0 ? (
                              <span className="text-content-subtle">—</span>
                            ) : (
                              <span className="flex flex-wrap gap-gap-xs">
                                {item.requiredCertifications.map((certification) => (
                                  <Badge key={certification} size="sm" variant="outline">
                                    {certification}
                                  </Badge>
                                ))}
                              </span>
                            )}
                          </DataTableCell>
                          <DataTableCell className="text-content-muted">
                            {item.packaging ?? '—'}
                          </DataTableCell>
                        </DataTableRow>
                      ))}
                    </tbody>
                  </DataTable>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="suppliers" className="p-gutter">
            <RfqSuppliers rfq={rfq} />
          </TabsContent>

          <TabsContent value="bids" className="p-gutter">
            <RfqResponses rfq={rfq} />
          </TabsContent>

          <TabsContent value="timeline" className="p-gutter">
            <div className="max-w-2xl">
              <RfqTimeline rfq={rfq} />
            </div>
          </TabsContent>
        </Tabs>
      }
    />
  )
}

function lineLabel(item: RfqItem): string {
  return item.product?.name ?? item.customProductName ?? 'Unnamed line'
}

function RfqDetailSkeleton() {
  return (
    <div className="border-b border-line bg-surface px-gutter py-gap-lg" aria-busy="true">
      <Skeleton variant="text" className="h-6 w-72" />
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
