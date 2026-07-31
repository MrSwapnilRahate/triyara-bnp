'use client'

import {
  Badge,
  Button,
  DataTable,
  DataTableCell,
  DataTableHead,
  DataTableLayout,
  DataTableRow,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  EmptyState,
  Input,
  Label,
  PageHeader,
  PaginationControls,
  SkeletonTable,
} from '@triyara/ui'
import { History, SearchX, ShieldAlert } from 'lucide-react'
import { type ReactNode, useMemo, useRef, useState } from 'react'

import { DebouncedSearch } from '@/components/data/debounced-search'
import { FilterSelect } from '@/components/data/filter-select'
import { QueryBoundary } from '@/components/data/query-boundary'
import { useAbility } from '@/lib/ability-context'
import { useListState } from '@/lib/list-state'

import { useAuditLog } from '../api/admin'
import type { AuditEntry } from '../types'

interface AuditParams {
  [key: string]: string | undefined
  limit?: string
  cursor?: string
  q?: string
  entityType?: string
  actorId?: string
  action?: string
  after?: string
  before?: string
}

const DEFAULTS: Partial<AuditParams> = { limit: '50' }

/**
 * The entity kinds the platform writes audit rows for. A fixed list rather than
 * a facet query: the API has no distinct-values endpoint, and inferring the
 * vocabulary from the current page would offer a filter that disappears as soon
 * as you use it.
 */
const ENTITY_TYPES = ['RFQ', 'Quotation', 'Supplier', 'Product', 'Account', 'Document']

/**
 * Audit log (TRY-BNP-PORTAL-01 §9).
 *
 * Read-only in the strongest sense: there is no mutation hook imported into
 * this file, and the API exposes no write verb to call. The trail is evidence,
 * and evidence an operator can edit is not evidence.
 *
 * ADMIN-only. The screen states that plainly when a lesser role reaches it,
 * rather than rendering an empty table that reads like "nothing has happened".
 */
