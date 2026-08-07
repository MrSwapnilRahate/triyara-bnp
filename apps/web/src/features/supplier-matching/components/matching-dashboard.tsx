'use client'

import { Badge, Button, Card, EmptyState, PageHeader, Skeleton } from '@triyara/ui'
import { SlidersHorizontal, Users } from 'lucide-react'
import { useMemo, useState } from 'react'

import { InlineQueryError } from '@/components/data/query-boundary'

import { useShortlist } from '../api/matching'
import {
  activeFilterCount,
  EMPTY_FILTERS,
  filtersToQuery,
  type MatchFilters,
  type ShortlistSupplier,
  type SupplierScore,
} from '../types'
import { FilterPanel } from './filter-panel'
import { SupplierCard } from './supplier-card'
import { SupplierDrawer } from './supplier-drawer'

/**
 * Supplier Intelligence Dashboard (TRY-BNP-SUPPLIER-MATCH).
 *
 * A buyer requirement arrives; this is where it is answered. Filters narrow on
 * the server, cards rank by readiness, and the drawer holds everything needed
 * to settle a choice without leaving the list.
 *
 * The whole screen reads. Nothing here edits a supplier — a shortlist that can
 * also change the records it is judging is one mis-click from altering the
 * evidence.
 */
export function MatchingDashboard() {
  const [filters, setFilters] = useState<MatchFilters>(EMPTY_FILTERS)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)

  const query = useMemo(() => filtersToQuery(filters), [filters])
  const shortlist = useShortlist(query)

  // Highest score first. The API pages by its own order, so this sorts the page
  // rather than the whole set — which is the honest thing a cursor-paged list
  // can do, and why the page size is generous.
  const ranked = useMemo(
    () =>
      [...(shortlist.data?.items ?? [])].sort(
        (a, b) => (b.score?.score ?? 0) - (a.score?.score ?? 0),
      ),
    [shortlist.data],
  )

  const selected = ranked.find((row) => row.supplier.id === selectedId) ?? null
  const active = activeFilterCount(filters)

  return (
    <>
      <PageHeader
        title="Find suppliers"
        description="Filter, compare and shortlist against a buyer requirement."
        status={
          shortlist.data ? (
            <Badge tone="neutral">
              {ranked.length} match{ranked.length === 1 ? '' : 'es'}
            </Badge>
          ) : null
        }
        actions={
          <Button
            variant="secondary"
            leadingIcon={<SlidersHorizontal />}
            className="lg:hidden"
            onClick={() => setPanelOpen((open) => !open)}
            aria-expanded={panelOpen}
          >
            Filters
            {active > 0 ? (
              <Badge tone="accent" size="sm" className="ml-gap">
                {active}
              </Badge>
            ) : null}
          </Button>
        }
      />

      <div className="grid gap-gutter p-gutter lg:grid-cols-[18rem_minmax(0,1fr)]">
        {/*
          The panel is always in the DOM so its state survives being hidden;
          on narrow screens it collapses rather than unmounting, which would
          throw away whatever had been typed into it.
        */}
        <aside className={`${panelOpen ? 'block' : 'hidden'} lg:block`}>
          <Card className="lg:sticky lg:top-gutter">
            <FilterPanel
              filters={filters}
              onChange={setFilters}
              resultCount={shortlist.data ? ranked.length : null}
            />
          </Card>
        </aside>

        <section aria-label="Matching suppliers" className="min-w-0 space-y-gutter">
          <ShortlistBody
            isPending={shortlist.isPending}
            isError={shortlist.isError}
            error={shortlist.error}
            onRetry={() => void shortlist.refetch()}
            ranked={ranked}
            activeFilters={active}
            selectedId={selectedId}
            onOpen={setSelectedId}
            onClear={() => setFilters(EMPTY_FILTERS)}
          />
        </section>
      </div>

      <SupplierDrawer
        supplier={selected?.supplier ?? null}
        score={selected?.score ?? null}
        open={selectedId !== null}
        onClose={() => setSelectedId(null)}
      />
    </>
  )
}

function ShortlistBody({
  isPending,
  isError,
  error,
  onRetry,
  ranked,
  activeFilters,
  selectedId,
  onOpen,
  onClear,
}: {
  isPending: boolean
  isError: boolean
  error: unknown
  onRetry: () => void
  ranked: Array<{ supplier: ShortlistSupplier; score: SupplierScore | null }>
  activeFilters: number
  selectedId: string | null
  onOpen: (id: string) => void
  onClear: () => void
}) {
  if (isPending) {
    return (
      <div className="space-y-gutter">
        {[0, 1, 2].map((i) => (
          <Card key={i} className="space-y-gap">
            <Skeleton variant="text" className="w-48" />
            <Skeleton variant="text" className="w-full" />
            <Skeleton variant="text" className="w-3/4" />
          </Card>
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <Card>
        <InlineQueryError error={error} onRetry={onRetry} />
      </Card>
    )
  }

  if (ranked.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<Users />}
          title={activeFilters > 0 ? 'No supplier matches these filters' : 'No suppliers yet'}
          description={
            activeFilters > 0
              ? 'Loosen a filter — the MOQ and certification ones narrow hardest.'
              : 'Suppliers appear here once they are registered.'
          }
          {...(activeFilters > 0
            ? {
                action: (
                  <Button variant="secondary" onClick={onClear}>
                    Clear filters
                  </Button>
                ),
              }
            : {})}
        />
      </Card>
    )
  }

  return (
    <ol className="space-y-gutter" aria-label="Suppliers, best match first">
      {ranked.map(({ supplier, score }) => (
        <li key={supplier.id}>
          <SupplierCard
            supplier={supplier}
            score={score}
            selected={selectedId === supplier.id}
            onOpen={() => onOpen(supplier.id)}
          />
        </li>
      ))}
    </ol>
  )
}
