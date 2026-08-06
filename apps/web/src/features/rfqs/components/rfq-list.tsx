'use client'

import {
  Badge,
  Button,
  DataTable,
  DataTableCell,
  DataTableHead,
  DataTableLayout,
  DataTableRow,
  EmptyState,
  PageHeader,
  PaginationControls,
  SkeletonTable,
  StatusBadge,
} from '@triyara/ui'
import { RFQ_PRIORITIES, RFQ_STATUSES, RFQ_TYPES } from '@triyara/validation'
import { FileSearch, Plus, SearchX } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type ReactNode, useMemo } from 'react'

import { DebouncedSearch } from '@/components/data/debounced-search'
import { FilterSelect } from '@/components/data/filter-select'
import { QueryBoundary } from '@/components/data/query-boundary'
import { SortableHeader } from '@/components/data/sortable-header'
import { Can } from '@/lib/ability-context'
import { nextSort, useListState } from '@/lib/list-state'

import { useRfqs } from '../api/rfqs'
import { isOverdue } from '../types'
import { humanise } from './humanise'

interface RfqListParams {
  [key: string]: string | undefined
  limit?: string
  sort?: string
  cursor?: string
  q?: string
  status?: string
  type?: string
  priority?: string
  destinationCountry?: string
}

const DEFAULTS: Partial<RfqListParams> = { limit: '25', sort: '-createdAt' }

/**
 * RFQ list (TRY-BNP-PORTAL-01 §9).
 *
 * Sorted newest-first by default: sourcing works from the current desk, not
 * from the archive. The deadline column carries the overdue flag because a
 * lapsed deadline on an RFQ still awaiting bids is the one thing on this screen
 * that needs acting on today.
 */
