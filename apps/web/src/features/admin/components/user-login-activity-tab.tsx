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
  Input,
  Label,
  SkeletonTable,
} from '@triyara/ui'
import { KeyRound } from 'lucide-react'
import { useState } from 'react'

import { FilterSelect } from '@/components/data/filter-select'
import { QueryBoundary } from '@/components/data/query-boundary'

import { type LoginActivityQuery, useLoginAttempts } from '../api/users'
import { describeAgent, formatWhen } from './user-presentation'

const OUTCOMES = [
  { value: 'SUCCESS', label: 'Success' },
  { value: 'FAILED_PASSWORD', label: 'Wrong password' },
  { value: 'FAILED_LOCKED', label: 'Account locked' },
  { value: 'FAILED_UNKNOWN_USER', label: 'Unknown user' },
]

/**
 * Sign-in history (TRY-BNP-PORTAL-01 §12).
 *
 * ADMIN only, matching `manage Organization` on the endpoint behind it.
 *
 * Filter state is local rather than in the URL: this is one tab of a detail
 * screen, and putting a date range in the address bar would collide with the
 * `tab` parameter the tabs already own.
 */
export function UserLoginActivityTab({ userId }: { userId: string }) {
  const [filters, setFilters] = useState<LoginActivityQuery>({ limit: '25' })

  const attempts = useLoginAttempts(userId, filters)
  const items = attempts.data?.items ?? []

  const set = (key: keyof LoginActivityQuery, value: string | undefined) =>
    setFilters((prev) => ({ ...prev, [key]: value || undefined }))

  const isFiltered = Boolean(filters.outcome || filters.from || filters.to)

  return (
    <div className="mt-gap-lg">
      <DataTableLayout
        toolbar={
          <>
            <FilterSelect
              label="Outcome"
              allLabel="All outcomes"
              value={filters.outcome}
              onChange={(value) => set('outcome', value)}
              options={OUTCOMES}
              className="w-48"
            />
            <div className="flex items-end gap-gap">
              <div>
                <Label htmlFor="login-from">From</Label>
                <Input
                  id="login-from"
                  type="date"
                  className="mt-gap-xs w-40"
                  value={filters.from ?? ''}
                  onChange={(e) => set('from', e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="login-to">To</Label>
                <Input
                  id="login-to"
                  type="date"
                  className="mt-gap-xs w-40"
                  value={filters.to ?? ''}
                  onChange={(e) => set('to', e.target.value)}
                />
              </div>
            </div>
            {isFiltered ? (
              <Button size="sm" variant="ghost" onClick={() => setFilters({ limit: '25' })}>
                Clear filters
              </Button>
            ) : null}
          </>
        }
        {...(attempts.isPending
          ? { state: <SkeletonTable rows={6} columns={5} /> }
          : attempts.isError
            ? {
                state: (
                  <QueryBoundary
                    isPending={false}
                    isError
                    error={attempts.error}
                    data={items}
                    onRetry={() => void attempts.refetch()}
                  >
                    {() => null}
                  </QueryBoundary>
                ),
              }
            : items.length === 0
              ? {
                  state: (
                    <EmptyState
                      variant={isFiltered ? 'filtered' : 'empty'}
                      icon={<KeyRound />}
                      title={
                        isFiltered ? 'No attempts match these filters' : 'No sign-in attempts yet'
                      }
                      {...(isFiltered
                        ? {
                            action: (
                              <Button
                                variant="secondary"
                                onClick={() => setFilters({ limit: '25' })}
                              >
                                Clear filters
                              </Button>
                            ),
                          }
                        : {})}
                    />
                  ),
                }
              : {})}
      >
        <DataTable caption="Sign-in attempts for this person">
          <DataTableHead>
            <tr>
              <th scope="col">When</th>
              <th scope="col">Outcome</th>
              <th scope="col">IP address</th>
              <th scope="col">Device</th>
              <th scope="col">Browser</th>
            </tr>
          </DataTableHead>
          <tbody>
            {items.map((attempt) => {
              const agent = describeAgent(attempt.userAgent)
              const ok = attempt.outcome === 'SUCCESS'
              return (
                <DataTableRow key={attempt.id}>
                  <DataTableCell className="whitespace-nowrap text-sm text-content-muted">
                    {formatWhen(attempt.createdAt)}
                  </DataTableCell>
                  <DataTableCell>
                    <Badge size="sm" tone={ok ? 'success' : 'danger'}>
                      {OUTCOMES.find((o) => o.value === attempt.outcome)?.label ?? attempt.outcome}
                    </Badge>
                  </DataTableCell>
                  <DataTableCell className="font-mono text-xs">
                    {attempt.ipAddress ?? '—'}
                  </DataTableCell>
                  <DataTableCell className="whitespace-nowrap">{agent.device}</DataTableCell>
                  <DataTableCell className="whitespace-nowrap">
                    <span title={attempt.userAgent ?? undefined}>{agent.browser}</span>
                  </DataTableCell>
                </DataTableRow>
              )
            })}
          </tbody>
        </DataTable>
      </DataTableLayout>
    </div>
  )
}