export function AuditLog() {
  const ability = useAbility()
  const canRead = ability.can('manage', 'Organization')

  const { params, setFilter, nextPage, previousPage, hasPrevious, isFiltered, reset } =
    useListState<AuditParams>(DEFAULTS)
  const [selected, setSelected] = useState<AuditEntry | null>(null)
  /**
   * The row that opened the drawer, so focus can go back to it on close.
   * Radix restores to whatever it captured, and here that lands on <body> -
   * which drops a keyboard user at the top of the document and makes them tab
   * back through the whole sidebar to reach the next row.
   */
  const openedFrom = useRef<HTMLTableRowElement | null>(null)

  const query = useMemo(
    () => ({
      limit: Number(params.limit ?? 50),
      ...(params.cursor ? { cursor: params.cursor } : {}),
      ...(params.q ? { q: params.q } : {}),
      ...(params.entityType ? { entityType: params.entityType } : {}),
      ...(params.actorId ? { actorId: params.actorId } : {}),
      ...(params.action ? { action: params.action } : {}),
      ...(params.after ? { after: params.after } : {}),
      ...(params.before ? { before: params.before } : {}),
    }),
    [params],
  )

  const audit = useAuditLog(query)
  const items = audit.data?.items ?? []
  const pagination = audit.data?.meta.pagination

  if (!canRead) {
    return (
      <>
        <PageHeader title="Audit log" />
        <div className="p-gutter">
          <EmptyState
            variant="error"
            icon={<ShieldAlert />}
            title="Only administrators can read the audit log"
            description="The trail records what every record looked like before and after each change, so it is restricted above ordinary read access."
          />
        </div>
      </>
    )
  }

  let state: ReactNode
  if (audit.isPending) state = <SkeletonTable rows={10} columns={5} />
  else if (audit.isError)
    state = (
      <QueryBoundary
        isPending={false}
        isError
        error={audit.error}
        data={items}
        onRetry={() => void audit.refetch()}
      >
        {() => null}
      </QueryBoundary>
    )
  else if (items.length === 0)
    state = isFiltered ? (
      <EmptyState
        variant="filtered"
        icon={<SearchX />}
        title="No entries match these filters"
        action={
          <Button variant="secondary" onClick={reset}>
            Clear filters
          </Button>
        }
      />
    ) : (
      <EmptyState
        icon={<History />}
        title="Nothing recorded yet"
        description="Every change the platform makes is written here as it happens."
      />
    )

  return (
    <>
      <PageHeader title="Audit log" description="Every change, as it was recorded. Read-only." />

      <div className="p-gutter">
        <DataTableLayout
          className="max-h-[calc(100vh-14rem)]"
          toolbar={
            <>
              <DebouncedSearch
                aria-label="Search the audit log"
                placeholder="Search action or entity…"
                value={params.q ?? ''}
                onChange={(value) => setFilter('q', value || undefined)}
                className="max-w-xs"
                resultSummary={
                  audit.isPending
                    ? undefined
                    : `${items.length} entr${items.length === 1 ? 'y' : 'ies'} on this page`
                }
              />
              <FilterSelect
                label="Entity"
                allLabel="All entities"
                value={params.entityType}
                onChange={(value) => setFilter('entityType', value)}
                options={ENTITY_TYPES.map((t) => ({ value: t, label: t }))}
                className="w-40"
              />
              <div className="flex items-end gap-gap">
                <div>
                  <Label htmlFor="audit-after">From</Label>
                  <Input
                    id="audit-after"
                    type="date"
                    className="mt-gap-xs w-40"
                    value={params.after ?? ''}
                    onChange={(e) => setFilter('after', e.target.value || undefined)}
                  />
                </div>
                <div>
                  <Label htmlFor="audit-before">To</Label>
                  <Input
                    id="audit-before"
                    type="date"
                    className="mt-gap-xs w-40"
                    value={params.before ?? ''}
                    onChange={(e) => setFilter('before', e.target.value || undefined)}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="audit-actor">Actor</Label>
                <Input
                  id="audit-actor"
                  className="mt-gap-xs w-48"
                  placeholder="User id"
                  value={params.actorId ?? ''}
                  onChange={(e) => setFilter('actorId', e.target.value || undefined)}
                />
              </div>
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
              limit={Number(params.limit ?? 50)}
              onLimitChange={(limit) => setFilter('limit', String(limit))}
              nextCursor={pagination?.nextCursor ?? null}
              onNext={() => pagination?.nextCursor && nextPage(pagination.nextCursor)}
              onPrevious={previousPage}
              hasPrevious={hasPrevious}
              loading={audit.isFetching}
            />
          }
        >
          <DataTable caption="Audit log">
            <DataTableHead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Action</th>
                <th scope="col">Entity</th>
                <th scope="col">Actor</th>
                <th scope="col">Change</th>
              </tr>
            </DataTableHead>
            <tbody>
              {items.map((entry) => (
                <DataTableRow
                  key={entry.id}
                  interactive
                  tabIndex={0}
                  role="button"
                  aria-label={`${entry.action} on ${entry.entityType}, ${new Date(entry.createdAt).toLocaleString()}`}
                  onClick={(event) => {
                    openedFrom.current = event.currentTarget
                    setSelected(entry)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      openedFrom.current = event.currentTarget
                      setSelected(entry)
                    }
                  }}
                >
                  <DataTableCell className="whitespace-nowrap text-content-muted">
                    {new Date(entry.createdAt).toLocaleString()}
                  </DataTableCell>
                  <DataTableCell className="font-mono text-xs">{entry.action}</DataTableCell>
                  <DataTableCell>
                    <span className="text-content">{entry.entityType}</span>
                    <span className="ml-gap font-mono text-2xs text-content-subtle">
                      {entry.entityId.slice(-8)}
                    </span>
                  </DataTableCell>
                  <DataTableCell className="font-mono text-2xs text-content-muted">
                    {entry.actorId.slice(-8)}
                  </DataTableCell>
                  <DataTableCell>
                    <ChangeSummary entry={entry} />
                  </DataTableCell>
                </DataTableRow>
              ))}
            </tbody>
          </DataTable>
        </DataTableLayout>
      </div>

      <AuditDetail
        entry={selected}
        onClose={() => setSelected(null)}
        restoreFocus={() => openedFrom.current?.focus()}
      />
    </>
  )
}

