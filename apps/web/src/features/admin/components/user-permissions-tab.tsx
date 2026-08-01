'use client'

import {
  Alert,
  Badge,
  DataTable,
  DataTableCell,
  DataTableHead,
  DataTableLayout,
  DataTableRow,
  Skeleton,
} from '@triyara/ui'
import { Check } from 'lucide-react'

import { InlineQueryError } from '@/components/data/query-boundary'

import { usePermissionMatrix } from '../api/users'
import type { RoleName } from '../types'
import { roleLabel } from './user-presentation'

/**
 * The permission matrix (TRY-BNP-PORTAL-01 §12).
 *
 * Rendered EXACTLY as the server sends it. There is no permission table in this
 * file, no list of subjects and no list of actions - `actions`, `subjects` and
 * every cell come from `GET /api/v1/auth/permission-matrix`, which derives them
 * from `buildAbilityFor`: the same function the guards call.
 *
 * That is the whole point of the endpoint. A copy here would be a second
 * opinion about authorization, and the first time the two disagreed this screen
 * would be lying about what the platform actually permits.
 *
 * Read-only, and it says why: CASL lives in code by an approved decision
 * (ADR-0011), so changing the matrix is a code change, not a form.
 */
export function UserPermissionsTab({ roles }: { roles: RoleName[] }) {
  const matrix = usePermissionMatrix()

  if (matrix.isPending) {
    return (
      <div className="mt-gap-lg" aria-busy="true">
        <Skeleton variant="text" className="w-64" />
        <Skeleton className="mt-gap-lg h-80 w-full" />
      </div>
    )
  }

  if (matrix.isError) {
    return (
      <div className="mt-gap-lg">
        <InlineQueryError error={matrix.error} onRetry={() => void matrix.refetch()} />
      </div>
    )
  }

  const { actions, subjects, roles: rows } = matrix.data

  /** What this person can do, by combining every role they hold. */
  const held = new Set(roles)
  const effective = new Map<string, Set<string>>()
  for (const row of rows) {
    if (!held.has(row.role)) continue
    for (const [subject, allowed] of Object.entries(row.permissions)) {
      const set = effective.get(subject) ?? new Set<string>()
      for (const action of allowed) set.add(action)
      effective.set(subject, set)
    }
  }

  return (
    <div className="mt-gap-lg grid gap-gutter">
      <Alert tone="info" title="This matrix is derived, not stored">
        The platform builds it from the same rules the guards enforce, so it cannot disagree with
        what a request will actually be allowed to do. Changing a role&apos;s permissions is a code
        change, not a setting.
      </Alert>

      <section aria-labelledby="effective-heading">
        <h2 id="effective-heading" className="text-base font-medium text-content">
          What this person may do
        </h2>
        <p className="mt-gap-xs text-xs text-content-muted">
          The union of {roles.length === 0 ? 'no roles' : roles.map(roleLabel).join(', ')}.
        </p>

        <div className="mt-gap-lg">
          <DataTableLayout>
            <DataTable caption="Effective permissions for this person">
              <DataTableHead>
                <tr>
                  <th scope="col">Subject</th>
                  {actions.map((action) => (
                    <th key={action} scope="col" className="text-center">
                      {action}
                    </th>
                  ))}
                </tr>
              </DataTableHead>
              <tbody>
                {subjects.map((subject) => {
                  const allowed = effective.get(subject) ?? new Set<string>()
                  return (
                    <DataTableRow key={subject}>
                      <DataTableCell className="font-medium text-content">{subject}</DataTableCell>
                      {actions.map((action) => (
                        <DataTableCell key={action} className="text-center">
                          <Cell allowed={allowed.has(action)} subject={subject} action={action} />
                        </DataTableCell>
                      ))}
                    </DataTableRow>
                  )
                })}
              </tbody>
            </DataTable>
          </DataTableLayout>
        </div>
      </section>

      <section aria-labelledby="by-role-heading">
        <h2 id="by-role-heading" className="text-base font-medium text-content">
          What each role may do
        </h2>
        <div className="mt-gap-lg grid gap-gap-lg sm:grid-cols-2">
          {rows.map((row) => (
            <div key={row.role} className="rounded-md border border-line bg-surface p-4">
              <div className="flex items-center gap-gap">
                <Badge size="sm" tone={row.role === 'ADMIN' ? 'accent' : 'neutral'}>
                  {roleLabel(row.role)}
                </Badge>
                {held.has(row.role) ? (
                  <span className="text-2xs text-content-subtle">held by this person</span>
                ) : null}
              </div>
              <dl className="mt-gap-lg grid gap-gap">
                {Object.entries(row.permissions).map(([subject, allowed]) => (
                  <div key={subject} className="flex items-baseline justify-between gap-gap">
                    <dt className="text-xs text-content-muted">{subject}</dt>
                    <dd className="font-mono text-2xs text-content">{allowed.join(' · ')}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

/**
 * A tick, or nothing. The accessible name carries the whole claim, because a
 * screen reader landing in a grid of ticks has no column header context to
 * borrow from.
 */
function Cell({ allowed, subject, action }: { allowed: boolean; subject: string; action: string }) {
  if (!allowed) {
    return <span className="sr-only">{`Cannot ${action} ${subject}`}</span>
  }
  return (
    <>
      <Check aria-hidden="true" className="inline size-4 text-success" />
      <span className="sr-only">{`Can ${action} ${subject}`}</span>
    </>
  )
}
