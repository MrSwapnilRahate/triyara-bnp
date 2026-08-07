'use client'

import { Button, Card, Input, Label, useToast } from '@triyara/ui'
import { KeyRound } from 'lucide-react'
import { useState } from 'react'

import { useAbility } from '@/lib/ability-context'
import { describeApiError } from '@/lib/api-error'

import { useRequestAdminAccess } from '../api/requests'

/**
 * Asks for administrator access.
 *
 * Hidden from people who already hold ADMIN — the server refuses them anyway,
 * but offering a button that cannot succeed is not a kindness. The reason is
 * required and has a floor: the super administrator has to be able to judge
 * the request, and "please" tells them nothing.
 */
export function RequestAccessCard() {
  const toast = useToast()
  const ability = useAbility()
  const request = useRequestAdminAccess()
  const [reason, setReason] = useState('')
  const [submitted, setSubmitted] = useState(false)

  // `manage all` is what ADMIN resolves to. Anyone holding it has nothing to
  // ask for.
  if (ability.can('manage', 'all')) return null

  async function submit() {
    try {
      await request.mutateAsync(reason.trim())
      setSubmitted(true)
      toast.success('Request sent', 'The super administrator has been notified.')
    } catch (error) {
      const described = describeApiError(error)
      toast.error(described.title, {
        ...(described.description ? { description: described.description } : {}),
      })
    }
  }

  if (submitted) {
    return (
      <Card>
        <h2 className="text-base font-semibold text-content">Request sent</h2>
        <p className="mt-gap-xs text-sm text-content-muted">
          The super administrator has been notified and will decide. You will be told either way.
        </p>
      </Card>
    )
  }

  return (
    <Card>
      <div className="flex items-start gap-gap-lg">
        <KeyRound
          className="mt-gap-xs size-5 shrink-0 text-accent"
          aria-hidden="true"
          strokeWidth={1.5}
        />
        <div className="flex-1">
          <h2 className="text-base font-semibold text-content">Request administrator access</h2>
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
            Request Admin Access
          </Button>
        </div>
      </div>
    </Card>
  )
}
