'use client'

import { Button, Input } from '@triyara/ui'
import Link from 'next/link'
import { useActionState } from 'react'

import { resetPasswordAction } from '@/auth/actions'

import { AuthField, authLinkClass, AuthMessage, AuthShell } from '../auth-shell'

function fillFromUrl(el: HTMLInputElement | null) {
  if (el) el.value = new URLSearchParams(window.location.search).get('token') ?? ''
}

const ERROR_ID = 'reset-password-error'

export default function ResetPasswordPage() {
  const [message, formAction, pending] = useActionState(resetPasswordAction, null)

  return (
    <AuthShell
      title="Choose a new password"
      footer={
        // This page had no way out at all. On the success path the action
        // redirects, so the only people who ever read this screen twice are the
        // ones whose link expired - exactly the people who need a route back.
        <p>
          <Link className={authLinkClass} href="/login">
            Back to sign in
          </Link>
        </p>
      }
    >
      <form action={formAction} className="space-y-gap-lg">
        <input type="hidden" name="token" defaultValue="" ref={fillFromUrl} />

        <AuthField id="reset-password" label="New password">
          <Input
            aria-describedby={message ? ERROR_ID : undefined}
            autoComplete="new-password"
            id="reset-password"
            invalid={Boolean(message)}
            minLength={8}
            name="password"
            placeholder="New password (min 8 chars)"
            required
            size="lg"
            type="password"
          />
        </AuthField>

        {message ? <AuthMessage id={ERROR_ID}>{message}</AuthMessage> : null}

        <Button disabled={pending} fullWidth size="lg" type="submit" variant="primary">
          {pending ? 'Updating...' : 'Update password'}
        </Button>
      </form>
    </AuthShell>
  )
}
