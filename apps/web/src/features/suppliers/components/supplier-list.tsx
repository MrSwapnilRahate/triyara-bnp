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
import { SUPPLIER_BUSINESS_TYPES, SUPPLIER_STATUSES } from '@triyara/validation'
import { Plus, SearchX, Truck } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type ReactNode, useMemo } from 'react'

import { DebouncedSearch } from '@/components/data/debounced-search'
import { FilterSelect } from '@/components/data/filter-select'
import { QueryBoundary } from '@/components/data/query-boundary'
import { SortableHeader } from '@/components/data/sortable-header'
import { Can } from '@/lib/ability-context'
import { nextSort, useListState } from '@/lib/list-state'

import { useSupplierCertifications, useSupplierCountries, useSuppliers } from '../api/suppliers'

interface SupplierListParams {
  [key: string]: string | undefined
  limit?: string
  sort?: string
  cursor?: string
  q?: string
  status?: string
  businessType?: string
  country?: string
  isVerified?: string
}

const DEFAULTS: Partial<SupplierListParams> = { limit: '25', sort: '-createdAt' }

/**
 * Supplier list (TRY-BNP-PORTAL-01 §9).
 *
 * The country filter is populated from GET /api/suppliers/countries - the
 * tenant's actual countries with counts, not 249 ISO codes of which most would
 * be empty. Same idea for certifications.
 */
