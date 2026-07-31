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
  StatusBadge,
} from '@triyara/ui'
import { GitBranch } from 'lucide-react'
import Link from 'next/link'

import { InlineQueryError } from '@/components/data/query-boundary'

import { useChain } from '../api/quotations'
import { formatMoney, type Quotation } from '../types'

/**
 * The supersede lineage (§9).
 *
 * Revising does not version a row - it creates a NEW quotation under the same
 * number and marks the old one SUPERSEDED. So this is a list of sibling
 * documents, and each is navigable: without it, a superseded quotation is a
 * dead end with nothing pointing at what replaced it.
 */
export function QuotationRevisions({ quotation }: { quotation: Quotation }) {
  const chain = useChain(quotation.id)

  if (chain.isPending)
    return (
      <Card>
        <CardContent className="space-y-gap-lg py-gutter" aria-busy="true">
          {[0, 1].map((i) => (
            <Skeleton key={i} variant="text" className="w-full" />
          ))}
        </CardContent>
      </Card>
    )

  if (chain.isError)
    return <InlineQueryError error={chain.error} onRetry={() => void chain.refetch()} />

  const items = chain.data?.items ?? []

  if (items.length <= 1)
    return (
      <EmptyState
        size="sm"
        icon={<GitBranch />}
        title="No earlier revisions"
        description="Revising a sent quotation creates a new one under the same number. The lineage will appear here."
      />
    )

  return (
    <Card>
      <CardContent className="p-0">
        <DataTable caption={`Revisions of ${quotation.quotationNumber}`}>
          <DataTableHead>
            <tr>
              <th scope="col">Revision</th>
              <th scope="col">Status</th>
              <th scope="col">Total</th>
              <th scope="col">Valid until</th>
              <th scope="col">Created</th>
            </tr>
          </DataTableHead>
          <tbody>
            {items.map((revision) => {
              const current = revision.id === quotation.id
              return (
                <DataTableRow key={revision.id}>
                  <DataTableCell className="font-medium">
                    {current ? (
                      <>
                        Revision {revision.revisionNumber}
                        <Badge tone="accent" size="sm" className="ml-gap">
                          Viewing
                        </Badge>
                      </>
                    ) : (
                      <Link
                        href={`/quotations/${revision.id}`}
                        className="focus-ring text-accent underline-offset-2 hover:underline"
                      >
                        Revision {revision.revisionNumber}
                      </Link>
                    )}
                  </DataTableCell>
                  <DataTableCell>
                    <StatusBadge status={revision.status} size="sm" />
                  </DataTableCell>
                  <DataTableCell className="tabular-nums">
                    {formatMoney(revision.grandTotal, revision.currency)}
                  </DataTableCell>
                  <DataTableCell className="text-content-muted">
                    {revision.validUntil ? new Date(revision.validUntil).toLocaleDateString() : '—'}
                  </DataTableCell>
                  <DataTableCell className="text-content-muted">
                    {new Date(revision.createdAt).toLocaleDateString()}
                  </DataTableCell>
                </DataTableRow>
              )
            })}
          </tbody>
        </DataTable>
      </CardContent>
    </Card>
  )
}
