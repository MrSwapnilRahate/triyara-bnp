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
import { Inbox, SearchX } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { type ReactNode, useMemo } from 'react'

import { DebouncedSearch } from '@/components/data/debounced-search'
import { FilterSelect } from '@/components/data/filter-select'
import { QueryBoundary } from '@/components/data/query-boundary'
import { SortableHeader } from '@/components/data/sortable-header'
import { nextSort, useListState } from '@/lib/list-state'

import { useQuoteRequests } from '../api/quote-requests'
import type { QuoteRequestStatus } from '../types'

/** Every search param this screen reads. Declared so the compiler checks them. */
interface QuoteRequestListParams {
  [key: string]: string | undefined
  limit?: string
  sort?: string
  cursor?: string
  q?: string
  status?: string
}

const DEFAULTS: Partial<QuoteRequestListParams> = { limit: '25', sort: '-createdAt' }

const STATUSES: QuoteRequestStatus[] = ['NEW', 'IN_REVIEW', 'QUALIFIED', 'PROMOTED', 'REJECTED']

/** Advisory only - computed by the public form, never by us. */
const SCORE_TONE: Record<string, 'danger' | 'warning' | 'neutral'> = {
  Hot: 'danger',
  Warm: 'warning',
  Cold: 'neutral',
}

function relative(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 30) return `${days} days ago`
  return new Date(iso).toLocaleDateString()
}

/**
 * The website enquiry queue (TRY-BNP-QR-01).
 *
 * Server-driven throughout, like every other list on the platform: the filter,
 * the sort and the page cursor are API parameters carried in the URL, so a
 * filtered view is linkable and the back button behaves.
 *
 * There is no "new enquiry" action, and its absence is deliberate. An intake
 * record exists because a member of the public submitted one; an operator who
 * wants to start sourcing work raises an RFQ directly.
 */
export function QuoteRequestList() {
  const router = useRouter()
  const { params, setFilter, setSort, nextPage, previousPage, hasPrevious, isFiltered, reset } =
    useListState<QuoteRequestListParams>(DEFAULTS)

  const query = useMemo(
    () => ({
      limit: Number(params.limit ?? 25),
      ...(params.cursor ? { cursor: params.cursor } : {}),
      ...(params.q ? { q: params.q } : {}),
      ...(params.status ? { status: params.status as QuoteRequestStatus } : {}),
      ...(params.sort ? { sort: params.sort } : {}),
    }),
    [params],
  )

  const requests = useQuoteRequests(query)
  const items = requests.data?.items ?? []
  const pagination = requests.data?.meta.pagination

  // The layout renders `state` INSTEAD of the table, so it must be undefined
  // once there are rows - otherwise the table never appears.
  let state: ReactNode
  if (requests.isPending) state = <SkeletonTable rows={8} columns={6} />
  else if (requests.isError)
    state = (
      <QueryBoundary
        isPending={false}
        isError
        error={requests.error}
        data={items}
        onRetry={() => void requests.refetch()}
      >
        {() => null}
      </QueryBoundary>
    )
  else if (items.length === 0)
    state = isFiltered ? (
      <EmptyState
        variant="filtered"
        icon={<SearchX />}
        title="No enquiries match these filters"
        description="Try a broader search, or clear the filters to see everything."
        action={
          <Button variant="secondary" onClick={reset}>
            Clear filters
          </Button>
        }
      />
    ) : (
      <EmptyState
        icon={<Inbox />}
        title="No website enquiries yet"
        description="Request Quote submissions from the public website arrive here. Nothing has come in."
      />
    )

  return (
    <>
      <PageHeader
        title="Website enquiries"
        description="Request Quote submissions from the public site. Qualify one here, then promote it into an RFQ."
      />

      <div className="p-gutter">
        <DataTableLayout
          className="max-h-[calc(100vh-14rem)]"
          toolbar={
            <>
              <DebouncedSearch
                aria-label="Search enquiries"
                placeholder="Search reference, product, company or contact…"
                value={params.q ?? ''}
                onChange={(value) => setFilter('q', value || undefined)}
                className="max-w-xs"
                resultSummary={
                  requests.isPending
                    ? undefined
                    : `${items.length} enquir${items.length === 1 ? 'y' : 'ies'} on this page`
                }
              />
              <FilterSelect
                label="Status"
                allLabel="All statuses"
                value={params.status}
                onChange={(value) => setFilter('status', value)}
                options={STATUSES.map((s) => ({ value: s, label: s.replace(/_/g, ' ') }))}
                className="w-48"
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
              loading={requests.isFetching}
            />
          }
        >
          <DataTable caption="Website enquiries">
            <DataTableHead>
              <tr>
                <SortableHeader
                  label="Reference"
                  sortKey="reference"
                  currentSort={params.sort}
                  onSort={(k) => setSort(nextSort(params.sort, k))}
                />
                <SortableHeader
                  label="Product"
                  currentSort={params.sort}
                  onSort={() => undefined}
                />
                <SortableHeader label="From" currentSort={params.sort} onSort={() => undefined} />
                <SortableHeader
                  label="Status"
                  sortKey="status"
                  currentSort={params.sort}
                  onSort={(k) => setSort(nextSort(params.sort, k))}
                />
                <SortableHeader
                  label="Priority"
                  currentSort={params.sort}
                  onSort={() => undefined}
                />
                <SortableHeader
                  label="Received"
                  sortKey="createdAt"
                  currentSort={params.sort}
                  onSort={(k) => setSort(nextSort(params.sort, k))}
                />
              </tr>
            </DataTableHead>
            <tbody>
              {items.map((qr) => (
                <DataTableRow
                  key={qr.id}
                  interactive
                  onClick={() => router.push(`/quote-requests/${qr.id}`)}
                >
                  <DataTableCell className="font-mono text-sm">{qr.reference}</DataTableCell>
                  <DataTableCell className="font-medium">
                    {qr.product}
                    <span className="block text-xs text-content-muted">{qr.quantity}</span>
                  </DataTableCell>
                  <DataTableCell>
                    {qr.companyName ?? qr.contactName}
                    {qr.country ? (
                      <span className="block text-xs text-content-muted">{qr.country}</span>
                    ) : null}
                  </DataTableCell>
                  <DataTableCell>
                    <StatusBadge status={qr.status} />
                  </DataTableCell>
                  <DataTableCell>
                    {/* The submitting form's own hint. Shown as a sort aid, never
                        treated as a decision - the operator reads the enquiry. */}
                    {qr.leadScore ? (
                      <Badge tone={SCORE_TONE[qr.leadScore] ?? 'neutral'}>{qr.leadScore}</Badge>
                    ) : (
                      <span className="text-content-muted">—</span>
                    )}
                  </DataTableCell>
                  <DataTableCell className="text-sm text-content-muted">
                    {relative(qr.createdAt)}
                  </DataTableCell>
                </DataTableRow>
              ))}
            </tbody>
          </DataTable>
        </DataTableLayout>
      </div>
    </>
  )
}
