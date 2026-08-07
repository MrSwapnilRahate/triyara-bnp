'use client'

import {
  Badge,
  Button,
  Card,
  CardContent,
  DataTable,
  DataTableCell,
  DataTableHead,
  DataTableRow,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  Label,
  PageHeader,
  SkeletonTable,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  useToast,
} from '@triyara/ui'
import { Download, Inbox, ShieldAlert } from 'lucide-react'
import { useState } from 'react'

import { DebouncedSearch } from '@/components/data/debounced-search'
import { InlineQueryError } from '@/components/data/query-boundary'
import { describeApiError } from '@/lib/api-error'
import { useListState } from '@/lib/list-state'

import {
  type AccessRequestQuery,
  useAccessRequests,
  useApproveRequest,
  useRejectRequest,
  useRevokeRequest,
} from '../api/requests'
import type { AdminAccessCounts, AdminAccessRequest, AdminAccessRequestStatus } from '../types'
import { Lifecycle } from './lifecycle'

const TABS: { value: AdminAccessRequestStatus; label: string }[] = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'REVOKED', label: 'Revoked' },
]

const TONE: Record<AdminAccessRequestStatus, 'warning' | 'success' | 'danger' | 'neutral'> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
  REVOKED: 'neutral',
}

/** Tenant-wide totals, so the tiles report admin access and not the search. */
function Metrics({ counts }: { counts: AdminAccessCounts }) {
  const tiles: { label: string; value: number }[] = [
    { label: 'Pending requests', value: counts.pending },
    { label: 'Approved admins', value: counts.approved },
    { label: 'Rejected requests', value: counts.rejected },
    { label: 'Revoked admins', value: counts.revoked },
    { label: 'Total requests', value: counts.total },
  ]
  return (
    <dl className="grid gap-gutter sm:grid-cols-3 lg:grid-cols-5">
      {tiles.map((tile) => (
        <div key={tile.label} className="rounded-md border border-line bg-surface p-gutter">
          <dt className="text-2xs font-semibold uppercase tracking-[0.12em] text-content-subtle">
            {tile.label}
          </dt>
          <dd className="mt-gap-xs text-lg font-semibold tabular-nums text-content">
            {tile.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * The super administrator's decision queue.
 *
 * Every refusal is enforced on the server; this screen only decides what to
 * offer. A non-super administrator who reaches the URL gets a 403 from the
 * list endpoint, and the screen says so plainly rather than rendering an empty
 * table that reads like "nobody has asked".
 */
export function AccessRequestList() {
  const toast = useToast()
  const { params, setFilter } = useListState<AccessRequestQuery>({ status: 'PENDING' })
  const status = (params.status ?? 'PENDING') as AdminAccessRequestStatus

  const requests = useAccessRequests({
    status,
    ...(params.q ? { q: params.q } : {}),
    ...(params.sort ? { sort: params.sort } : {}),
    limit: '50',
  })

  // One dialog for both refusals: declining a request and withdrawing granted
  // access ask the same thing of the super administrator - a reason - and the
  // mode decides which endpoint receives it.
  const [deciding, setDeciding] = useState<{
    request: AdminAccessRequest
    mode: 'reject' | 'revoke'
  } | null>(null)
  const approve = useApproveRequest()
  const reject = useRejectRequest()
  const revoke = useRevokeRequest()
  const [reason, setReason] = useState('')

  async function onApprove(request: AdminAccessRequest) {
    try {
      await approve.mutateAsync({ id: request.id, version: request.version })
      toast.success('Access granted', `${request.requesterName} is now an administrator.`)
    } catch (error) {
      const described = describeApiError(error)
      toast.error(described.title, {
        ...(described.description ? { description: described.description } : {}),
      })
    }
  }

  async function onDecide() {
    if (!deciding) return
    const { request, mode } = deciding
    try {
      const mutation = mode === 'revoke' ? revoke : reject
      await mutation.mutateAsync({ id: request.id, version: request.version, reason })
      toast.success(
        mode === 'revoke' ? 'Access revoked' : 'Request declined',
        `${request.requesterName} has been told.`,
      )
      setDeciding(null)
      setReason('')
    } catch (error) {
      const described = describeApiError(error)
      toast.error(described.title, {
        ...(described.description ? { description: described.description } : {}),
      })
    }
  }

  if (requests.isError) {
    return (
      <>
        <PageHeader title="Admin access requests" />
        <div className="p-gutter">
          <InlineQueryError error={requests.error} onRetry={() => void requests.refetch()} />
        </div>
      </>
    )
  }

  const items = requests.data?.items ?? []
  const counts = requests.data?.counts

  // The panel contents, shared by every tab. Only the active TabsContent
  // mounts, so this renders once.
  const body = (
    <>
      <div className="flex flex-wrap items-end gap-gutter">
        <DebouncedSearch
          value={params.q ?? ''}
          onChange={(next) => setFilter('q', next)}
          placeholder="Search name, email or reason"
          aria-label="Search admin access requests"
        />

        <div>
          <Label htmlFor="from" className="text-2xs">
            From
          </Label>
          <Input
            id="from"
            type="date"
            value={params.from ?? ''}
            onChange={(event) => setFilter('from', event.target.value)}
            className="mt-gap-xs"
          />
        </div>
        <div>
          <Label htmlFor="to" className="text-2xs">
            To
          </Label>
          <Input
            id="to"
            type="date"
            value={params.to ?? ''}
            onChange={(event) => setFilter('to', event.target.value)}
            className="mt-gap-xs"
          />
        </div>

        <Button asChild variant="secondary" leadingIcon={<Download />}>
          {/* A plain link, not fetch-then-blob: the browser streams the file
              and the Content-Disposition filename is honoured. */}
          <a href="/api/v1/admin-access-requests/export" download>
            Export CSV
          </a>
        </Button>
      </div>

      {requests.isPending ? (
        <SkeletonTable rows={5} columns={5} />
      ) : items.length === 0 ? (
        <EmptyState
          size="sm"
          icon={<Inbox />}
          title={`No ${status.toLowerCase()} requests`}
          description="Requests appear here as soon as someone asks for administrator access."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <DataTable caption="Admin access requests">
              <DataTableHead>
                <tr>
                  <th scope="col">Requester</th>
                  <th scope="col">Current role</th>
                  <th scope="col">Reason</th>
                  <th scope="col">Asked</th>
                  <th scope="col">
                    <span className="sr-only">Decision</span>
                  </th>
                </tr>
              </DataTableHead>
              <tbody>
                {items.map((request) => (
                  <DataTableRow key={request.id}>
                    <DataTableCell className="font-medium">
                      {request.requesterName}
                      <span className="block text-2xs text-content-subtle">
                        {request.requesterEmail}
                      </span>
                    </DataTableCell>
                    <DataTableCell>
                      <Badge tone="neutral" size="sm">
                        {request.currentRole}
                      </Badge>
                    </DataTableCell>
                    <DataTableCell className="max-w-lg">
                      {/* The whole lifecycle, not just the latest state: an
                          audit that cannot show "granted, then withdrawn" is
                          not an audit. */}
                      <Lifecycle request={request} />
                    </DataTableCell>
                    <DataTableCell className="text-right">
                      {request.status === 'PENDING' ? (
                        <div className="flex justify-end gap-gap-xs">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setDeciding({ request, mode: 'reject' })}
                          >
                            Decline
                          </Button>
                          <Button
                            size="sm"
                            variant="primary"
                            loading={approve.isPending}
                            onClick={() => void onApprove(request)}
                          >
                            Approve
                          </Button>
                        </div>
                      ) : request.status === 'APPROVED' ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setDeciding({ request, mode: 'revoke' })}
                        >
                          Revoke access
                        </Button>
                      ) : (
                        <Badge tone={TONE[request.status]} size="sm">
                          {request.status.charAt(0) + request.status.slice(1).toLowerCase()}
                        </Badge>
                      )}
                    </DataTableCell>
                  </DataTableRow>
                ))}
              </tbody>
            </DataTable>
          </CardContent>
        </Card>
      )}
    </>
  )

  return (
    <>
      <PageHeader
        title="Admin access requests"
        description="Who has asked for administrator access, and what was decided. Only the super administrator can approve."
      />

      <div className="space-y-gutter p-gutter">
        {counts ? <Metrics counts={counts} /> : null}

        {/* Every trigger needs a panel: Radix points aria-controls at one, and
            a tab list with no TabsContent produces a critical accessibility
            violation. Only the active panel mounts, so the body renders once. */}
        <Tabs value={status} onValueChange={(next) => setFilter('status', next)}>
          <TabsList>
            {TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {TABS.map((tab) => (
            <TabsContent key={tab.value} value={tab.value} className="space-y-gutter pt-gutter">
              {body}
            </TabsContent>
          ))}
        </Tabs>
      </div>

      <Dialog open={deciding !== null} onOpenChange={(open) => !open && setDeciding(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {deciding?.mode === 'revoke' ? 'Revoke administrator access' : 'Decline this request'}
            </DialogTitle>
          </DialogHeader>
          <div className="px-gutter py-gap-lg">
            <p className="text-sm text-content-muted">
              {deciding
                ? deciding.mode === 'revoke'
                  ? `${deciding.request.requesterName} will lose administrator access immediately.`
                  : `${deciding.request.requesterName} asked for administrator access.`
                : null}
            </p>
            <Label htmlFor="decline-reason" required className="mt-gap-lg block">
              Reason
            </Label>
            <Input
              id="decline-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Access is not needed for this role."
              className="mt-gap-xs"
            />
            <p className="mt-gap-xs text-xs text-content-subtle">
              Required, and sent to them. A refusal with no grounds is unusable.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeciding(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={reject.isPending || revoke.isPending}
              disabled={reason.trim().length < 10}
              onClick={() => void onDecide()}
            >
              {deciding?.mode === 'revoke' ? 'Revoke access' : 'Decline request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** Shown when the list endpoint refuses a non-super administrator. */
export function NotSuperAdmin() {
  return (
    <EmptyState
      variant="error"
      icon={<ShieldAlert />}
      title="Only the super administrator can review admin access requests"
      description="Holding the administrator role is not enough. Ask the super administrator to decide."
    />
  )
}
