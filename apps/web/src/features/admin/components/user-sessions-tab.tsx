'use client'

import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  DataTableCell,
  DataTableHead,
  DataTableLayout,
  DataTableRow,
  EmptyState,
  SkeletonTable,
  Switch,
  useToast,
} from '@triyara/ui'
import { MonitorSmartphone } from 'lucide-react'
import { useState } from 'react'

import { QueryBoundary } from '@/components/data/query-boundary'
import { useAbility } from '@/lib/ability-context'
import { describeApiError } from '@/lib/api-error'

import { useRevokeSession, useUserSessions } from '../api/users'
import type { UserSession } from '../types'
import { describeAgent, formatWhen } from './user-presentation'

/**
 * Sessions (TRY-BNP-PORTAL-01 §12).
 *
 * Revoking needs `update User`, which the frozen ability model resolves to
 * ADMIN. A session that has already ended shows no revoke control, because
 * ending it again is not an action - it is a 409 waiting to happen.
 */
export function UserSessionsTab({ userId }: { userId: string }) {
  const ability = useAbility()
  const canRevoke = ability.can('update', 'User')
  const toast = useToast()

  const [activeOnly, setActiveOnly] = useState(true)
  const [pending, setPending] = useState<UserSession | null>(null)

  const sessions = useUserSessions(userId, activeOnly)
  const revoke = useRevokeSession(userId)
  const items = sessions.data ?? []

  return (
    <div className="mt-gap-lg">
      <DataTableLayout
        toolbar={
          <label className="flex items-center gap-gap text-xs text-content-muted">
            <Switch
              checked={activeOnly}
              onCheckedChange={setActiveOnly}
              aria-label="Show only live sessions"
            />
            Live sessions only
          </label>
        }
        {...(sessions.isPending
          ? { state: <SkeletonTable rows={5} columns={6} /> }
          : sessions.isError
            ? {
                state: (
                  <QueryBoundary
                    isPending={false}
                    isError
                    error={sessions.error}
                    data={items}
                    onRetry={() => void sessions.refetch()}
                  >
                    {() => null}
                  </QueryBoundary>
                ),
              }
            : items.length === 0
              ? {
                  state: (
                    <EmptyState
                      icon={<MonitorSmartphone />}
                      title={activeOnly ? 'No live sessions' : 'No sessions recorded'}
                      description={
                        activeOnly ? 'This person is not signed in anywhere right now.' : undefined
                      }
                    />
                  ),
                }
              : {})}
      >
        <DataTable caption="Sessions for this person">
          <DataTableHead>
            <tr>
              <th scope="col">Device</th>
              <th scope="col">Browser</th>
              <th scope="col">IP address</th>
              <th scope="col">Started</th>
              <th scope="col">Last seen</th>
              <th scope="col">Expires</th>
              <th scope="col">Status</th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </DataTableHead>
          <tbody>
            {items.map((session) => {
              const agent = describeAgent(session.userAgent)
              const ended = session.endedAt !== null
              const expired = new Date(session.expiresAt).getTime() < Date.now()
              return (
                <DataTableRow key={session.id}>
                  <DataTableCell className="whitespace-nowrap">{agent.device}</DataTableCell>
                  <DataTableCell className="whitespace-nowrap">
                    <span title={session.userAgent ?? undefined}>{agent.browser}</span>
                  </DataTableCell>
                  <DataTableCell className="font-mono text-xs">
                    {session.ipAddress ?? '—'}
                  </DataTableCell>
                  <DataTableCell className="whitespace-nowrap text-sm text-content-muted">
                    {formatWhen(session.createdAt)}
                  </DataTableCell>
                  <DataTableCell className="whitespace-nowrap text-sm text-content-muted">
                    {formatWhen(session.lastSeenAt)}
                  </DataTableCell>
                  <DataTableCell className="whitespace-nowrap text-sm text-content-muted">
                    {formatWhen(session.expiresAt)}
                  </DataTableCell>
                  <DataTableCell>
                    {ended ? (
                      <Badge size="sm" tone="neutral">
                        {session.endReason ? humaniseReason(session.endReason) : 'Ended'}
                      </Badge>
                    ) : expired ? (
                      <Badge size="sm" tone="warning">
                        Expired
                      </Badge>
                    ) : (
                      <Badge size="sm" tone="success">
                        Live
                      </Badge>
                    )}
                  </DataTableCell>
                  <DataTableCell className="text-right">
                    {canRevoke && !ended && !expired ? (
                      <Button size="sm" variant="ghost" onClick={() => setPending(session)}>
                        Revoke
                      </Button>
                    ) : null}
                  </DataTableCell>
                </DataTableRow>
              )
            })}
          </tbody>
        </DataTable>
      </DataTableLayout>

      {/* The API refuses to revoke the caller's current session, so this screen
          does not offer a control that would only produce an error. The refusal
          message is surfaced by the dialog if the server disagrees. */}
      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        title="Revoke this session?"
        description={
          pending
            ? `They will be signed out of ${describeAgent(pending.userAgent).browser} on ${describeAgent(pending.userAgent).device} the next time that session is used.`
            : ''
        }
        confirmLabel="Revoke session"
        tone="danger"
        onConfirm={async () => {
          if (!pending) return
          try {
            await revoke.mutateAsync(pending.id)
            toast.success('Session revoked')
          } catch (error) {
            const described = describeApiError(error)
            throw new Error(described.description ?? described.title)
          }
        }}
      />
    </div>
  )
}

function humaniseReason(reason: string): string {
  return reason
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}
