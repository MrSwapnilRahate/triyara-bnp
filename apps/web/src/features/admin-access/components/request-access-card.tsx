'use client'

import { Alert, Badge, Button, Card, Input, Label, Skeleton, useToast } from '@triyara/ui'
import { KeyRound } from 'lucide-react'
import { useState } from 'react'

import { useAbility } from '@/lib/ability-context'
import { describeApiError } from '@/lib/api-error'

import { useMyAccessRequest, useRequestAdminAccess } from '../api/requests'

/**
 * The requester's own view of admin access.
 *
 * Four states, driven by their latest request: nothing yet, pending, declined,
 * or withdrawn. The server refuses a second pending request either way; this
 * makes that visible instead of letting someone submit and be told no.
 */
export function RequestAccessCard() {
  const toast = useToast()
  const ability = useAbility()
  // `manage all` is what ADMIN resolves to. Anyone holding it has nothing to
  // ask for — and after a revocation they no longer hold it, so the card
  // returns on its own.
  const holdsAdmin = ability.can('manage', 'all')
  const latest = useMyAccessRequest(!holdsAdmin)
  const request = useRequestAdminAccess()
  const [reason, setReason] = useState('')

  if (holdsAdmin) return null

  if (latest.isPending) {
    return (
      <Card>
        <Skeleton variant="text" className="w-64" />
        <Skeleton className="mt-gap-lg h-20 w-full" />
      </Card>
    )
  }

  const current = latest.data ?? null

  async function submit() {
    try {
      await request.mutateAsync(reason.trim())
      setReason('')
      toast.success('Request sent', 'The super administrator has been notified.')
    } catch (error) {
      const described = describeApiError(error)
      toast.error(described.title, {
        ...(described.description ? { description: described.description } : {}),
      })
    }
  }

  if (current?.status === 'PENDING') {
    return (
      <Card>
        <div className="flex items-start justify-between gap-gap-lg">
          <div>
            <h2 className="text-base font-semibold text-content">
              Your Admin Access Request has been submitted successfully.
            </h2>
            <p className="mt-gap-xs text-sm text-content-muted">
              It is currently pending approval from the Super Administrator.
            </p>
            <p className="mt-gap-lg text-xs text-content-subtle">
              Asked on {new Date(current.createdAt).toLocaleDateString()}. You will be told either
              way.
            </p>
          </div>
          <Badge tone="warning">Pending</Badge>
        </div>
      </Card>
    )
  }

  return (
    <Card>
      {current?.status === 'REVOKED' ? (
        // Persistent, not a toast: someone signing in tomorrow still needs to
        // know why the admin pages are gone.
        <Alert
          tone="warning"
          title="Your administrator access has been revoked"
          className="mb-gutter"
        >
          <p>
            If you believe this was a mistake, please submit a new Admin Access Request or contact
            your organization&rsquo;s Super Administrator.
          </p>
          {current.revocationReason ? (
            <p className="mt-gap-xs text-xs">Reason given: {current.revocationReason}</p>
          ) : null}
        </Alert>
      ) : null}

      {current?.status === 'REJECTED' ? (
        <Alert tone="danger" title="Your last request was declined" className="mb-gutter">
          {current.decisionReason ? <p>Reason given: {current.decisionReason}</p> : null}
          <p className="mt-gap-xs">You can ask again.</p>
        </Alert>
      ) : null}

      <div className="flex items-start gap-gap-lg">
        <KeyRound
          className="mt-gap-xs size-5 shrink-0 text-accent"
          aria-hidden="true"
          strokeWidth={1.5}
        />
        <div className="flex-1">
          <h2 className="text-base font-semibold text-content">
            {current?.status === 'REVOKED' || current?.status === 'REJECTED'
              ? 'Request administrator access again'
              : 'Request administrator access'}
          </h2>
          <p className="mt-gap-xs text-sm text-content-muted">
            Administrator access is granted by the super administrator, never assigned directly. Say
            why you need it.
          </p>

          <Label htmlFor="access-reason" required className="mt-gutter block">
            Reason
          </Label>
          <Input
            id="access-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="I approve supplier registrations and need to action the review queue."
            className="mt-gap-xs"
          />
          <p className="mt-gap-xs text-xs text-content-subtle">
            At least 20 characters — the super administrator decides on this alone.
          </p>

          <Button
            variant="primary"
            className="mt-gap-lg"
            loading={request.isPending}
            disabled={reason.trim().length < 20}
            onClick={() => void submit()}
          >
            {current?.status === 'REVOKED' ? 'Request Admin Access Again' : 'Request Admin Access'}
          </Button>
        </div>
      </div>
    </Card>
  )
}
