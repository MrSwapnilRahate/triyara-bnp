import type { ErrorEvent } from '@sentry/nextjs'

import { type ScrubbableEvent, scrubEvent } from './sentry-scrub'

/**
 * The options every runtime shares.
 *
 * Server, edge and browser each call `Sentry.init` separately - the SDK
 * requires it - but they must agree on what may be sent. Defining the shared
 * half once means a change to the redaction policy cannot land in two runtimes
 * and be forgotten in the third.
 */
export function sentryOptions() {
  return {
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

    // Without a DSN the SDK is inert. That is the intended state for local
    // development and for CI: nothing is sent, nothing needs stubbing, and no
    // build or test depends on a credential nobody has configured yet.
    enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),

    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'development',

    // Ties an event to the exact deployment. Without it, a stack trace points
    // at line numbers from whichever build the reader happens to have.
    release: process.env.VERCEL_GIT_COMMIT_SHA,

    // Off, explicitly. This is the switch that would otherwise attach IP
    // addresses, cookies and headers to every event.
    sendDefaultPii: false,

    // Tracing is a separate product decision with its own cost, and this PR is
    // about knowing when something breaks. Errors only.
    tracesSampleRate: 0,

    // The last gate before anything leaves the process. `sendDefaultPii` is a
    // setting; this is code, and it is tested.
    //
    // The scrubber is written against the structural shape it touches rather
    // than the SDK's full event type, so it stays testable without the SDK.
    // The cast is that boundary, and it is the only one.
    beforeSend: (event: ErrorEvent): ErrorEvent =>
      scrubEvent(event as ScrubbableEvent) as ErrorEvent,
  }
}
