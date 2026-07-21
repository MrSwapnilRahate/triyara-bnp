'use client'

import { useActionState } from 'react'

import { resetPasswordAction } from '@/auth/actions'

import { AuthShell, buttonClass, inputClass } from '../auth-shell'

function fillFromUrl(el: HTMLInputElement | null) {
  if (el) el.value = new URLSearchParams(window.location.search).get('token') ?? ''
}

export default function ResetPasswordPage() {
  const [message, formAction, pending] = useActionState(resetPasswordAction, null)

  return (
    <AuthShell title="Choose a new password">
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="token" defaultValue="" ref={fillFromUrl} />
        <input
          name="password"
          type="password"
          required
          minLength={8}
          placeholder="New password (min 8 chars)"
          className={inputClass}
        />
        {message ? <p className="text-sm text-red-400">{message}</p> : null}
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? 'Updating...' : 'Update password'}
        </button>
      </form>
    </AuthShell>
  )
}
