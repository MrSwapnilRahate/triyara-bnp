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
import { QUOTATION_STATUSES, QUOTATION_TYPES } from '@triyara/validation'
import { Plus, Quote, SearchX } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type ReactNode, useMemo } from 'react'

import { DebouncedSearch } from '@/components/data/debounced-search'
import { FilterSelect } from '@/components/data/filter-select'
import { QueryBoundary } from '@/components/data/query-boundary'
import { SortableHeader } from '@/components/data/sortable-header'
import { Can } from '@/lib/ability-context'
import { nextSort, useListState } from '@/lib/list-state'

import { useQuotations } from '../api/quotations'
import { formatMoney, isLapsed } from '../types'
import { humanise } from './humanise'

interface QuotationListParams {
  [key: string]: string | undefined
  limit?: string
  sort?: string
  cursor?: string
  q?: string
  status?: string
  type?: string
  buyerId?: string
  currency?: string
  validUntilBefore?: string
  includeDeleted?: string
}

const DEFAULTS: Partial<QuotationListParams> = { limit: '25', sort: '-createdAt' }

/**
 * Quotation list (TRY-BNP-PORTAL-01 §9).
 *
 * The validity column carries the lapsed flag, because a quotation past its
 * validUntil that is still SENT is the one row on this screen that needs acting
 * on today - the clock has expired it even though the status has not caught up.
 *
 * Withdrawn quotations are hidden by default. That is not a UI choice: the API
 * implements withdraw as a soft delete, so they are absent unless
 * includeDeleted is set. The filter says so rather than pretending otherwise.
 */
