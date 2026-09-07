'use client'

import { Button, Input } from '@triyara/ui'
import Link from 'next/link'
import { useActionState } from 'react'

import { loginAction } from '@/auth/actions'

import { AuthField, authLinkClass, AuthMessage, AuthShell } from '../auth-shell'

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

const ERROR_ID = 'login-error'

export default function LoginPage() {
  const [error, formAction, pending] = useActionState(loginAction, null)

  return (
    <AuthShell
      title="Sign in"
      subtitle="Triyara Business Network Platform"
      footer={
        <>
          <p>
            <Link className={authLinkClass} href="/forgot-password">
              Forgot password?
            </Link>
          </p>
          {/* Registration is the thing most people arriving here actually need,
              and until now this page offered no route to it at all - a supplier
              who followed "Sign in" from the public site had to find their way
              back by hand. Both sides, because we do not know which they are. */}
          <p>
            New to Triyara?{' '}
            <Link className={authLinkClass} href="/register/supplier">
              Register as a supplier
            </Link>{' '}
            or{' '}
            <Link className={authLinkClass} href="/register/buyer">
              as a buyer
            </Link>
            .
          </p>
        </>
      }
    >
      <form action={formAction} className="space-y-gap-lg">
        <input type="hidden" name="callbackUrl" defaultValue="" ref={fillCallbackFromUrl} />

        {/* `aria-describedby` and `aria-invalid` go on both controls: the server
            answers "Invalid email or password" on purpose, without saying which,
            so neither field can claim the failure alone. */}
        <AuthField id="login-email" label="Email">
          <Input
            aria-describedby={error ? ERROR_ID : undefined}
            autoComplete="email"
            id="login-email"
            invalid={Boolean(error)}
            name="email"
            placeholder="Email"
            required
            size="lg"
            type="email"
          />
        </AuthField>

        <AuthField id="login-password" label="Password">
          <Input
            aria-describedby={error ? ERROR_ID : undefined}
            autoComplete="current-password"
            id="login-password"
            invalid={Boolean(error)}
            name="password"
            placeholder="Password"
            required
            size="lg"
            type="password"
          />
        </AuthField>

        {error ? <AuthMessage id={ERROR_ID}>{error}</AuthMessage> : null}

        <Button disabled={pending} fullWidth size="lg" type="submit" variant="primary">
          {pending ? 'Signing in...' : 'Sign in'}
        </Button>
      </form>
    </AuthShell>
  )
}
