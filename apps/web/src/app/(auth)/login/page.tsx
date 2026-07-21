'use client'

import Link from 'next/link'
import { useActionState } from 'react'

import { loginAction } from '@/auth/actions'

import { AuthShell, buttonClass, inputClass } from '../auth-shell'

export default function LoginPage() {
  const [error, formAction, pending] = useActionState(loginAction, null)

  return (
    <AuthShell title="Sign in" subtitle="Triyara Business Network Platform">
      <form action={formAction} className="space-y-4">
        <input name="email" type="email" required placeholder="Email" className={inputClass} />
        <input
          name="password"
          type="password"
          required
          placeholder="Password"
          className={inputClass}
        />
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        <button type="submit" disabled={pending} className={buttonClass}>
          {pending ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
      <p className="mt-4 text-center text-xs text-white/40">
        <Link href="/forgot-password" className="hover:text-gold">
          Forgot password?
        </Link>
      </p>
    </AuthShell>
  )
}
