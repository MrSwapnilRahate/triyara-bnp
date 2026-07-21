import { createInMemoryRateLimiter } from '@triyara/auth'
import { AppError, PreconditionRequiredError } from '@triyara/lib'
import { NextResponse } from 'next/server'
import { type z, ZodError, type ZodTypeAny } from 'zod'

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

export function errorResponse(error: unknown, requestId: string): NextResponse {
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

export async function route(
  req: Request,
  fn: (requestId: string) => Promise<NextResponse>,
): Promise<NextResponse> {
  const requestId = getRequestId(req)
  try {
    return await fn(requestId)
  } catch (error) {
    return errorResponse(error, requestId)
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
