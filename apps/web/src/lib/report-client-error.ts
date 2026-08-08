import * as Sentry from '@sentry/nextjs'

/**
 * Reports a React error boundary's error, unless the server already did.
 *
 * Next gives a boundary two quite different things under one prop. An error
 * thrown while rendering on the server arrives with a `digest` and a message
 * replaced by a generic one - the real error stayed on the server, where
 * `onRequestError` has already logged and reported it. An error thrown in the
 * browser arrives whole, and nothing has seen it.
 *
 * `digest` is therefore the de-duplication signal: its presence means "already
 * reported, and the copy the server has is the useful one". Reporting both
 * would file every server render failure twice, the second time with a message
 * that says nothing.
 */
export function reportClientError(error: Error & { digest?: string }): void {
  if (error.digest) return

  try {
    Sentry.captureException(error, { tags: { source: 'client-render' } })
  } catch {
    // A boundary's job is to show the user something useful. Failing to report
    // must not stop it rendering.
  }
}
