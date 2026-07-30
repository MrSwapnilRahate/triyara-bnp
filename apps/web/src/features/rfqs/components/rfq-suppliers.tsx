'use client'

import {
  Alert,
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
  Separator,
  Skeleton,
  StatusBadge,
  useToast,
} from '@triyara/ui'
import { Ban, Plus, Users } from 'lucide-react'
import { useState } from 'react'

import { InlineQueryError } from '@/components/data/query-boundary'
import { useSupplierSearch } from '@/features/suppliers/api/suppliers'
import { Can } from '@/lib/ability-context'
import { describeApiError } from '@/lib/api-error'

import { useInviteSuppliers, useRfqSuppliers, useSetParticipation } from '../api/rfqs'
import type { Rfq } from '../types'

/**
 * Invited suppliers and where each one stands (§9).
 *
 * Inviting is only offered while the RFQ can still take new bidders. Once it is
 * AWARDED, CLOSED or CANCELLED the round is over, and the panel becomes a
 * record rather than a workspace.
 */
export function RfqSuppliers({ rfq }: { rfq: Rfq }) {
  const toast = useToast()
  const participants = useRfqSuppliers(rfq.id)
  const [inviting, setInviting] = useState(false)

  const roundOpen = !['AWARDED', 'CLOSED', 'CANCELLED'].includes(rfq.status)

  if (participants.isPending)
    return (
      <Card>
        <CardContent className="space-y-gap-lg py-gutter" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} variant="text" className="w-full" />
          ))}
        </CardContent>
      </Card>
    )

  if (participants.isError)
    return (
      <InlineQueryError error={participants.error} onRetry={() => void participants.refetch()} />
    )

  const items = participants.data?.items ?? []
  const submitted = items.filter((p) => p.status === 'SUBMITTED').length

  return (
    <div className="space-y-gap-lg">
      <div className="flex flex-wrap items-center justify-between gap-gap-lg">
        <p className="text-sm text-content-muted">
          {items.length === 0
            ? 'Nobody invited yet.'
            : `${items.length} invited · ${submitted} submitted`}
        </p>
        {roundOpen ? (
          <Can action="update" subject="Account">
            <Button
              variant="secondary"
              size="sm"
              leadingIcon={<Plus />}
              onClick={() => setInviting(true)}
            >
              Invite suppliers
            </Button>
          </Can>
        ) : null}
      </div>

      {rfq.status === 'APPROVED' && items.length === 0 ? (
        <Alert tone="warning" title="This RFQ cannot be published yet">
          An RFQ needs at least one invited supplier before it can be issued.
        </Alert>
      ) : null}

      {items.length === 0 ? (
        <EmptyState
          size="sm"
          icon={<Users />}
          title="No suppliers invited"
          description="Invite the suppliers you want to quote against this RFQ."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <DataTable caption="Invited suppliers">
              <DataTableHead>
                <tr>
                  <th scope="col">Supplier</th>
                  <th scope="col">Status</th>
                  <th scope="col">Invited on</th>
                  <th scope="col">Submitted on</th>
                  <th scope="col">Quoted total</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </DataTableHead>
              <tbody>
                {items.map((participation) => (
                  <DataTableRow key={participation.id}>
                    <DataTableCell className="font-medium">
                      {participation.supplier?.companyName ?? '—'}
                      <span className="ml-gap font-mono text-2xs text-content-subtle">
                        {participation.supplier?.supplierCode}
                      </span>
                    </DataTableCell>
                    <DataTableCell>
                      <StatusBadge status={participation.status} size="sm" />
                      {participation.isLate ? (
                        <Badge tone="warning" size="sm" className="ml-gap">
                          Late
                        </Badge>
                      ) : null}
                    </DataTableCell>
                    <DataTableCell className="text-content-muted">
                      {participation.invitedAt
                        ? new Date(participation.invitedAt).toLocaleDateString()
                        : '—'}
                    </DataTableCell>
                    <DataTableCell className="text-content-muted">
                      {participation.submittedAt
                        ? new Date(participation.submittedAt).toLocaleDateString()
                        : '—'}
                    </DataTableCell>
                    <DataTableCell className="tabular-nums">
                      {participation.quotationTotal ?? '—'}
                    </DataTableCell>
                    <DataTableCell className="text-right">
                      {roundOpen &&
                      !['SUBMITTED', 'DECLINED', 'WITHDRAWN'].includes(participation.status) ? (
                        <Can action="update" subject="Account">
                          <DeclineButton rfqId={rfq.id} participation={participation} />
                        </Can>
                      ) : null}
                    </DataTableCell>
                  </DataTableRow>
                ))}
              </tbody>
            </DataTable>
          </CardContent>
        </Card>
      )}

      <InviteDialog
        rfqId={rfq.id}
        open={inviting}
        onOpenChange={setInviting}
        alreadyInvited={new Set(items.map((p) => p.supplierId))}
        onInvited={(count) =>
          toast.success(
            `${count} supplier${count === 1 ? '' : 's'} invited`,
            'They can submit bids once the RFQ is published.',
          )
        }
      />
    </div>
  )
}

