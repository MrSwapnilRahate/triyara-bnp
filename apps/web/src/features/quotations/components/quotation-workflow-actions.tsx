'use client'

import { Button, ConfirmDialog, useToast } from '@triyara/ui'
import { CheckCircle2, Clock, Send, ThumbsUp, Trash2, XCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { type ReactNode, useId, useState } from 'react'

import { Can, useAbility } from '@/lib/ability-context'
import { describeApiError } from '@/lib/api-error'

import {
  useAcceptQuotation,
  useDecideQuotation,
  useExpireQuotation,
  useSendQuotation,
  useWithdrawQuotation,
} from '../api/quotations'
import { canMoveTo, type Quotation } from '../types'

/**
 * A disabled control with the reason it is disabled, rendered visibly beside it.
 *
 * Not a tooltip: a disabled button receives neither hover nor focus, so a
 * tooltip on one is unreachable by keyboard and by most assistive technology.
 * The reason is text, tied to the control by aria-describedby.
 */
function BlockedAction({
  reason,
  children,
}: {
  reason: string | null
  children: (describedBy: string | undefined, blocked: boolean) => ReactNode
}) {
  const id = useId()
  if (!reason) return <>{children(undefined, false)}</>
  return (
    <span className="inline-flex items-center gap-gap">
      {children(id, true)}
      <span id={id} className="max-w-[14rem] text-xs text-content-subtle">
        {reason}
      </span>
    </span>
  )
}

/**
 * Quotation workflow actions (§9, §20).
 *
 * Two gates, both of which must pass before a button renders:
 *
 *   1. The state machine. QUOTATION_TRANSITIONS mirrors quotation.service.ts, so
 *      a move that is not legal from here is a guaranteed 409 - and a button
 *      that always fails is worse than no button.
 *   2. CASL, matching the service. Send, accept, expire and the decisions need
 *      `update Account`; WITHDRAW needs `delete Account` (ADMIN only), because
 *      the service implements it as a soft delete.
 *
 * Approval carries a third condition the UI cannot evaluate: above the value
 * threshold or below the margin floor, the service demands ADMIN. That depends
 * on figures a non-privileged caller cannot even see, so the button is offered
 * and a 403 is surfaced honestly rather than guessed at.
 */
export function QuotationWorkflowActions({
  quotation,
  version,
}: {
  quotation: Quotation
  version: number
}) {
  const toast = useToast()
  const router = useRouter()
  const ability = useAbility()

  const send = useSendQuotation(quotation.id)
  const accept = useAcceptQuotation(quotation.id)
  const expire = useExpireQuotation(quotation.id)
  const decide = useDecideQuotation(quotation.id)
  const withdraw = useWithdrawQuotation(quotation.id)

  const [confirming, setConfirming] = useState<
    'send' | 'accept' | 'expire' | 'reject' | 'withdraw' | null
  >(null)

  const report = (error: unknown) => {
    const described = describeApiError(error)
    toast.error(described.title, {
      ...(described.description ? { description: described.description } : {}),
      ...(described.requestId ? { requestId: described.requestId } : {}),
    })
  }

  const status = quotation.status
  const noLines = quotation.items.length === 0

  async function submitDecision(decision: 'PENDING' | 'APPROVED') {
    try {
      await decide.mutateAsync({ dto: { decision }, version })
      toast.success(decision === 'PENDING' ? 'Sent for approval' : 'Quotation approved')
    } catch (error) {
      report(error)
    }
  }

  return (
    <>
      {/* DRAFT -> PENDING_APPROVAL. The decision with no dedicated endpoint. */}
      {canMoveTo(status, 'PENDING_APPROVAL') ? (
        <Can action="update" subject="Account">
          <BlockedAction
            reason={noLines ? 'Add at least one line before requesting approval.' : null}
          >
            {(describedBy, blocked) => (
              <Button
                variant="secondary"
                loading={decide.isPending}
                disabled={blocked}
                {...(describedBy ? { 'aria-describedby': describedBy } : {})}
                onClick={() => void submitDecision('PENDING')}
              >
                Send for approval
              </Button>
            )}
          </BlockedAction>
        </Can>
      ) : null}

      {canMoveTo(status, 'APPROVED') ? (
        <Can action="update" subject="Account">
          <BlockedAction
            reason={noLines ? 'A quotation needs priced lines before approval.' : null}
          >
            {(describedBy, blocked) => (
              <Button
                variant="primary"
                leadingIcon={<CheckCircle2 />}
                loading={decide.isPending}
                disabled={blocked}
                {...(describedBy ? { 'aria-describedby': describedBy } : {})}
                onClick={() => void submitDecision('APPROVED')}
              >
                Approve
              </Button>
            )}
          </BlockedAction>
        </Can>
      ) : null}

      {canMoveTo(status, 'REJECTED') ? (
        <Can action="update" subject="Account">
          <Button
            variant="ghost"
            leadingIcon={<XCircle />}
            loading={decide.isPending}
            onClick={() => setConfirming('reject')}
          >
            Reject
          </Button>
        </Can>
      ) : null}

      {canMoveTo(status, 'SENT') ? (
        <Can action="update" subject="Account">
          <Button
            variant="primary"
            leadingIcon={<Send />}
            loading={send.isPending}
            onClick={() => setConfirming('send')}
          >
            Send
          </Button>
        </Can>
      ) : null}

      {canMoveTo(status, 'ACCEPTED') ? (
        <Can action="update" subject="Account">
          <Button
            variant="primary"
            leadingIcon={<ThumbsUp />}
            loading={accept.isPending}
            onClick={() => setConfirming('accept')}
          >
            Accept
          </Button>
        </Can>
      ) : null}

      {canMoveTo(status, 'EXPIRED') ? (
        <Can action="update" subject="Account">
          <Button
            variant="secondary"
            leadingIcon={<Clock />}
            loading={expire.isPending}
            onClick={() => setConfirming('expire')}
          >
            Expire
          </Button>
        </Can>
      ) : null}

      {/* Withdraw needs `delete`, so it is invisible to EXPORT_MANAGER. */}
      {canMoveTo(status, 'WITHDRAWN') && ability.can('delete', 'Account') ? (
        <Button
          variant="ghost"
          leadingIcon={<Trash2 />}
          loading={withdraw.isPending}
          onClick={() => setConfirming('withdraw')}
        >
          Withdraw
        </Button>
      ) : null}

      <ConfirmDialog
        open={confirming === 'send'}
        onOpenChange={(open) => !open && setConfirming(null)}
        title={`Send ${quotation.quotationNumber}?`}
        description="Once sent, the quotation is a commitment: its pricing freezes and any change has to go through a revision."
        confirmLabel="Send"
        onConfirm={async () => {
          await send.mutateAsync(version)
          toast.success('Quotation sent', 'Pricing is now frozen.')
        }}
        onError={report}
      />

      <ConfirmDialog
        open={confirming === 'accept'}
        onOpenChange={(open) => !open && setConfirming(null)}
        title={`Record acceptance of ${quotation.quotationNumber}?`}
        description="Acceptance is terminal. The quotation cannot move again afterwards."
        confirmLabel="Record acceptance"
        onConfirm={async () => {
          await accept.mutateAsync(version)
          toast.success('Acceptance recorded')
        }}
        onError={report}
      />

      <ConfirmDialog
        open={confirming === 'expire'}
        onOpenChange={(open) => !open && setConfirming(null)}
        title={`Expire ${quotation.quotationNumber}?`}
        description="The offer lapses. It can still be withdrawn, but not accepted."
        confirmLabel="Expire"
        tone="danger"
        onConfirm={async () => {
          await expire.mutateAsync(version)
          toast.success('Quotation expired')
        }}
        onError={report}
      />

      <ConfirmDialog
        open={confirming === 'reject'}
        onOpenChange={(open) => !open && setConfirming(null)}
        title={`Reject ${quotation.quotationNumber}?`}
        description="Rejection is terminal. A rejected quotation is revised into a new one rather than reopened."
        confirmLabel="Reject"
        tone="danger"
        onConfirm={async () => {
          await decide.mutateAsync({ dto: { decision: 'REJECTED' }, version })
          toast.success('Quotation rejected')
        }}
        onError={report}
      />

      <ConfirmDialog
        open={confirming === 'withdraw'}
        onOpenChange={(open) => !open && setConfirming(null)}
        title={`Withdraw ${quotation.quotationNumber}?`}
        // Stated plainly because it surprises people: the API implements
        // withdraw as a soft delete, so the record also leaves the default list.
        description="This withdraws the quotation and removes it from the quotation list. It stays retrievable by an administrator, but it will not appear again unless withdrawn quotations are shown."
        confirmLabel="Withdraw"
        tone="danger"
        onConfirm={async () => {
          await withdraw.mutateAsync(version)
          toast.success('Quotation withdrawn')
          router.push('/quotations')
        }}
        onError={report}
      />
    </>
  )
}
