'use client'

import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  useToast,
} from '@triyara/ui'
import { useState } from 'react'

import { describeApiError } from '@/lib/api-error'

import { useInviteUser } from '../api/users'
import type { RoleName } from '../types'

const ROLE_OPTIONS: { value: RoleName; label: string; hint: string }[] = [
  { value: 'ADMIN', label: 'Administrator', hint: 'Full access, including approvals and users.' },
  {
    value: 'EXPORT_MANAGER',
    label: 'Export manager',
    hint: 'Runs sourcing: suppliers, RFQs and quotations.',
  },
  { value: 'VERIFIER', label: 'Verifier', hint: 'Reviews documents and certifications.' },
  { value: 'READ_ONLY', label: 'Read only', hint: 'Can see everything, change nothing.' },
]

/**
 * Invites a colleague.
 *
 * There is no password field on purpose. The invitee sets their own through
 * the emailed link, so no working password ever exists that somebody else has
 * seen — which is a stronger guarantee than handing over a temporary one and
 * asking them to change it afterwards.
 */
export function InviteUserDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (next: boolean) => void
}) {
  const toast = useToast()
  const invite = useInviteUser()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<RoleName>('EXPORT_MANAGER')

  function close() {
    onOpenChange(false)
    setName('')
    setEmail('')
    setRole('EXPORT_MANAGER')
  }

  async function submit() {
    try {
      const result = await invite.mutateAsync({ name: name.trim(), email: email.trim(), role })
      if (result.invitationEmail === 'sent') {
        toast.success('Invitation sent', `${result.user.email} can now set their password.`)
      } else {
        // The account exists either way. Saying so beats a success message
        // that leaves an admin waiting for an email nobody sent.
        toast.error('Invitation email could not be sent', {
          description: `${result.user.email} was created, but the email failed. Send them a password reset link instead.`,
        })
      }
      close()
    } catch (error) {
      const described = describeApiError(error)
      toast.error(described.title, {
        ...(described.description ? { description: described.description } : {}),
      })
    }
  }

  const canSubmit = name.trim().length > 0 && email.trim().length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a colleague</DialogTitle>
        </DialogHeader>
        <div className="space-y-gap-lg px-gutter py-gap-lg">
          <div>
            <Label htmlFor="invite-name" required>
              Full name
            </Label>
            <Input
              id="invite-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="off"
              className="mt-gap-xs"
            />
          </div>
          <div>
            <Label htmlFor="invite-email" required>
              Work email
            </Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="off"
              className="mt-gap-xs"
            />
            <p className="mt-gap-xs text-xs text-content-subtle">
              The invitation goes here. They choose their own password from it.
            </p>
          </div>
          <div>
            <Label htmlFor="invite-role" required>
              Role
            </Label>
            <Select value={role} onValueChange={(value) => setRole(value as RoleName)}>
              <SelectTrigger id="invite-role" className="mt-gap-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-gap-xs text-xs text-content-subtle">
              {ROLE_OPTIONS.find((option) => option.value === role)?.hint}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={invite.isPending}
            disabled={!canSubmit}
            onClick={() => void submit()}
          >
            Send invitation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