/** Records a decline, which the API requires a reason for. */
function DeclineButton({
  rfqId,
  participation,
}: {
  rfqId: string
  participation: { id: string; version: number }
}) {
  const toast = useToast()
  const setParticipation = useSetParticipation(rfqId)
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')

  async function submit() {
    try {
      await setParticipation.mutateAsync({
        participationId: participation.id,
        dto: { status: 'DECLINED', declineReason: reason },
        version: participation.version,
      })
      toast.success('Decline recorded')
      setOpen(false)
      setReason('')
    } catch (error) {
      const described = describeApiError(error)
      toast.error(described.title, {
        ...(described.description ? { description: described.description } : {}),
      })
    }
  }

  return (
    <>
      <Button size="sm" variant="ghost" leadingIcon={<Ban />} onClick={() => setOpen(true)}>
        Decline
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record a decline</DialogTitle>
          </DialogHeader>
          <div className="px-gutter py-gap-lg">
            <Label htmlFor="decline-reason" required>
              Reason
            </Label>
            <Input
              id="decline-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Capacity is committed this quarter."
              className="mt-gap-xs"
            />
            <p className="mt-gap-xs text-xs text-content-subtle">
              A reason is required — it is what makes the sourcing record auditable later.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={reason.trim().length === 0}
              loading={setParticipation.isPending}
              onClick={() => void submit()}
            >
              Record decline
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/**
 * Supplier picker. Search is server-side and starts at two characters, matching
 * the supplier API's own minimum, so we never fire a request it would reject.
 */
function InviteDialog({
  rfqId,
  open,
  onOpenChange,
  alreadyInvited,
  onInvited,
}: {
  rfqId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  alreadyInvited: Set<string>
  onInvited: (count: number) => void
}) {
  const toast = useToast()
  const invite = useInviteSuppliers(rfqId)
  const [term, setTerm] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const results = useSupplierSearch(term, { limit: 20 })

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function submit() {
    try {
      const invited = await invite.mutateAsync({ supplierIds: [...selected] })
      onInvited(selected.size)
      // The API returns the full participation set, not just the new rows.
      void invited
      onOpenChange(false)
      setSelected(new Set())
      setTerm('')
    } catch (error) {
      const described = describeApiError(error)
      toast.error(described.title, {
        ...(described.description ? { description: described.description } : {}),
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Invite suppliers</DialogTitle>
        </DialogHeader>

        <div className="px-gutter py-gap-lg">
          <Label htmlFor="supplier-search">Search suppliers</Label>
          <Input
            id="supplier-search"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Name, code or city…"
            className="mt-gap-xs"
            autoComplete="off"
          />

          <div className="mt-gap-lg max-h-64 overflow-y-auto">
            {term.trim().length < 2 ? (
              <p className="py-gap-lg text-center text-sm text-content-subtle">
                Type at least two characters to search.
              </p>
            ) : results.isPending ? (
              <div className="space-y-gap py-gap" aria-busy="true">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} variant="text" className="w-full" />
                ))}
              </div>
            ) : results.isError ? (
              <InlineQueryError error={results.error} onRetry={() => void results.refetch()} />
            ) : (results.data ?? []).length === 0 ? (
              <p className="py-gap-lg text-center text-sm text-content-subtle">
                No suppliers match “{term}”.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {(results.data ?? []).map((supplier) => {
                  const invited = alreadyInvited.has(supplier.id)
                  return (
                    <li key={supplier.id}>
                      <label
                        className={`flex cursor-pointer items-center gap-gap-lg py-gap ${
                          invited ? 'cursor-not-allowed opacity-60' : ''
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="focus-ring"
                          disabled={invited}
                          checked={selected.has(supplier.id)}
                          onChange={() => toggle(supplier.id)}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-base text-content">
                            {supplier.companyName}
                          </span>
                          <span className="block font-mono text-2xs text-content-subtle">
                            {supplier.supplierCode}
                            {supplier.country ? ` · ${supplier.country}` : ''}
                          </span>
                        </span>
                        {invited ? (
                          <Badge size="sm" tone="info">
                            Invited
                          </Badge>
                        ) : null}
                      </label>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>

        <Separator />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={selected.size === 0}
            loading={invite.isPending}
            onClick={() => void submit()}
          >
            Invite {selected.size > 0 ? selected.size : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
