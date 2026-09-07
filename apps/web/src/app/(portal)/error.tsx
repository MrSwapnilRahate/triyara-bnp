'use client'

import { useEffect } from 'react'

import { reportClientError } from '@/lib/report-client-error'

/**
 * The portal's error boundary.
 *
 * Every failure reaching here shows the same sentence, deliberately. A refusal
 * from the party resolver can mean the account was not found, belongs to
 * another organization, is not approved, is a supplier, carries both profiles,
 * or carries neither - and telling them apart would disclose whether an account
 * exists elsewhere, or what kind of party somebody else is. The distinction
 * belongs in the server logs, which `reportClientError` already feeds.
 *
 * No `reset` button, unlike the internal boundaries. Those recover from a failed
 * fetch, where retrying is the right thing to offer; a refusal here will refuse
 * again, and a Retry that never works is worse than none.
 */
export default function Error({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => reportClientError(error), [error])

  return (
    <div className="mx-auto max-w-3xl px-gutter py-section-lg text-center">
      {/* `h1`, not `h2`. This boundary replaces the whole page, so the page had
          no first-level heading at all while it was showing. */}
      <h1 className="font-serif text-xl font-semibold text-content">Portal unavailable</h1>
      {/* `text-content-muted`. `text-muted-foreground` is not a colour key in
          the preset, so this sentence was rendering at full content contrast -
          the muting was never applied. */}
      <p className="mt-gap text-base text-content-muted">
        We couldn&rsquo;t open the portal for your account. Please contact your TRIYARA
        representative.
      </p>
    </div>
  )
}