/** Whether this row was a creation, a deletion or an edit, at a glance. */
function ChangeSummary({ entry }: { entry: AuditEntry }) {
  if (!entry.before && entry.after)
    return (
      <Badge tone="success" size="sm">
        Created
      </Badge>
    )
  if (entry.before && !entry.after)
    return (
      <Badge tone="danger" size="sm">
        Removed
      </Badge>
    )
  if (!entry.before && !entry.after)
    return <span className="text-2xs text-content-subtle">No payload</span>
  const changed = Object.keys(entry.after ?? {}).filter(
    (k) => JSON.stringify(entry.after?.[k]) !== JSON.stringify(entry.before?.[k]),
  )
  return (
    <span className="text-xs text-content-muted">
      {changed.length} field{changed.length === 1 ? '' : 's'}
    </span>
  )
}

/**
 * The detail drawer. Renders the stored payloads verbatim.
 *
 * The before/after snapshots are arbitrary JSON written by whichever repository
 * recorded the change, so nothing here interprets their shape - it diffs keys
 * and prints values. A viewer that assumed a schema would silently mis-render
 * the first entity that did not match it.
 */
function AuditDetail({
  entry,
  onClose,
  restoreFocus,
}: {
  entry: AuditEntry | null
  onClose: () => void
  restoreFocus: () => void
}) {
  const keys = useMemo(() => {
    if (!entry) return []
    return [
      ...new Set([...Object.keys(entry.before ?? {}), ...Object.keys(entry.after ?? {})]),
    ].sort()
  }, [entry])

  return (
    <Drawer open={entry !== null} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent
        className="w-full max-w-2xl"
        // Take over the close-time focus move: preventDefault stops Radix
        // sending focus to <body>, then we put it back on the row.
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          restoreFocus()
        }}
      >
        <DrawerHeader>
          <DrawerTitle>{entry?.action ?? 'Audit entry'}</DrawerTitle>
        </DrawerHeader>
        {entry ? (
          <DrawerBody className="space-y-gutter">
            <dl className="grid grid-cols-2 gap-gap-lg">
              <Meta label="Entity" value={`${entry.entityType} ${entry.entityId}`} mono />
              <Meta label="Actor" value={entry.actorId} mono />
              <Meta label="Recorded" value={new Date(entry.createdAt).toLocaleString()} />
              {/* Request id ties this row to a server log line and to the error
                  a user may have quoted in a ticket. Shown only when present. */}
              {entry.requestId ? <Meta label="Request id" value={entry.requestId} mono /> : null}
            </dl>

            {keys.length === 0 ? (
              <p className="text-sm text-content-muted">
                This entry carries no before or after payload.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-md border border-line">
                <table className="w-full text-left text-xs">
                  <caption className="sr-only">Field changes for {entry.action}</caption>
                  <thead className="bg-surface-sunken">
                    <tr>
                      <th scope="col" className="px-gap-lg py-gap font-medium">
                        Field
                      </th>
                      <th scope="col" className="px-gap-lg py-gap font-medium">
                        Before
                      </th>
                      <th scope="col" className="px-gap-lg py-gap font-medium">
                        After
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {keys.map((key) => {
                      const before = entry.before?.[key]
                      const after = entry.after?.[key]
                      const changed = JSON.stringify(before) !== JSON.stringify(after)
                      return (
                        <tr key={key} className={changed ? 'bg-accent-subtle/40' : undefined}>
                          <th
                            scope="row"
                            className="px-gap-lg py-gap font-mono font-normal text-content"
                          >
                            {key}
                          </th>
                          <td className="px-gap-lg py-gap font-mono text-content-muted">
                            <Value value={before} />
                          </td>
                          <td className="px-gap-lg py-gap font-mono text-content">
                            <Value value={after} />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </DrawerBody>
        ) : null}
      </DrawerContent>
    </Drawer>
  )
}

function Value({ value }: { value: unknown }) {
  if (value === undefined) return <span className="text-content-subtle">—</span>
  if (value === null) return <span className="text-content-subtle">null</span>
  if (typeof value === 'object') return <span>{JSON.stringify(value)}</span>
  return <span>{String(value)}</span>
}

function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-2xs uppercase tracking-wide text-content-subtle">{label}</dt>
      <dd className={`mt-gap-xs break-all text-sm text-content ${mono ? 'font-mono text-xs' : ''}`}>
        {value}
      </dd>
    </div>
  )
}
