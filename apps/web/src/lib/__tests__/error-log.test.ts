// @vitest-environment node
import {
  AppError,
  ConflictError,
  ForbiddenError,
  logger,
  NotFoundError,
  PreconditionFailedError,
} from '@triyara/lib'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { isUnexpected, logServerError, pathOf } from '../error-log'

let written: { payload: Record<string, unknown>; message: string }[] = []

beforeEach(() => {
  written = []
  vi.spyOn(logger, 'error').mockImplementation(((payload: unknown, message: unknown) => {
    written.push({
      payload: payload as Record<string, unknown>,
      message: String(message),
    })
  }) as never)
})

afterEach(() => vi.restoreAllMocks())

/** The single line a call produced, failing loudly if it produced none or many. */
function line() {
  expect(written).toHaveLength(1)
  return written[0]!
}

const ctx = { requestId: 'req-1', method: 'POST', path: '/api/v1/suppliers' }

describe('what counts as worth logging', () => {
  it('writes one line for an unexpected failure', () => {
    expect(logServerError(new TypeError('x.map is not a function'), ctx)).toBe(true)
    expect(line().message).toBe('server.error')
  })

  it.each([
    ['not found', new NotFoundError()],
    ['forbidden', new ForbiddenError()],
    ['conflict', new ConflictError()],
    ['stale version', new PreconditionFailedError()],
  ])('stays silent on an expected %s', (_label, error) => {
    // These are the API working. An administrator opening a record someone
    // else just deleted is not an incident, and at error level it would bury
    // the ones that are.
    expect(logServerError(error, ctx)).toBe(false)
    expect(written).toHaveLength(0)
  })

  it('stays silent on a validation failure', () => {
    const parsed = z.object({ name: z.string() }).safeParse({ name: 42 })
    expect(parsed.success).toBe(false)
    expect(logServerError(parsed.error, ctx)).toBe(false)
    expect(written).toHaveLength(0)
  })

  it('writes an AppError that carries a 5xx of its own', () => {
    // Deliberate, but still ours: a 500 raised by our code is exactly the
    // thing nobody would otherwise find out about.
    expect(logServerError(new AppError('Storage unreachable', 'STORAGE_DOWN', 503), ctx)).toBe(true)
    expect(line().payload.status).toBe(503)
  })

  it('agrees with itself about which errors it will write', () => {
    // The predicate exists so callers can skip gathering context. If it ever
    // disagreed with the writer, they would skip it for errors that are logged.
    for (const error of [new NotFoundError(), new TypeError('boom'), new ForbiddenError()]) {
      written = []
      expect(logServerError(error, ctx)).toBe(isUnexpected(error))
    }
  })
})

describe('what the line has to contain to be worth reading', () => {
  it('carries the request id, method, path and status', () => {
    logServerError(new Error('boom'), ctx)
    const { payload } = line()
    expect(payload.requestId).toBe('req-1')
    expect(payload.method).toBe('POST')
    expect(payload.path).toBe('/api/v1/suppliers')
    expect(payload.status).toBe(500)
  })

  it('carries who was making the request', () => {
    logServerError(new Error('boom'), { ...ctx, userId: 'u1', organizationId: 'org1' })
    const { payload } = line()
    expect(payload.userId).toBe('u1')
    expect(payload.organizationId).toBe('org1')
  })

  it('carries the stack', () => {
    logServerError(new Error('boom'), ctx)
    const err = line().payload.err as Record<string, unknown>
    expect(err.name).toBe('Error')
    expect(err.message).toBe('boom')
    expect(String(err.stack)).toContain('Error: boom')
  })

  it('carries the cause, which is where the real reason lives', () => {
    // Services wrap failures in their own message. Without the chain the log
    // says "Failed to store document" and nothing about why.
    const root = new Error('ECONNREFUSED 10.0.0.1:5432')
    const wrapped = new Error('Failed to store document', { cause: root })
    logServerError(wrapped, ctx)
    const causes = (line().payload.err as { causes: { message: string }[] }).causes
    expect(causes[0]!.message).toBe('ECONNREFUSED 10.0.0.1:5432')
  })

  it('does not follow a cause chain forever', () => {
    const cyclic = new Error('a')
    cyclic.cause = cyclic
    logServerError(cyclic, ctx)
    expect((line().payload.err as { causes: unknown[] }).causes).toHaveLength(3)
  })

  it('survives a thrown non-error', () => {
    logServerError('just a string', ctx)
    expect((line().payload.err as { name: string }).name).toBe('NonError')
  })

  it('separates a render failure from a route failure', () => {
    logServerError(new Error('boom'), { ...ctx, source: 'render' })
    expect(line().payload.source).toBe('render')
  })

  it('defaults the source to the route path', () => {
    logServerError(new Error('boom'), ctx)
    expect(line().payload.source).toBe('route')
  })
})

