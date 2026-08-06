import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'

/**
 * MSW handlers for the portal's own API (TRY-BNP-PORTAL-01 §29).
 *
 * These stand in for the merged REST APIs, in the SAME envelope those APIs
 * actually return - `{ success, data, meta, errors }` with an ETag on detail
 * reads. A mock that disagreed with the contract would make these tests fiction.
 */
export interface EnvelopeOptions {
  nextCursor?: string | null
  limit?: number
  extra?: Record<string, unknown>
}

export function ok<T>(data: T, options: EnvelopeOptions = {}) {
  return {
    success: true,
    data,
    meta: {
      requestId: 'req-test',
      ...(options.nextCursor !== undefined
        ? { pagination: { limit: options.limit ?? 25, nextCursor: options.nextCursor } }
        : {}),
      ...options.extra,
    },
    errors: null,
  }
}

export function fail(errors: Array<{ code: string; message: string; field?: string }>) {
  return { success: false, data: null, meta: { requestId: 'req-test' }, errors }
}

export const server = setupServer()

/** Detail responses must carry an ETag - the version drives every If-Match. */
export function detail<T>(data: T, version: number) {
  return HttpResponse.json(ok(data), { headers: { ETag: `W/"v${version}"` } })
}

export { http, HttpResponse }
