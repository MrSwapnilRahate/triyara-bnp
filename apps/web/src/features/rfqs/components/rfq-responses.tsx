'use client'

import {
  Badge,
  Card,
  CardContent,
  DataTable,
  DataTableCell,
  DataTableHead,
  DataTableRow,
  EmptyState,
  Skeleton,
} from '@triyara/ui'
import { Inbox } from 'lucide-react'
import { useMemo } from 'react'

import { FilterSelect } from '@/components/data/filter-select'
import { InlineQueryError } from '@/components/data/query-boundary'
import { useListState } from '@/lib/list-state'

import { useRfqResponses } from '../api/rfqs'
import { formatMoney, formatQuantity, type Rfq, type RfqItem, type RfqResponse } from '../types'

interface ResponseParams {
  [key: string]: string | undefined
  rfqItemId?: string
  rfqSupplierId?: string
}

/**
 * Supplier bids, compared line by line (§9).
 *
 * Grouped by RFQ line rather than by supplier, because the question a sourcing
 * desk actually asks is "who is cheapest on THIS line" - and that comparison is
 * unreadable if the same line is scattered across five supplier cards.
 *
 * Only current revisions are shown by default: a supplier who re-bids replaces
 * their previous price, and showing both would make the cheapest-bid marker
 * meaningless.
 */
