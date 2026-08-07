import { createInMemoryRateLimiter } from '@triyara/auth'
import { AppError, PreconditionRequiredError } from '@triyara/lib'
import { NextResponse } from 'next/server'
import { type z, ZodError, type ZodTypeAny } from 'zod'

import { type ErrorLogContext, isUnexpected, logServerError, pathOf } from './error-log'

interface ApiError {
  code: string
  message: string
  field?: string
}

export function getRequestId(req: Request): string {
  return req.headers.get('x-request-id') ?? crypto.randomUUID()
}

export function ok<T>(
  data: T,
  opts: { status?: number; requestId: string; meta?: Record<string, unknown>; etag?: string } = {
    requestId: '',
  },
): NextResponse {
  const res = NextResponse.json(
    { success: true, data, meta: { requestId: opts.requestId, ...opts.meta }, errors: null },
    { status: opts.status ?? 200 },
  )
  if (opts.etag) res.headers.set('ETag', opts.etag)
  return res
}

export function fail(errors: ApiError[], status: number, requestId: string): NextResponse {
  return NextResponse.json({ success: false, data: null, meta: { requestId }, errors }, { status })
}

/**
 * Turns an error into the response, and writes the one log line it deserves.
 *
 * The logging lives here rather than in `route()` because this is where the
 * error is classified into 4xx or 5xx, and that classification is exactly what
 * decides whether a line is written. Keeping the two together means the log
 * level cannot drift from the status the caller actually receives.
 *
 * `context` is optional and additive: existing callers keep working unchanged
 * and simply log less about themselves.
 */
export function errorResponse(
  error: unknown,
  requestId: string,
  context?: Omit<ErrorLogContext, 'requestId'>,
): NextResponse {
  logServerError(error, { ...context, requestId })

  if (error instanceof ZodError) {
    return fail(
      error.issues.map((i) => ({
        code: 'VALIDATION_ERROR',
        field: i.path.join('.') || undefined,
        message: i.message,
      })),
      422,
      requestId,
    )
  }
  if (error instanceof AppError) {
    return fail([{ code: error.code, message: error.message }], error.httpStatus, requestId)
  }
  return fail([{ code: 'INTERNAL', message: 'Internal server error' }], 500, requestId)
}

/**
 * Who was making the request, resolved only once it has already failed.
 *
 * Reading the session costs a JWT decode, so it happens in the catch path and
 * nowhere near the happy path. It is imported lazily for the same reason: the
 * auth module pulls in the Node adapter, and every route in the app imports
 * this file.
 *
 * Failing to identify the caller must never replace the error we were trying to
 * report - an expired session is a perfectly ordinary reason to end up here.
 */
async function actorOf(): Promise<{ userId?: string; organizationId?: string }> {
  try {
    const { currentUser } = await import('@/auth/context')
    const user = await currentUser()
    return user ? { userId: user.id, organizationId: user.organizationId } : {}
  } catch {
    return {}
  }
}

export async function route(
  req: Request,
  fn: (requestId: string) => Promise<NextResponse>,
): Promise<NextResponse> {
  const requestId = getRequestId(req)
  try {
    return await fn(requestId)
  } catch (error) {
    const base = { method: req.method, path: pathOf(req.url) }
    // Identity is only worth resolving for an error that will be written; the
    // 404s and 412s that dominate this path get the free fields and no session
    // read at all.
    return errorResponse(
      error,
      requestId,
      isUnexpected(error) ? { ...base, ...(await actorOf()) } : base,
    )
  }
}

export async function parseBody<S extends ZodTypeAny>(
  req: Request,
  schema: S,
): Promise<z.output<S>> {
  const body: unknown = await req.json().catch(() => ({}))
  return schema.parse(body) as z.output<S>
}

export function parseQuery<S extends ZodTypeAny>(
  searchParams: URLSearchParams,
  schema: S,
): z.output<S> {
  return schema.parse(Object.fromEntries(searchParams.entries())) as z.output<S>
}

// ---- Optimistic concurrency (ETag / If-Match) ----
export function etag(version: number): string {
  return `W/"v${version}"`
}

export function requireIfMatch(req: Request): number {
  const header = req.headers.get('if-match')
  if (!header) throw new PreconditionRequiredError()
  const match = /v?(\d+)/.exec(header)
  if (!match) throw new PreconditionRequiredError('Malformed If-Match header')
  return Number(match[1])
}

// ---- Write rate limiting (single-instance; Redis in production) ----
const writeLimiter = createInMemoryRateLimiter(120, 60 * 1000)
export function enforceWriteLimit(userId: string): void {
  if (!writeLimiter.check(userId).allowed) {
    throw new AppError('Too many requests', 'RATE_LIMITED', 429)
  }
}
