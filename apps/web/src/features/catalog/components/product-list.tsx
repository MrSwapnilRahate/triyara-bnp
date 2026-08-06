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
import { PRODUCT_STATUSES } from '@triyara/validation'
import { Package, Plus, SearchX } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type ReactNode, useMemo } from 'react'

import { DebouncedSearch } from '@/components/data/debounced-search'
import { FilterSelect } from '@/components/data/filter-select'
import { QueryBoundary } from '@/components/data/query-boundary'
import { SortableHeader } from '@/components/data/sortable-header'
import { Can } from '@/lib/ability-context'
import { nextSort, useListState } from '@/lib/list-state'

import { useProducts } from '../api/products'
import { useCategories } from '../api/reference'

/** Every search param this screen reads. Declared so the compiler checks them. */
interface ProductListParams {
  [key: string]: string | undefined
  limit?: string
  sort?: string
  cursor?: string
  q?: string
  status?: string
  categoryId?: string
}

const DEFAULTS: Partial<ProductListParams> = { limit: '25', sort: '-createdAt' }

/**
 * Product list (TRY-BNP-PORTAL-01 §8).
 *
 * Server-driven throughout: every filter, the sort and the page cursor are API
 * parameters carried in the URL, so a filtered view is linkable and the back
 * button behaves.
 *
 * No bulk selection. There is no bulk endpoint, and simulating one with N
 * sequential requests is a failure mode - partial completion with no
 * transaction - not a feature.
 */
export function ProductList() {
  const router = useRouter()
  const { params, setFilter, setSort, nextPage, previousPage, hasPrevious, isFiltered, reset } =
    useListState<ProductListParams>(DEFAULTS)

  const query = useMemo(
    () => ({
      limit: Number(params.limit ?? 25),
      ...(params.cursor ? { cursor: params.cursor } : {}),
      ...(params.q ? { q: params.q } : {}),
      ...(params.status ? { status: params.status as (typeof PRODUCT_STATUSES)[number] } : {}),
      ...(params.categoryId ? { categoryId: params.categoryId } : {}),
      ...(params.sort ? { sort: params.sort as 'name' } : {}),
    }),
    [params],
  )

  const products = useProducts(query)
  const categories = useCategories()

  const items = products.data?.items ?? []
  const pagination = products.data?.meta.pagination

  // The layout renders `state` INSTEAD of the table, so it must be undefined
  // once there are rows - otherwise the table never appears.
  let state: ReactNode
  if (products.isPending) state = <SkeletonTable rows={8} columns={6} />
  else if (products.isError)
    state = (
      <QueryBoundary
        isPending={false}
        isError
        error={products.error}
        data={items}
        onRetry={() => void products.refetch()}
      >
        {() => null}
      </QueryBoundary>
    )
  else if (items.length === 0)
    state = isFiltered ? (
      <EmptyState
        variant="filtered"
        icon={<SearchX />}
        title="No products match these filters"
        description="Try a broader search, or clear the filters to see everything."
        action={
          <Button variant="secondary" onClick={reset}>
            Clear filters
          </Button>
        }
      />
    ) : (
      <EmptyState
        icon={<Package />}
        title="No products yet"
        description="Products are the catalog entries every RFQ and quotation line references."
        action={
          <Can action="create" subject="ReferenceData">
            <Button asChild variant="primary" leadingIcon={<Plus />}>
              <Link href="/catalog/products/new">New product</Link>
            </Button>
          </Can>
        }
      />
    )

  return (
    <>
      <PageHeader
        title="Products"
        description="Catalog master data. Every RFQ and quotation line references a product here."
        actions={
          // Catalog is governed by ReferenceData, which only ADMIN can write.
          // Hidden rather than disabled: a greyed button teaches an export
          // manager only that something exists they cannot have (§4, §6).
          <Can action="create" subject="ReferenceData">
            <Button asChild variant="primary" leadingIcon={<Plus />}>
              <Link href="/catalog/products/new">New product</Link>
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
                aria-label="Search products"
                placeholder="Search name, SKU or brand…"
                value={params.q ?? ''}
                onChange={(value) => setFilter('q', value || undefined)}
                className="max-w-xs"
                resultSummary={
                  products.isPending
                    ? undefined
                    : `${items.length} product${items.length === 1 ? '' : 's'} on this page`
                }
              />
              <FilterSelect
                label="Status"
                allLabel="All statuses"
                value={params.status}
                onChange={(value) => setFilter('status', value)}
                options={PRODUCT_STATUSES.map((s) => ({
                  value: s,
                  label: s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' '),
                }))}
                className="w-40"
              />
              <FilterSelect
                label="Category"
                allLabel="All categories"
                value={params.categoryId}
                onChange={(value) => setFilter('categoryId', value)}
                options={(categories.data?.items ?? []).map((c) => ({
                  value: c.id,
                  label: `${'\u00a0\u00a0'.repeat(c.depth)}${c.name}`,
                }))}
                className="w-56"
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
              loading={products.isFetching}
            />
          }
        >
          <DataTable caption="Products">
            <DataTableHead>
              <tr>
                <SortableHeader
                  label="SKU"
                  sortKey="sku"
                  currentSort={params.sort}
                  onSort={(k) => setSort(nextSort(params.sort, k))}
                />
                <SortableHeader
                  label="Name"
                  sortKey="name"
                  currentSort={params.sort}
                  onSort={(k) => setSort(nextSort(params.sort, k))}
                />
                <SortableHeader
                  label="Category"
                  currentSort={params.sort}
                  onSort={() => undefined}
                />
                <SortableHeader label="Status" currentSort={params.sort} onSort={() => undefined} />
                <SortableHeader label="Origin" currentSort={params.sort} onSort={() => undefined} />
                <SortableHeader
                  label="HS code"
                  currentSort={params.sort}
                  onSort={() => undefined}
                />
              </tr>
            </DataTableHead>
            <tbody>
              {items.map((product) => (
                <DataTableRow
                  key={product.id}
                  interactive
                  tabIndex={0}
                  role="link"
                  aria-label={`${product.name}, ${product.sku}`}
                  onClick={() => router.push(`/catalog/products/${product.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      router.push(`/catalog/products/${product.id}`)
                    }
                  }}
                >
                  <DataTableCell className="font-mono text-xs">{product.sku}</DataTableCell>
                  <DataTableCell className="font-medium">{product.name}</DataTableCell>
                  <DataTableCell className="text-content-muted">
                    {product.category?.name ?? '—'}
                  </DataTableCell>
                  <DataTableCell>
                    <StatusBadge status={product.status} size="sm" />
                  </DataTableCell>
                  <DataTableCell className="text-content-muted">
                    {product.countryOfOrigin ?? '—'}
                  </DataTableCell>
                  <DataTableCell className="font-mono text-xs text-content-muted">
                    {product.hsCode ?? '—'}
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