export function QuotationList() {
  const router = useRouter()
  const { params, setFilter, setSort, nextPage, previousPage, hasPrevious, isFiltered, reset } =
    useListState<QuotationListParams>(DEFAULTS)

  const query = useMemo(
    () => ({
      limit: Number(params.limit ?? 25),
      ...(params.cursor ? { cursor: params.cursor } : {}),
      ...(params.q ? { q: params.q } : {}),
      ...(params.status ? { status: params.status as (typeof QUOTATION_STATUSES)[number] } : {}),
      ...(params.type ? { type: params.type as (typeof QUOTATION_TYPES)[number] } : {}),
      ...(params.buyerId ? { buyerId: params.buyerId } : {}),
      ...(params.currency ? { currency: params.currency } : {}),
      ...(params.validUntilBefore ? { validUntilBefore: params.validUntilBefore } : {}),
      ...(params.includeDeleted ? { includeDeleted: params.includeDeleted as 'true' } : {}),
      ...(params.sort ? { sort: params.sort as '-createdAt' } : {}),
    }),
    [params],
  )

  const quotations = useQuotations(query)
  const items = quotations.data?.items ?? []
  const pagination = quotations.data?.meta.pagination

  const open = (id: string) => router.push(`/quotations/${id}`)

  let state: ReactNode
  if (quotations.isPending) state = <SkeletonTable rows={8} columns={7} />
  else if (quotations.isError)
    state = (
      <QueryBoundary
        isPending={false}
        isError
        error={quotations.error}
        data={items}
        onRetry={() => void quotations.refetch()}
      >
        {() => null}
      </QueryBoundary>
    )
  else if (items.length === 0)
    state = isFiltered ? (
      <EmptyState
        variant="filtered"
        icon={<SearchX />}
        title="No quotations match these filters"
        description="Try a broader search, or clear the filters to see everything."
        action={
          <Button variant="secondary" onClick={reset}>
            Clear filters
          </Button>
        }
      />
    ) : (
      <EmptyState
        icon={<Quote />}
        title="No quotations yet"
        description="A quotation is the priced offer you send a buyer. It starts in draft, goes through approval, and becomes a commitment once sent."
        action={
          <Can action="create" subject="Account">
            <Button asChild variant="primary" leadingIcon={<Plus />}>
              <Link href="/quotations/new">New quotation</Link>
            </Button>
          </Can>
        }
      />
    )

  return (
    <>
      <PageHeader
        title="Quotations"
        description="Priced offers to buyers. What you quoted, at what terms, and where it stands."
        actions={
          <Can action="create" subject="Account">
            <Button asChild variant="primary" leadingIcon={<Plus />}>
              <Link href="/quotations/new">New quotation</Link>
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
                aria-label="Search quotations"
                placeholder="Search number, title or description…"
                value={params.q ?? ''}
                onChange={(value) => setFilter('q', value || undefined)}
                className="max-w-xs"
                resultSummary={
                  quotations.isPending
                    ? undefined
                    : `${items.length} quotation${items.length === 1 ? '' : 's'} on this page`
                }
              />
              <FilterSelect
                label="Status"
                allLabel="All statuses"
                value={params.status}
                onChange={(value) => setFilter('status', value)}
                options={QUOTATION_STATUSES.map((s) => ({ value: s, label: humanise(s) }))}
                className="w-48"
              />
              <FilterSelect
                label="Type"
                allLabel="All types"
                value={params.type}
                onChange={(value) => setFilter('type', value)}
                options={QUOTATION_TYPES.map((t) => ({ value: t, label: humanise(t) }))}
                className="w-36"
              />
              <FilterSelect
                label="Currency"
                allLabel="Any currency"
                value={params.currency}
                onChange={(value) => setFilter('currency', value)}
                // Derived from the page rather than a hard-coded ISO list: these
                // are the currencies this tenant is actually quoting in.
                options={[...new Set(items.map((q) => q.currency))].sort().map((c) => ({
                  value: c,
                  label: c,
                }))}
                className="w-36"
              />
              <FilterSelect
                label="Withdrawn"
                allLabel="Hidden"
                value={params.includeDeleted}
                onChange={(value) => setFilter('includeDeleted', value)}
                options={[{ value: 'true', label: 'Shown' }]}
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
              loading={quotations.isFetching}
            />
          }
        >
          <DataTable caption="Quotations">
            <DataTableHead>
              <tr>
                <SortableHeader
                  label="Number"
                  sortKey="quotationNumber"
                  currentSort={params.sort}
                  onSort={(k) => setSort(nextSort(params.sort, k))}
                />
                <SortableHeader label="Title" currentSort={params.sort} onSort={() => undefined} />
                <SortableHeader label="Status" currentSort={params.sort} onSort={() => undefined} />
                <SortableHeader
                  label="Total"
                  sortKey="grandTotal"
                  currentSort={params.sort}
                  onSort={(k) => setSort(nextSort(params.sort, k))}
                />
                <SortableHeader
                  label="Valid until"
                  sortKey="validUntil"
                  currentSort={params.sort}
                  onSort={(k) => setSort(nextSort(params.sort, k))}
                />
                <SortableHeader label="Terms" currentSort={params.sort} onSort={() => undefined} />
                <SortableHeader label="Rev" currentSort={params.sort} onSort={() => undefined} />
              </tr>
            </DataTableHead>
            <tbody>
              {items.map((quotation) => {
                const lapsed = isLapsed(quotation)
                return (
                  <DataTableRow
                    key={quotation.id}
                    interactive
                    tabIndex={0}
                    role="link"
                    aria-label={`${quotation.quotationNumber}, ${quotation.title}`}
                    onClick={() => open(quotation.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        open(quotation.id)
                      }
                    }}
                  >
                    <DataTableCell className="font-mono text-xs">
                      {quotation.quotationNumber}
                    </DataTableCell>
                    <DataTableCell className="font-medium">{quotation.title}</DataTableCell>
                    <DataTableCell>
                      <StatusBadge status={quotation.status} size="sm" />
                    </DataTableCell>
                    <DataTableCell className="font-medium tabular-nums">
                      {formatMoney(quotation.grandTotal, quotation.currency)}
                    </DataTableCell>
                    <DataTableCell className={lapsed ? 'text-danger' : 'text-content-muted'}>
                      {quotation.validUntil ? (
                        <>
                          {new Date(quotation.validUntil).toLocaleDateString()}
                          {lapsed ? (
                            <Badge tone="danger" size="sm" className="ml-gap">
                              Lapsed
                            </Badge>
                          ) : null}
                        </>
                      ) : (
                        '—'
                      )}
                    </DataTableCell>
                    <DataTableCell className="text-content-muted">
                      {[quotation.incoterm, quotation.destinationPort]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </DataTableCell>
                    <DataTableCell className="tabular-nums text-content-subtle">
                      {quotation.revisionNumber}
                      {quotation.supersededAt ? (
                        <Badge tone="neutral" size="sm" className="ml-gap">
                          Superseded
                        </Badge>
                      ) : null}
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
