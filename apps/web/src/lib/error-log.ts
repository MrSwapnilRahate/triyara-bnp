import { AppError, logger } from '@triyara/lib'
import { ZodError } from 'zod'

/**
 * What a server error is logged with.
 *
 * Everything is optional except the request id, because the callers know
 * different amounts: `route()` has the request, `onRequestError` has a partial
 * one, and a direct `errorResponse()` call may have neither.
 */
export interface ErrorLogContext {
  requestId: string
  method?: string
  /** Pathname only. Never the query string - see `pathOf`. */
  path?: string
  userId?: string
  organizationId?: string
  /** Where the error surfaced, so route errors and render errors stay apart. */
  source?: 'route' | 'render' | 'storage'
}

/**
 * The pathname, deliberately without the query string.
 *
 * `?q=` on the supplier search carries whatever the user typed, which is a
 * company name often enough to matter. The path identifies the endpoint; the
 * query would only add the thing we are not allowed to keep.
 */
export function pathOf(url: string): string {
  try {
    return new URL(url).pathname
  } catch {
    // Already relative - Next's render hook reports a path, not a full URL.
    // It still arrives with the query attached, so it still has to be cut.
    return url.split('?')[0]!.split('#')[0]!
  }
}

/**
 * The HTTP status an error will be answered with.
 *
 * This is the same classification `errorResponse` performs, and it is the only
 * thing that decides whether a line is written - so the two can never disagree
 * about whether something was the caller's fault or ours.
 */
function statusOf(error: unknown): number {
  if (error instanceof ZodError) return 422
  if (error instanceof AppError) return error.httpStatus
  return 500
}

/**
 * Whether this error is ours rather than the caller's.
 *
 * Exported so a caller can decide whether context is worth *gathering*. Reading
 * the session to attribute an error is cheap next to having already failed, but
 * it is pure waste on the 404s and 412s that make up most of what lands in a
 * catch block.
 */
export function isUnexpected(error: unknown): boolean {
  return statusOf(error) >= 500
}

/** Name, message and stack, with the cause chain flattened to a bounded depth. */
function errorShape(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) {
    // A thrown string or object. `String()` rather than serialising it: an
    // unknown shape is exactly the thing that might carry a token.
    return { name: 'NonError', message: String(error) }
  }

  const shape: Record<string, unknown> = {
    name: error.name,
    message: error.message,
    stack: error.stack,
  }

  // A wrapped Prisma or AWS error puts the useful part in `cause`; without this
  // the log says "Failed to store document" and nothing about why. Bounded at
  // three so a cycle cannot produce an unbounded line.
  const causes: { name: string; message: string }[] = []
  let cause: unknown = error.cause
  for (let depth = 0; depth < 3 && cause instanceof Error; depth += 1) {
    causes.push({ name: cause.name, message: cause.message })
    cause = cause.cause
  }
  if (causes.length > 0) shape.causes = causes

  if (error instanceof AppError) shape.code = error.code

  return shape
}

/**
 * Prisma's own diagnostics.
 *
 * `code` (P2002 and friends) and `meta` are what say *which* constraint or
 * column failed. `meta` carries schema identifiers - column and constraint
 * names - not the values that collided, so it is safe to keep and is usually
 * the difference between a five-minute fix and an afternoon.
 */
function prismaShape(error: unknown): Record<string, unknown> | null {
  if (typeof error !== 'object' || error === null) return null
  const e = error as { code?: unknown; clientVersion?: unknown; meta?: unknown }
  if (typeof e.code !== 'string' || !/^P\d{4}$/.test(e.code)) return null
  return {
    code: e.code,
    clientVersion: typeof e.clientVersion === 'string' ? e.clientVersion : undefined,
    meta: e.meta,
  }
}

/**
 * The AWS SDK's response metadata, which every S3 and R2 error carries.
 *
 * The status and the storage-side request id are what a provider needs to look
 * an incident up on their side; `attempts` distinguishes "refused once" from
 * "retried and still failed", which is the difference between bad credentials
 * and an outage.
 */
function storageShape(error: unknown): Record<string, unknown> | null {
  if (typeof error !== 'object' || error === null) return null
  const meta = (error as { $metadata?: unknown }).$metadata
  if (typeof meta !== 'object' || meta === null) return null
  const m = meta as { httpStatusCode?: unknown; requestId?: unknown; attempts?: unknown }
  return {
    httpStatusCode: m.httpStatusCode,
    storageRequestId: m.requestId,
    attempts: m.attempts,
  }
}

/**
 * Writes one line for one unexpected server error, and returns whether it did.
 *
 * Only 5xx is written. A 404, a 403, a 409 or a 412 is the API working
 * correctly - an administrator opening a record someone else just deleted is
 * not an incident, and logging it at error level would bury the ones that are.
 * That also settles the "never log an AppError twice" rule structurally: a
 * `NotFoundError` produces no line to duplicate, and the 5xx ones pass through
 * this function exactly once because `errorResponse` is their only caller.
 *
 * The payload is *constructed*, never spread from the error or the request.
 * Redaction is a safety net for a shape we did not anticipate; not copying
 * unknown objects in the first place is the actual guarantee that a cookie or
 * an authorization header cannot reach the log.
 */
export function logServerError(error: unknown, context: ErrorLogContext): boolean {
  const status = statusOf(error)
  if (status < 500) return false

  const prisma = prismaShape(error)
  const storage = storageShape(error)

  try {
    logger.error(
      {
        requestId: context.requestId,
        method: context.method,
        path: context.path,
        userId: context.userId,
        organizationId: context.organizationId,
        source: context.source ?? 'route',
        status,
        err: errorShape(error),
        ...(prisma ? { prisma } : {}),
        ...(storage ? { storage } : {}),
      },
      'server.error',
    )
    return true
  } catch (loggingFailure) {
    // Reporting a failure must never cause a worse one. This function is
    // called from the catch block that produces the response, so a throw here
    // escapes the handler entirely: the caller gets a dead connection instead
    // of a clean 500, and the original error is lost along with it.
    //
    // Not hypothetical - a pino transport whose worker had exited did exactly
    // that, turning every 500 into an uncaught exception.
    try {
      // thing that just failed, so it cannot be used to report its own failure.
      console.error('server.error (logger unavailable)', {
        requestId: context.requestId,
        original: error instanceof Error ? error.stack : String(error),
        loggingFailure:
          loggingFailure instanceof Error ? loggingFailure.message : String(loggingFailure),
      })
    } catch {
      // Nothing further is available. Losing the line is bad; taking the
      // request down to complain about it is worse.
    }
    return false
  }
}
