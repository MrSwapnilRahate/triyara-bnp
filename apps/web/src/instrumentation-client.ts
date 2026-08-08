import * as Sentry from '@sentry/nextjs'

import { sentryOptions } from '@/lib/sentry-options'

/**
 * The browser half.
 *
 * Next loads this before any application code on the client, which is what
 * makes it able to catch a failure during the first render rather than only
 * after the app is interactive.
 *
 * Only `NEXT_PUBLIC_SENTRY_DSN` is readable here - a DSN is a write-only
 * ingest key and is meant to be public, but nothing else in `sentryOptions()`
 * may be a secret for the same reason, which is why it holds none.
 */
Sentry.init({
  ...sentryOptions(),
  // A client event's `request.url` is the page the user was on. The scrubber
  // strips its query string, so an id in a path survives and a search term
  // does not.
  sendDefaultPii: false,
})

/**
 * Router transition instrumentation. Exported by name because Next looks for
 * exactly this export; without it, navigations are not tied to the errors that
 * happen during them.
 */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
