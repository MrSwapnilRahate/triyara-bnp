'use client'

import { Button, ConfirmDialog, useToast } from '@triyara/ui'
import { CheckCircle2, RotateCcw, Send, XCircle } from 'lucide-react'
import { type ReactNode, useId, useState } from 'react'

import { Can, useAbility } from '@/lib/ability-context'
import { describeApiError } from '@/lib/api-error'

import { useCloseRfq, useDecideRfq, usePublishRfq, useReopenRfq } from '../api/rfqs'
import { canClose, canPublish, canReopen, type Rfq, RFQ_TRANSITIONS } from '../types'

/**
 * Workflow actions (§9, §20).
 *
 * Two independent gates decide whether a button appears, and both must pass:
 *
 *   1. Authorization. Publish and close need `update Account`; reopen and the
 *      approval decisions need `manage Account`, which only ADMIN holds. These
 *      mirror rfq.service.ts exactly - the UI hides what the API would refuse
 *      rather than offering it and rendering a 403.
 *   2. The state machine. A move that is not in TRANSITIONS from here is a
 *      guaranteed 409, and a button that always fails is worse than no button.
 *
 * Publish carries a third condition the others do not: at least one invited
 * supplier. That one is explained rather than hidden, because the fix is an
 * action the user can take on this very screen.
 */
/**
 * A disabled control with the reason it is disabled, rendered visibly beside it.
 *
 * Not a tooltip: a disabled button receives neither hover nor focus, so a
 * tooltip on one is unreachable by keyboard and by most assistive technology.
 * The reason is text, and `aria-describedby` ties it to the control.
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

export function RfqWorkflowActions({ rfq, version }: { rfq: Rfq; version: number }) {
  const toast = useToast()
  const ability = useAbility()

  const publish = usePublishRfq(rfq.id)
  const close = useCloseRfq(rfq.id)
  const reopen = useReopenRfq(rfq.id)
  const decide = useDecideRfq(rfq.id)

  const [confirming, setConfirming] = useState<'publish' | 'close' | 'reopen' | null>(null)

  const report = (error: unknown) => {
    const described = describeApiError(error)
    toast.error(described.title, {
      ...(described.description ? { description: described.description } : {}),
      ...(described.requestId ? { requestId: described.requestId } : {}),
    })
  }

  const allowed = RFQ_TRANSITIONS[rfq.status]
  const noSuppliers = rfq.suppliers.length === 0
  const canManage = ability.can('manage', 'Account')

  async function submitDecision(decision: 'PENDING' | 'APPROVED' | 'REJECTED') {
    try {
      await decide.mutateAsync({ dto: { decision }, version })
      toast.success(
        decision === 'PENDING'
          ? 'Sent for approval'
          : decision === 'APPROVED'
            ? 'RFQ approved'
            : 'RFQ rejected',
      )
    } catch (error) {
      report(error)
    }
  }

  return (
    <>
      {/* DRAFT -> PENDING_APPROVAL. Anyone who can update may ask for approval. */}
      {allowed.includes('PENDING_APPROVAL') ? (
        <Can action="update" subject="Account">
          <BlockedAction
            reason={
              rfq.items.length === 0 ? 'Add at least one line before requesting approval.' : null
            }
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

      {/* PENDING_APPROVAL -> APPROVED / REJECTED. ADMIN only. */}
      {allowed.includes('APPROVED') && canManage ? (
        <>
          <Button
            variant="ghost"
            leadingIcon={<XCircle />}
            loading={decide.isPending}
            onClick={() => void submitDecision('REJECTED')}
          >
            Reject
          </Button>
          <Button
            variant="primary"
            leadingIcon={<CheckCircle2 />}
            loading={decide.isPending}
            onClick={() => void submitDecision('APPROVED')}
          >
            Approve
          </Button>
        </>
      ) : null}

      {/* APPROVED -> ISSUED. */}
      {rfq.status === 'APPROVED' ? (
        <Can action="update" subject="Account">
          <BlockedAction
            reason={noSuppliers ? 'Invite at least one supplier before publishing.' : null}
          >
            {(describedBy) => (
              <Button
                variant="primary"
                leadingIcon={<Send />}
                disabled={!canPublish(rfq)}
                loading={publish.isPending}
                {...(describedBy ? { 'aria-describedby': describedBy } : {})}
                onClick={() => setConfirming('publish')}
              >
                Publish
              </Button>
            )}
          </BlockedAction>
        </Can>
      ) : null}

      {canClose(rfq.status) ? (
        <Can action="update" subject="Account">
          <Button
            variant="secondary"
            loading={close.isPending}
            onClick={() => setConfirming('close')}
          >
            Close
          </Button>
        </Can>
      ) : null}

      {/* Reopen needs `manage`, so it is invisible to EXPORT_MANAGER. */}
      {canReopen(rfq.status) ? (
        <Can action="manage" subject="Account">
          <Button
            variant="secondary"
            leadingIcon={<RotateCcw />}
            loading={reopen.isPending}
            onClick={() => setConfirming('reopen')}
          >
            Reopen
          </Button>
        </Can>
      ) : null}

      <ConfirmDialog
        open={confirming === 'publish'}
        onOpenChange={(open) => !open && setConfirming(null)}
        title={`Publish ${rfq.rfqNumber}?`}
        description={`This issues the RFQ to ${rfq.suppliers.length} invited supplier${
          rfq.suppliers.length === 1 ? '' : 's'
        }. Commercial terms freeze once it is out.`}
        confirmLabel="Publish"
        onConfirm={async () => {
          await publish.mutateAsync(version)
          toast.success('RFQ published', 'Invited suppliers can now submit bids.')
        }}
        onError={report}
      />

      <ConfirmDialog
        open={confirming === 'close'}
        onOpenChange={(open) => !open && setConfirming(null)}
        title={`Close ${rfq.rfqNumber}?`}
        description="Closing stops further bids. It can be reopened by an administrator."
        confirmLabel="Close RFQ"
        tone="danger"
        onConfirm={async () => {
          await close.mutateAsync(version)
          toast.success('RFQ closed')
        }}
        onError={report}
      />

      <ConfirmDialog
        open={confirming === 'reopen'}
        onOpenChange={(open) => !open && setConfirming(null)}
        title={`Reopen ${rfq.rfqNumber}?`}
        description="The RFQ returns to draft. Existing bids are kept but suppliers will need to be re-invited to the new round."
        confirmLabel="Reopen"
        onConfirm={async () => {
          await reopen.mutateAsync(version)
          toast.success('RFQ reopened', 'It is back in draft.')
        }}
        onError={report}
      />
    </>
  )
}