describe('the metadata that identifies the failing subsystem', () => {
  it('keeps Prisma diagnostics', () => {
    const prismaError = Object.assign(new Error('Unique constraint failed'), {
      code: 'P2002',
      clientVersion: '6.19.3',
      meta: { target: ['email'] },
    })
    logServerError(prismaError, ctx)
    expect(line().payload.prisma).toEqual({
      code: 'P2002',
      clientVersion: '6.19.3',
      meta: { target: ['email'] },
    })
  })

  it('does not mistake an ordinary code for a Prisma one', () => {
    // AppError has a `code` too. Treating it as Prisma would put a nonsense
    // block on most of the lines in the file.
    logServerError(new AppError('nope', 'STORAGE_DOWN', 500), ctx)
    expect(line().payload.prisma).toBeUndefined()
  })

  it('keeps the storage provider response metadata', () => {
    const s3Error = Object.assign(new Error('Access Denied'), {
      $metadata: { httpStatusCode: 403, requestId: 'AWS-REQ-9', attempts: 3 },
    })
    logServerError(s3Error, ctx)
    // `attempts: 3` is what separates a bad credential from an outage.
    expect(line().payload.storage).toEqual({
      httpStatusCode: 403,
      storageRequestId: 'AWS-REQ-9',
      attempts: 3,
    })
  })

  it('omits both blocks for an ordinary failure', () => {
    logServerError(new Error('boom'), ctx)
    expect(line().payload).not.toHaveProperty('prisma')
    expect(line().payload).not.toHaveProperty('storage')
  })
})

describe('a broken logger must not break the request', () => {
  it('does not rethrow when the logger itself fails', () => {
    // This is not hypothetical: a pino transport running on a worker thread
    // that had exited threw on every call, and because this runs inside the
    // catch block that builds the response, the throw escaped the handler and
    // turned every 500 into an uncaught exception.
    vi.spyOn(logger, 'error').mockImplementation(() => {
      throw new Error('the worker has exited')
    })

    expect(() => logServerError(new Error('boom'), ctx)).not.toThrow()
  })

  it('reports that nothing was written', () => {
    vi.spyOn(logger, 'error').mockImplementation(() => {
      throw new Error('the worker has exited')
    })

    expect(logServerError(new Error('boom'), ctx)).toBe(false)
  })

  it('falls back to the console so the error is not lost entirely', () => {
    const fallback = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(logger, 'error').mockImplementation(() => {
      throw new Error('the worker has exited')
    })

    logServerError(new Error('boom'), ctx)

    expect(fallback).toHaveBeenCalledOnce()
    expect(String(fallback.mock.calls[0]![0])).toContain('logger unavailable')
  })

  it('survives the fallback failing as well', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {
      throw new Error('stdout is gone')
    })
    vi.spyOn(logger, 'error').mockImplementation(() => {
      throw new Error('the worker has exited')
    })

    expect(() => logServerError(new Error('boom'), ctx)).not.toThrow()
  })
})

describe('what must never reach the log', () => {
  it('drops the query string from the path', () => {
    // `?q=` on supplier search carries whatever was typed, which is a company
    // name often enough to matter. The path identifies the endpoint; the query
    // would only add the part we are not allowed to keep.
    expect(pathOf('https://portal.triyaraexports.com/api/v1/suppliers?q=Acme%20Textiles')).toBe(
      '/api/v1/suppliers',
    )
  })

  it('drops the query string from a relative path too', () => {
    // Next's render hook reports a path rather than a URL, and the query is
    // still attached to it.
    expect(pathOf('/suppliers/find?q=Acme%20Textiles&page=2')).toBe('/suppliers/find')
  })

  it('never copies the error object wholesale', () => {
    // The guarantee is that the payload is constructed from named fields.
    // Redaction is the safety net; not copying is the actual protection, and
    // it is what stops an unanticipated property riding along.
    const err = Object.assign(new Error('boom'), {
      authorization: 'Bearer sk-live-123',
      cookie: 'session=abc',
      passwordHash: '$2b$10$abcdef',
    })
    logServerError(err, ctx)
    const serialised = JSON.stringify(line())
    expect(serialised).not.toContain('sk-live-123')
    expect(serialised).not.toContain('session=abc')
    expect(serialised).not.toContain('$2b$10$abcdef')
  })

  it('does not accept a body, headers or cookies to log', () => {
    // Enforced by the type, so this is the runtime half of the same claim:
    // there is no field through which a request body could arrive.
    logServerError(new Error('boom'), ctx)
    const { payload } = line()
    expect(Object.keys(payload).sort()).toEqual([
      'err',
      'method',
      'organizationId',
      'path',
      'requestId',
      'source',
      'status',
      'userId',
    ])
  })
})
