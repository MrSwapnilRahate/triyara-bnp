'use client'

import Link from 'next/link'
import { useActionState } from 'react'

import { loginAction } from '@/auth/actions'

import { AuthShell, buttonClass, inputClass } from '../auth-shell'

/**
 * Carries the requested destination into the form.
 *
 * Same shape as the reset-password page's token field: the value lives in the
 * query string, and a hidden input is the only way a server action can see it.
 *
 * Normalised to a path here so the ordinary case - the middleware writing an
 * absolute same-origin URL - survives the server's path-only rule. A URL
 * belonging to anywhere else is dropped rather than forwarded, and the server
 * rejects it again regardless.
 */
function fillCallbackFromUrl(el: HTMLInputElement | null) {
  if (!el) return
  const raw = new URLSearchParams(window.location.search).get('callbackUrl')
  if (!raw) return

  try {
    const target = new URL(raw, window.location.origin)
    el.value =
      target.origin === window.location.origin
        ? `${target.pathname}${target.search}${target.hash}`
        : ''
  } catch {
    el.value = ''
  }
}

export default function LoginPage() {
  const [error, formAction, pending] = useActionState(loginAction, null)

  return (
    <AuthShell title="Sign in" subtitle="Triyara Business Network Platform">
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="callbackUrl" defaultValue="" ref={fillCallbackFromUrl} />
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