export function SupplierList() {
  const router = useRouter()
  const { params, setFilter, setSort, nextPage, previousPage, hasPrevious, isFiltered, reset } =
    useListState<SupplierListParams>(DEFAULTS)

  const query = useMemo(
    () => ({
      limit: Number(params.limit ?? 25),
      ...(params.cursor ? { cursor: params.cursor } : {}),
      ...(params.q ? { q: params.q } : {}),
      ...(params.status ? { status: params.status as (typeof SUPPLIER_STATUSES)[number] } : {}),
      ...(params.businessType
        ? { businessType: params.businessType as (typeof SUPPLIER_BUSINESS_TYPES)[number] }
        : {}),
      ...(params.country ? { country: params.country } : {}),
      ...(params.isVerified ? { isVerified: params.isVerified as 'true' | 'false' } : {}),
      ...(params.sort ? { sort: params.sort as 'companyName' } : {}),
    }),
    [params],
  )

  const suppliers = useSuppliers(query)
  const countries = useSupplierCountries()
  const certifications = useSupplierCertifications()

  const items = suppliers.data?.items ?? []
  const pagination = suppliers.data?.meta.pagination

  let state: ReactNode
  if (suppliers.isPending) state = <SkeletonTable rows={8} columns={6} />
  else if (suppliers.isError)
    state = (
      <QueryBoundary
        isPending={false}
        isError
        error={suppliers.error}
        data={items}
        onRetry={() => void suppliers.refetch()}
      >
        {() => null}
      </QueryBoundary>
    )
  else if (items.length === 0)
    state = isFiltered ? (
      <EmptyState
        variant="filtered"
        icon={<SearchX />}
        title="No suppliers match these filters"
        description="Try a broader search, or clear the filters to see everything."
        action={
          <Button variant="secondary" onClick={reset}>
            Clear filters
          </Button>
        }
      />
    ) : (
      <EmptyState
        icon={<Truck />}
        title="No suppliers yet"
        description="Suppliers are the sourcing master record: who can supply what, and on what terms."
        action={
          <Can action="create" subject="SupplierProfile">
            <Button asChild variant="primary" leadingIcon={<Plus />}>
              <Link href="/suppliers/new">New supplier</Link>
            </Button>
          </Can>
        }
      />
    )

  return (
    <>
      <PageHeader
        title="Suppliers"
        description="Sourcing master data. Not a CRM - this is who can supply what, and on what terms."
        actions={
          <Can action="create" subject="SupplierProfile">
            <Button asChild variant="primary" leadingIcon={<Plus />}>
              <Link href="/suppliers/new">New supplier</Link>
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
                aria-label="Search suppliers"
                placeholder="Search name, code or city…"
                value={params.q ?? ''}
                onChange={(value) => setFilter('q', value || undefined)}
                className="max-w-xs"
                resultSummary={
                  suppliers.isPending
                    ? undefined
                    : `${items.length} supplier${items.length === 1 ? '' : 's'} on this page`
                }
              />
              <FilterSelect
                label="Status"
                allLabel="All statuses"
                value={params.status}
                onChange={(value) => setFilter('status', value)}
                options={SUPPLIER_STATUSES.map((s) => ({
                  value: s,
                  label: s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' '),
                }))}
                className="w-40"
              />
              <FilterSelect
                label="Country"
                allLabel="All countries"
                value={params.country}
                onChange={(value) => setFilter('country', value)}
                // Facets, with counts. The API reports what this tenant holds.
                options={(countries.data ?? []).map((c) => ({
                  value: c.country,
                  label: c.country,
                  hint: c.suppliers,
                }))}
                className="w-40"
              />
              <FilterSelect
                label="Business type"
                allLabel="All types"
                value={params.businessType}
                onChange={(value) => setFilter('businessType', value)}
                options={SUPPLIER_BUSINESS_TYPES.map((t) => ({
                  value: t,
                  label: t.charAt(0) + t.slice(1).toLowerCase().replace(/_/g, ' '),
                }))}
                className="w-48"
              />
              <FilterSelect
                label="Verified"
                allLabel="Any"
                value={params.isVerified}
                onChange={(value) => setFilter('isVerified', value)}
                options={[
                  { value: 'true', label: 'Verified' },
                  { value: 'false', label: 'Unverified' },
                ]}
                className="w-32"
              />
              {isFiltered ? (
                <Button size="sm" variant="ghost" onClick={reset}>
                  Clear filters
                </Button>
              ) : null}
              {certifications.data && certifications.data.facets.length > 0 ? (
                <span className="ml-auto text-2xs text-content-subtle">
                  {certifications.data.facets.length} certification type
                  {certifications.data.facets.length === 1 ? '' : 's'} held
                </span>
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
              loading={suppliers.isFetching}
            />
          }
        >
          <DataTable caption="Suppliers">
            <DataTableHead>
              <tr>
                <SortableHeader
                  label="Code"
                  sortKey="supplierCode"
                  currentSort={params.sort}
                  onSort={(k) => setSort(nextSort(params.sort, k))}
                />
                <SortableHeader
                  label="Company"
                  sortKey="companyName"
                  currentSort={params.sort}
                  onSort={(k) => setSort(nextSort(params.sort, k))}
                />
                <SortableHeader label="Type" currentSort={params.sort} onSort={() => undefined} />
                <SortableHeader
                  label="Location"
                  currentSort={params.sort}
                  onSort={() => undefined}
                />
                <SortableHeader label="Status" currentSort={params.sort} onSort={() => undefined} />
                <SortableHeader
                  label="Verified"
                  currentSort={params.sort}
                  onSort={() => undefined}
                />
              </tr>
            </DataTableHead>
            <tbody>
              {items.map((supplier) => (
                <DataTableRow
                  key={supplier.id}
                  interactive
                  tabIndex={0}
                  role="link"
                  aria-label={`${supplier.companyName}, ${supplier.supplierCode}`}
                  onClick={() => router.push(`/suppliers/${supplier.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      router.push(`/suppliers/${supplier.id}`)
                    }
                  }}
                >
                  <DataTableCell className="font-mono text-xs">
                    {supplier.supplierCode}
                  </DataTableCell>
                  <DataTableCell className="font-medium">{supplier.companyName}</DataTableCell>
                  <DataTableCell className="text-content-muted">
                    {supplier.businessType.charAt(0) +
                      supplier.businessType.slice(1).toLowerCase().replace(/_/g, ' ')}
                  </DataTableCell>
                  <DataTableCell className="text-content-muted">
                    {[supplier.city, supplier.country].filter(Boolean).join(', ') || '—'}
                  </DataTableCell>
                  <DataTableCell>
                    <StatusBadge status={supplier.status} size="sm" />
                  </DataTableCell>
                  <DataTableCell>
                    {supplier.isVerified ? (
                      <Badge tone="success" size="sm">
                        Verified
                      </Badge>
                    ) : (
                      <span className="text-content-subtle">—</span>
                    )}
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
