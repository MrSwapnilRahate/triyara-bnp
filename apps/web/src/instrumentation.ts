import type { Instrumentation } from 'next'

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
