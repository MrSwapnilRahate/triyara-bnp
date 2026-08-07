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
import { Inbox, ShieldAlert } from 'lucide-react'
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
} from '../api/requests'
import type { AdminAccessRequest, AdminAccessRequestStatus } from '../types'

const TABS: { value: AdminAccessRequestStatus; label: string }[] = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
]

const TONE: Record<AdminAccessRequestStatus, 'warning' | 'success' | 'danger'> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
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

  const [rejecting, setRejecting] = useState<AdminAccessRequest | null>(null)
  const approve = useApproveRequest()
  const reject = useRejectRequest()
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

  async function onReject() {
    if (!rejecting) return
    try {
      await reject.mutateAsync({ id: rejecting.id, version: rejecting.version, reason })
      toast.success('Request declined', `${rejecting.requesterName} has been told.`)
      setRejecting(null)
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

  // The panel contents, shared by every tab. Only the active TabsContent
  // mounts, so this renders once.
  const body = (
    <>
      <DebouncedSearch
        value={params.q ?? ''}
        onChange={(next) => setFilter('q', next)}
        placeholder="Search name, email or reason"
        aria-label="Search admin access requests"
      />

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
                    <DataTableCell className="max-w-md text-content-muted">
                      {request.reason}
                      {request.decisionReason ? (
                        <span className="mt-gap-xs block text-2xs text-content-subtle">
                          Decision: {request.decisionReason}
                        </span>
                      ) : null}
                    </DataTableCell>
                    <DataTableCell className="text-content-muted">
                      {new Date(request.createdAt).toLocaleDateString()}
                    </DataTableCell>
                    <DataTableCell className="text-right">
                      {request.status === 'PENDING' ? (
                        <div className="flex justify-end gap-gap-xs">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setRejecting(request)}
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

      <Dialog open={rejecting !== null} onOpenChange={(open) => !open && setRejecting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Decline this request</DialogTitle>
          </DialogHeader>
          <div className="px-gutter py-gap-lg">
            <p className="text-sm text-content-muted">
              {rejecting ? `${rejecting.requesterName} asked for administrator access.` : null}
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
            <Button variant="ghost" onClick={() => setRejecting(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={reject.isPending}
              disabled={reason.trim().length < 10}
              onClick={() => void onReject()}
            >
              Decline request
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