export function RfqList() {
  const router = useRouter()
  const { params, setFilter, setSort, nextPage, previousPage, hasPrevious, isFiltered, reset } =
    useListState<RfqListParams>(DEFAULTS)

  const query = useMemo(
    () => ({
      limit: Number(params.limit ?? 25),
      ...(params.cursor ? { cursor: params.cursor } : {}),
      ...(params.q ? { q: params.q } : {}),
      ...(params.status ? { status: params.status as (typeof RFQ_STATUSES)[number] } : {}),
      ...(params.type ? { type: params.type as (typeof RFQ_TYPES)[number] } : {}),
      ...(params.priority ? { priority: params.priority as (typeof RFQ_PRIORITIES)[number] } : {}),
      ...(params.destinationCountry ? { destinationCountry: params.destinationCountry } : {}),
      ...(params.sort ? { sort: params.sort as '-createdAt' } : {}),
    }),
    [params],
  )

  const rfqs = useRfqs(query)
  const items = rfqs.data?.items ?? []
  const pagination = rfqs.data?.meta.pagination

  const open = (id: string) => router.push(`/rfqs/${id}`)

  let state: ReactNode
  if (rfqs.isPending) state = <SkeletonTable rows={8} columns={7} />
  else if (rfqs.isError)
    state = (
      <QueryBoundary
        isPending={false}
        isError
        error={rfqs.error}
        data={items}
        onRetry={() => void rfqs.refetch()}
      >
        {() => null}
      </QueryBoundary>
    )
  else if (items.length === 0)
    state = isFiltered ? (
      <EmptyState
        variant="filtered"
        icon={<SearchX />}
        title="No RFQs match these filters"
        description="Try a broader search, or clear the filters to see everything."
        action={
          <Button variant="secondary" onClick={reset}>
            Clear filters
          </Button>
        }
      />
    ) : (
      <EmptyState
        icon={<FileSearch />}
        title="No RFQs yet"
        description="An RFQ is what you send suppliers to quote against. It starts in draft, needs approval, and then goes out to the suppliers you invite."
        action={
          <Can action="create" subject="Account">
            <Button asChild variant="primary" leadingIcon={<Plus />}>
              <Link href="/rfqs/new">New RFQ</Link>
            </Button>
          </Can>
        }
      />
    )

  return (
    <>
      <PageHeader
        title="RFQs"
        description="Requests for quotation. What you asked for, who you asked, and what came back."
        actions={
          <Can action="create" subject="Account">
            <Button asChild variant="primary" leadingIcon={<Plus />}>
              <Link href="/rfqs/new">New RFQ</Link>
            </Button>
          </Can>
        }
      />

      <div className="p-gutter">
        <DataTableLayout
          className="max-h-[calc(100vh-14rem)]"
          toolbar={
            <>
              <DebouncedSearch
                aria-label="Search RFQs"
                placeholder="Search number, title or description…"
                value={params.q ?? ''}
                onChange={(value) => setFilter('q', value || undefined)}
                className="max-w-xs"
                resultSummary={
                  rfqs.isPending
                    ? undefined
                    : `${items.length} RFQ${items.length === 1 ? '' : 's'} on this page`
                }
              />
              <FilterSelect
                label="Status"
                allLabel="All statuses"
                value={params.status}
                onChange={(value) => setFilter('status', value)}
                options={RFQ_STATUSES.map((s) => ({ value: s, label: humanise(s) }))}
                className="w-44"
              />
              <FilterSelect
                label="Type"
                allLabel="All types"
                value={params.type}
                onChange={(value) => setFilter('type', value)}
                options={RFQ_TYPES.map((t) => ({ value: t, label: humanise(t) }))}
                className="w-36"
              />
              <FilterSelect
                label="Priority"
                allLabel="Any priority"
                value={params.priority}
                onChange={(value) => setFilter('priority', value)}
                options={RFQ_PRIORITIES.map((p) => ({ value: p, label: humanise(p) }))}
                className="w-36"
              />
              {isFiltered ? (
                <Button size="sm" variant="ghost" onClick={reset}>
                  Clear filters
                </Button>
              ) : null}
            </>
          }
          {...(state ? { state } : {})}
          footer={
            <PaginationControls
              count={items.length}
              limit={Number(params.limit ?? 25)}
              onLimitChange={(limit) => setFilter('limit', String(limit))}
              nextCursor={pagination?.nextCursor ?? null}
              onNext={() => pagination?.nextCursor && nextPage(pagination.nextCursor)}
              onPrevious={previousPage}
              hasPrevious={hasPrevious}
              loading={rfqs.isFetching}
            />
          }
        >
          <DataTable caption="RFQs">
            <DataTableHead>
              <tr>
                <SortableHeader
                  label="Number"
                  sortKey="rfqNumber"
                  currentSort={params.sort}
                  onSort={(k) => setSort(nextSort(params.sort, k))}
                />
                <SortableHeader label="Title" currentSort={params.sort} onSort={() => undefined} />
                <SortableHeader label="Type" currentSort={params.sort} onSort={() => undefined} />
                <SortableHeader label="Status" currentSort={params.sort} onSort={() => undefined} />
                <SortableHeader
                  label="Priority"
                  currentSort={params.sort}
                  onSort={() => undefined}
                />
                <SortableHeader
                  label="Deadline"
                  sortKey="quotationDeadline"
                  currentSort={params.sort}
                  onSort={(k) => setSort(nextSort(params.sort, k))}
                />
                <SortableHeader
                  label="Destination"
                  currentSort={params.sort}
                  onSort={() => undefined}
                />
              </tr>
            </DataTableHead>
            <tbody>
              {items.map((rfq) => {
                const overdue = isOverdue(rfq)
                return (
                  <DataTableRow
                    key={rfq.id}
                    interactive
                    tabIndex={0}
                    role="link"
                    aria-label={`${rfq.rfqNumber}, ${rfq.title}`}
                    onClick={() => open(rfq.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        open(rfq.id)
                      }
                    }}
                  >
                    <DataTableCell className="font-mono text-xs">{rfq.rfqNumber}</DataTableCell>
                    <DataTableCell className="font-medium">{rfq.title}</DataTableCell>
                    <DataTableCell className="text-content-muted">
                      {humanise(rfq.type)}
                    </DataTableCell>
                    <DataTableCell>
                      <StatusBadge status={rfq.status} size="sm" />
                    </DataTableCell>
                    <DataTableCell>
                      {rfq.priority === 'NORMAL' ? (
                        <span className="text-content-muted">Normal</span>
                      ) : (
                        <Badge
                          size="sm"
                          tone={
                            rfq.priority === 'URGENT'
                              ? 'danger'
                              : rfq.priority === 'HIGH'
                                ? 'warning'
                                : 'neutral'
                          }
                        >
                          {humanise(rfq.priority)}
                        </Badge>
                      )}
                    </DataTableCell>
                    <DataTableCell className={overdue ? 'text-danger' : 'text-content-muted'}>
                      {rfq.quotationDeadline ? (
                        <>
                          {new Date(rfq.quotationDeadline).toLocaleDateString()}
                          {overdue ? (
                            <Badge tone="danger" size="sm" className="ml-gap">
                              Overdue
                            </Badge>
                          ) : null}
                        </>
                      ) : (
                        '—'
                      )}
                    </DataTableCell>
                    <DataTableCell className="text-content-muted">
                      {[rfq.destinationPort, rfq.destinationCountry].filter(Boolean).join(', ') ||
                        '—'}
                    </DataTableCell>
                  </DataTableRow>
                )
              })}
            </tbody>
          </DataTable>
        </DataTableLayout>
      </div>
    </>
  )
}
