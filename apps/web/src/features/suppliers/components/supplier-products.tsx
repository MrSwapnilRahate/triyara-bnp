'use client'

import {
  Badge,
  Card,
  DataTable,
  DataTableCell,
  DataTableHead,
  DataTableHeaderCell,
  DataTableLayout,
  DataTableRow,
  EmptyState,
  PaginationControls,
  SkeletonTable,
} from '@triyara/ui'
import { Package } from 'lucide-react'
import { type ReactNode, useState } from 'react'

import { InlineQueryError } from '@/components/data/query-boundary'

import { useSupplierOfferings } from '../api/suppliers'

/**
 * A supplier's product offerings (§9).
 *
 * Read-only in this wave. `supplierOfferingService` exposes `update` and
 * `remove`, but no endpoints were built for them, so an edit control here would
 * have nothing to call. Stated rather than faked.
 */
export function SupplierProducts({ supplierId }: { supplierId: string }) {
  const [cursorStack, setCursorStack] = useState<string[]>([])
  const [cursor, setCursor] = useState<string | undefined>(undefined)

  const query = useSupplierOfferings(supplierId, cursor ? { cursor } : {})
  const items = query.data?.items ?? []
  const pagination = query.data?.meta.pagination

  let state: ReactNode
  if (query.isPending) state = <SkeletonTable rows={5} columns={5} />
  else if (query.isError)
    state = (
      <div className="p-gutter">
        <InlineQueryError error={query.error} onRetry={() => void query.refetch()} />
      </div>
    )
  else if (items.length === 0)
    state = (
      <EmptyState
        size="sm"
        icon={<Package />}
        title="No offerings"
        description="Offerings record what this supplier can supply, and on what terms."
      />
    )

  return (
    <Card className="max-w-4xl overflow-hidden p-0">
      <DataTableLayout
        className="rounded-none border-0"
        {...(state ? { state } : {})}
        footer={
          <PaginationControls
            count={items.length}
            limit={25}
            nextCursor={pagination?.nextCursor ?? null}
            onNext={() => {
              if (!pagination?.nextCursor) return
              setCursorStack((s) => [...s, cursor ?? ''])
              setCursor(pagination.nextCursor)
            }}
            onPrevious={() => {
              setCursorStack((s) => {
                const next = [...s]
                setCursor(next.pop() || undefined)
                return next
              })
            }}
            hasPrevious={cursorStack.length > 0}
            loading={query.isFetching}
          />
        }
      >
        <DataTable caption="Supplier product offerings">
          <DataTableHead>
            <tr>
              <DataTableHeaderCell>Product</DataTableHeaderCell>
              <DataTableHeaderCell>Supplier SKU</DataTableHeaderCell>
              <DataTableHeaderCell className="text-right">MOQ</DataTableHeaderCell>
              <DataTableHeaderCell className="text-right">Lead time</DataTableHeaderCell>
              <DataTableHeaderCell>Status</DataTableHeaderCell>
            </tr>
          </DataTableHead>
          <tbody>
            {items.map((offering) => (
              <DataTableRow key={offering.id}>
                <DataTableCell className="font-medium">
                  {offering.product?.name ?? offering.productId}
                  {offering.isPreferred ? (
                    <Badge tone="accent" size="sm" className="ml-gap">
                      Preferred
                    </Badge>
                  ) : null}
                </DataTableCell>
                <DataTableCell className="font-mono text-xs text-content-muted">
                  {offering.supplierSku ?? '—'}
                </DataTableCell>
                {/* Decimals stay strings - never parseFloat a stored decimal. */}
                <DataTableCell numeric>
                  {offering.moq ? `${offering.moq} ${offering.moqUnit ?? ''}`.trim() : '—'}
                </DataTableCell>
                <DataTableCell numeric>
                  {offering.leadTimeDays !== null ? `${offering.leadTimeDays}d` : '—'}
                </DataTableCell>
                <DataTableCell>
                  <Badge size="sm" tone={offering.status === 'ACTIVE' ? 'success' : 'neutral'}>
                    {offering.status.charAt(0) +
                      offering.status.slice(1).toLowerCase().replace(/_/g, ' ')}
                  </Badge>
                </DataTableCell>
              </DataTableRow>
            ))}
          </tbody>
        </DataTable>
      </DataTableLayout>
    </Card>
  )
}
