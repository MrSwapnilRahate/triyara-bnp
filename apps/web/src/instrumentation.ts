import * as Sentry from '@sentry/nextjs'
import type { Instrumentation } from 'next'

import { sentryOptions } from '@/lib/sentry-options'

/**
 * Starts Sentry once per server runtime.
 *
 * Next calls this before anything else runs, in each runtime separately, which
 * is why the SDK needs it here rather than at the top of a module: an `init`
 * that ran during a request would miss everything that failed before it.
 *
 * Both runtimes share `sentryOptions()`. The edge one gets the same redaction
 * as the Node one, because a policy written twice is a policy that will differ.
 */
export function register(): void {
  const runtime = process.env.NEXT_RUNTIME
  if (runtime === 'nodejs' || runtime === 'edge') Sentry.init(sentryOptions())
}

/**
 * Everything the route wrapper cannot see.
 *
 * `route()` covers the API surface, but roughly a hundred pages render on the
 * server, and a Server Component that throws never passes through it - the user
 * gets the error page and nothing is written down. This is the framework's own
 * hook, and it fires for anything left uncaught anywhere on the server.
 *
 * It cannot double-count the API routes: those catch their errors and answer
 * with an envelope, so nothing escapes for Next to report. `source: 'render'`
 * keeps the two apart in the logs regardless.
 *
 * The logger is imported lazily because this file is evaluated in every runtime
 * the app has, including the edge one, where pino's Node transport must not be
 * pulled in at module scope.
 *
 * Sentry's own recipe is `onRequestError = Sentry.captureRequestError`. That is
 * not used here, on purpose. `logServerError` already reports to Sentry, so
 * adding it would file every render failure twice; and it has no notion of
 * `AppError`, so a `NotFoundError` thrown by a Server Component would raise an
 * alert for a page that correctly showed "not found". Routing everything
 * through the one funnel keeps "5xx only, exactly once" true of both
 * destinations at once.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request) => {
  const { logServerError, pathOf } = await import('@/lib/error-log')

  logServerError(error, {
    // Next does not thread our request id through a render, so the header is
    // the only place one can come from. A page opened directly carries none,
    // and an id invented here would correlate with nothing.
    // A repeated header arrives as an array; the first value is the one the
    // client sent first, and any of them beats logging "[object Object]".
    requestId: [request.headers['x-request-id']].flat()[0] ?? 'unknown',
    method: request.method,
    path: pathOf(request.path),
    source: 'render',
  })
}
