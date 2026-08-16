import type { Metadata } from 'next'

import { VerifyEmailView } from './verify-email-view'

export const metadata: Metadata = { title: 'Verify email · Triyara BNP' }

/**
 * Where the emailed verification link lands.
 *
 * Deliberately inside `(app)`, not `(auth)`: confirming consumes a token
 * against an authenticated session, and `PUBLIC_PATHS` has no verify-email
 * entry (ADR-0011). A signed-out visitor is therefore redirected to /login by
 * the middleware and returns here afterwards, which is the intended path - a
 * public page could not complete the confirmation anyway.
 *
 * The token is read on the client from the query string and handed straight to
 * the confirm endpoint. It is not read here, so it never enters the server
 * render or the props of a client component.
 */
export const dynamic = 'force-dynamic'

export default function VerifyEmailPage() {
  return <VerifyEmailView />
}
