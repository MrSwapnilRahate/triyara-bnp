'use client'

import Link from 'next/link'
import { useActionState } from 'react'

import { forgotPasswordAction } from '@/auth/actions'

import { AuthShell, buttonClass, inputClass } from '../auth-shell'

export default function ForgotPasswordPage() {
  const [message, formAction, pending] = useActionState(forgotPasswordAction, null)

  return (
    <AuthShell title="Reset your password" subtitle="We'll email you a secure reset link.">
      <form action={formAction} className="space-y-4">
        <input name="email" type="email" required placeholder="Email" className={inputClass} />
        {message ? <p className="text-sm text-white/60">{message}</p> : null}
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? 'Sending...' : 'Send reset link'}
        </button>
      </form>
      <p className="mt-4 text-center text-xs text-white/40">
        <Link href="/login" className="hover:text-gold">
          Back to sign in
        </Link>
      </p>
    </AuthShell>
  )
}
