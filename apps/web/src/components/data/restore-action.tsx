'use client'

import type { Action, Subject } from '@triyara/auth'
import { Badge, Button, ConfirmDialog, useToast } from '@triyara/ui'
import { Undo2 } from 'lucide-react'
import { useState } from 'react'

import { Can } from '@/lib/ability-context'
import { toastApiError } from '@/lib/api-error'

export interface RestoreActionProps {
  /** The ability the backend guard asks for. It is NOT the same everywhere. */
  action: Action
  subject: Subject
  /** Names the record in the confirmation: an RFQ number, a product name. */
  label: string
  /** What the record is, for the copy: "RFQ", "product", "supplier". */
  noun: string
  onRestore: () => Promise<unknown>
}

/**
 * The Deleted marker and Restore control a soft-deleted row carries.
 *
 * One component rather than five copies, because the awkward parts are the same
 * everywhere: the confirmation has to stay open when the API refuses, the
 * reason has to be surfaced rather than swallowed, and the click must not reach
 * the row behind it.
 *
 * The gate is passed in, not assumed, because the contract is deliberately
 * uneven - RFQ and Supplier restore on `update` (ADMIN and EXPORT_MANAGER), the
 * catalogue on `update` where only ADMIN holds it, and Quotation on `manage`.
 * A shared default here would have quietly widened one of them.
 *
 * Hiding the button is presentation only; the API refuses the same callers.
 */
export function RestoreAction({ action, subject, label, noun, onRestore }: RestoreActionProps) {
  const toast = useToast()
  const [open, setOpen] = useState(false)

  return (
    <span className="inline-flex items-center gap-gap">
      <Badge tone="neutral" size="sm">
        Deleted
      </Badge>
      <Can action={action} subject={subject}>
        <Button
          size="sm"
          variant="ghost"
          leadingIcon={<Undo2 />}
          // The deleted row is not interactive, but stop the click regardless:
          // the row's handlers are only conditionally absent.
          onClick={(event) => {
            event.stopPropagation()
            setOpen(true)
          }}
        >
          Restore
        </Button>
      </Can>

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Restore ${label}?`}
        description={`The ${noun} returns to the active list with its data and links intact.`}
        confirmLabel={`Restore ${noun}`}
        onConfirm={async () => {
          await onRestore()
          toast.success(`${noun.charAt(0).toUpperCase()}${noun.slice(1)} restored`)
        }}
        // The dialog keeps itself open and renders the message; this puts the
        // same reason in a toast, matching how every other mutation reports.
        onError={(error) => toastApiError(toast, error)}
      />
    </span>
  )
}
