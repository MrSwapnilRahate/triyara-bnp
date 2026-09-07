'use client'

import { Button, Input } from '@triyara/ui'
import Link from 'next/link'
import { useActionState } from 'react'

import { forgotPasswordAction } from '@/auth/actions'

import { AuthField, authLinkClass, AuthMessage, AuthShell } from '../auth-shell'

const MESSAGE_ID = 'forgot-password-message'

export default function ForgotPasswordPage() {
  const [message, formAction, pending] = useActionState(forgotPasswordAction, null)

  return (
    <AuthShell
      title="Reset your password"
      subtitle="We'll email you a secure reset link."
      footer={
        <p>
          <Link className={authLinkClass} href="/login">
            Back to sign in
          </Link>
        </p>
      }
    >
      <form action={formAction} className="space-y-gap-lg">
        <AuthField id="forgot-email" label="Email">
          <Input
            aria-describedby={message ? MESSAGE_ID : undefined}
            autoComplete="email"
            id="forgot-email"
            name="email"
            placeholder="Email"
            required
            size="lg"
            type="email"
          />
        </AuthField>

        {/* `neutral`, not an error, and not `aria-invalid` on the field. The
            action answers the same sentence whether or not the address is
            registered - that uniformity is the security property - so styling it
            as a failure would tell the reader something the server refuses to. */}
        {message ? (
          <AuthMessage id={MESSAGE_ID} tone="neutral">
            {message}
          </AuthMessage>
        ) : null}

        <Button disabled={pending} fullWidth size="lg" type="submit" variant="primary">
          {pending ? 'Sending...' : 'Send reset link'}
        </Button>
      </form>
    </AuthShell>
  )
}