export function RfqResponses({ rfq }: { rfq: Rfq }) {
  const { params, setFilter } = useListState<ResponseParams>({})

  const query = useMemo(
    () => ({
      currentOnly: 'true',
      ...(params.rfqItemId ? { rfqItemId: params.rfqItemId } : {}),
      ...(params.rfqSupplierId ? { rfqSupplierId: params.rfqSupplierId } : {}),
    }),
    [params],
  )

  const responses = useRfqResponses(rfq.id, query)

  const supplierName = useMemo(() => {
    const map = new Map<string, string>()
    for (const participation of rfq.suppliers) {
      map.set(participation.id, participation.supplier?.companyName ?? 'Unknown supplier')
    }
    return map
  }, [rfq.suppliers])

  const byItem = useMemo(() => {
    const items = responses.data?.items ?? []
    const map = new Map<string, RfqResponse[]>()
    for (const response of items) {
      const bucket = map.get(response.rfqItemId)
      if (bucket) bucket.push(response)
      else map.set(response.rfqItemId, [response])
    }
    return map
  }, [responses.data])

  if (responses.isPending)
    return (
      <div className="space-y-gutter" aria-busy="true">
        {[0, 1].map((i) => (
          <Card key={i}>
            <CardContent className="space-y-gap-lg py-gutter">
              <Skeleton variant="text" className="w-48" />
              <Skeleton variant="text" className="w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    )

  if (responses.isError)
    return <InlineQueryError error={responses.error} onRetry={() => void responses.refetch()} />

  const total = responses.data?.items.length ?? 0

  if (total === 0)
    return (
      <EmptyState
        icon={<Inbox />}
        title={rfq.status === 'DRAFT' ? 'No bids yet' : 'Nothing has come back yet'}
        description={
          rfq.status === 'DRAFT'
            ? 'Bids arrive once the RFQ is published to its invited suppliers.'
            : 'Invited suppliers have not submitted against this RFQ yet.'
        }
      />
    )

  return (
    <div className="space-y-gutter">
      <div className="flex flex-wrap items-center gap-gap-lg">
        <FilterSelect
          label="Line"
          allLabel="All lines"
          value={params.rfqItemId}
          onChange={(value) => setFilter('rfqItemId', value)}
          options={rfq.items.map((item) => ({
            value: item.id,
            label: `${item.lineNumber}. ${lineLabel(item)}`,
          }))}
          className="w-64"
        />
        <FilterSelect
          label="Supplier"
          allLabel="All suppliers"
          value={params.rfqSupplierId}
          onChange={(value) => setFilter('rfqSupplierId', value)}
          options={rfq.suppliers.map((participation) => ({
            value: participation.id,
            label: participation.supplier?.companyName ?? participation.id,
          }))}
          className="w-64"
        />
        <span className="text-2xs text-content-subtle">
          {total} current bid{total === 1 ? '' : 's'}
        </span>
      </div>

      {rfq.items
        .filter((item) => byItem.has(item.id))
        .map((item) => {
          const bids = [...(byItem.get(item.id) ?? [])]
          // Cheapest first. Comparison is only meaningful within one currency,
          // so the marker is withheld when a line has mixed currencies rather
          // than declaring a winner that is an artefact of the exchange rate.
          const currencies = new Set(bids.map((bid) => bid.currency))
          const comparable = currencies.size === 1
          bids.sort((a, b) => Number(a.price) - Number(b.price))
          const best = comparable ? bids[0]?.id : undefined

          return (
            <Card key={item.id}>
              <CardContent className="p-0">
                <div className="flex flex-wrap items-baseline justify-between gap-gap border-b border-line px-gutter py-gap-lg">
                  <h3 className="text-base font-medium text-content">
                    <span className="text-content-subtle">{item.lineNumber}.</span>{' '}
                    {lineLabel(item)}
                  </h3>
                  <p className="text-xs text-content-muted">
                    {formatQuantity(item.quantity, item.unit)}
                    {item.targetPrice
                      ? ` · target ${formatMoney(item.targetPrice, item.targetCurrency)}`
                      : ''}
                  </p>
                </div>

                {!comparable ? (
                  <p className="border-b border-line bg-warning-subtle px-gutter py-gap text-xs text-warning-fg">
                    Bids on this line are in different currencies, so they are not ranked.
                  </p>
                ) : null}

                <DataTable caption={`Bids for line ${item.lineNumber}`}>
                  <DataTableHead>
                    <tr>
                      <th scope="col">Supplier</th>
                      <th scope="col">Price</th>
                      <th scope="col">MOQ</th>
                      <th scope="col">Lead time</th>
                      <th scope="col">Terms</th>
                      <th scope="col">Valid until</th>
                    </tr>
                  </DataTableHead>
                  <tbody>
                    {bids.map((bid) => (
                      <DataTableRow key={bid.id}>
                        <DataTableCell className="font-medium">
                          {supplierName.get(bid.rfqSupplierId) ?? '—'}
                          {bid.id === best ? (
                            <Badge tone="success" size="sm" className="ml-gap">
                              Lowest
                            </Badge>
                          ) : null}
                          {bid.revisionNumber > 1 ? (
                            <span className="ml-gap text-2xs text-content-subtle">
                              rev {bid.revisionNumber}
                            </span>
                          ) : null}
                        </DataTableCell>
                        <DataTableCell className="font-medium tabular-nums">
                          {formatMoney(bid.price, bid.currency)}
                        </DataTableCell>
                        <DataTableCell className="tabular-nums text-content-muted">
                          {bid.moq ? `${bid.moq} ${bid.moqUnit ?? ''}`.trim() : '—'}
                        </DataTableCell>
                        <DataTableCell className="tabular-nums text-content-muted">
                          {bid.leadTimeDays === null ? '—' : `${bid.leadTimeDays} days`}
                        </DataTableCell>
                        <DataTableCell className="text-content-muted">
                          {[bid.incoterm, bid.port].filter(Boolean).join(' · ') || '—'}
                        </DataTableCell>
                        <DataTableCell className="text-content-muted">
                          {bid.validUntil ? new Date(bid.validUntil).toLocaleDateString() : '—'}
                        </DataTableCell>
                      </DataTableRow>
                    ))}
                  </tbody>
                </DataTable>
              </CardContent>
            </Card>
          )
        })}
    </div>
  )
}

function lineLabel(item: RfqItem): string {
  return item.product?.name ?? item.customProductName ?? 'Unnamed line'
}
