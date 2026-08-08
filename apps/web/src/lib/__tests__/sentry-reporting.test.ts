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

const captureException = vi.fn()
vi.mock('@sentry/nextjs', () => ({ captureException }))

const { logServerError } = await import('../error-log')

beforeEach(() => {
  captureException.mockReset()
  // The log line is not what these assert; silence it so a failure here is
  // never confused with a logging failure.
  vi.spyOn(logger, 'error').mockImplementation((() => undefined) as never)
})

afterEach(() => vi.restoreAllMocks())

const ctx = { requestId: 'req-1', method: 'POST', path: '/api/v1/suppliers' }

/** The options object of the single capture call. */
function captured() {
  expect(captureException).toHaveBeenCalledOnce()
  return captureException.mock.calls[0]![1] as {
    tags: Record<string, string | undefined>
    user?: { id: string }
    contexts: { request: { method?: string; path?: string } }
  }
}

describe('a 4xx must never raise an alert', () => {
  it.each([
    ['not found', new NotFoundError()],
    ['forbidden', new ForbiddenError()],
    ['conflict', new ConflictError()],
    ['stale version', new PreconditionFailedError()],
  ])('files nothing for %s', (_label, error) => {
    // Someone opening a record a colleague just deleted must not page anyone.
    // This is why the SDK's automatic route capture is not relied on - it has
    // no notion of AppError and would report all of these.
    logServerError(error, ctx)
    expect(captureException).not.toHaveBeenCalled()
  })

  it('files nothing for a validation failure', () => {
    const parsed = z.object({ name: z.string() }).safeParse({ name: 42 })
    logServerError((parsed as { error: unknown }).error, ctx)
    expect(captureException).not.toHaveBeenCalled()
  })
})

describe('an unexpected 5xx is reported exactly once', () => {
  it('files one event', () => {
    logServerError(new TypeError('x.map is not a function'), ctx)
    expect(captureException).toHaveBeenCalledOnce()
  })

  it('files one event for an AppError that carries its own 5xx', () => {
    logServerError(new AppError('Storage unreachable', 'STORAGE_DOWN', 503), ctx)
    expect(captured().tags.status).toBe('503')
  })

  it('passes the original error, not a copy', () => {
    // Sentry groups by stack. A wrapper would put every error in the app into
    // a single issue named after the wrapper.
    const error = new Error('boom')
    logServerError(error, ctx)
    expect(captureException.mock.calls[0]![0]).toBe(error)
  })
})

describe('every event is correlated', () => {
  it('carries the request id the caller was shown', () => {
    // The envelope gives the user this id and nothing else. If it is not
    // searchable in Sentry, a support report cannot be tied to an event.
    logServerError(new Error('boom'), ctx)
    expect(captured().tags.requestId).toBe('req-1')
  })

  it('carries the user and organization when known', () => {
    logServerError(new Error('boom'), { ...ctx, userId: 'u1', organizationId: 'org1' })
    expect(captured().user).toEqual({ id: 'u1' })
    expect(captured().tags.organizationId).toBe('org1')
  })

  it('carries method and path', () => {
    logServerError(new Error('boom'), ctx)
    expect(captured().contexts.request).toEqual({ method: 'POST', path: '/api/v1/suppliers' })
  })

  it('sends no user at all rather than an empty one', () => {
    logServerError(new Error('boom'), ctx)
    expect(captured().user).toBeUndefined()
  })

  it('tags a render failure apart from a route failure', () => {
    logServerError(new Error('boom'), { ...ctx, source: 'render' })
    expect(captured().tags.source).toBe('render')
  })

  it('tags the Prisma code so one class of failure is one search', () => {
    logServerError(
      Object.assign(new Error('Unique constraint failed'), {
        code: 'P2002',
        clientVersion: '6.19.3',
      }),
      ctx,
    )
    expect(captured().tags.prismaCode).toBe('P2002')
  })
})

describe('reporting must never break the request', () => {
  it('does not rethrow when Sentry throws', () => {
    // Same rule the logger follows: this runs inside the catch block that
    // builds the response, so a throw here costs the caller their 500.
    captureException.mockImplementation(() => {
      throw new Error('transport is dead')
    })

    expect(() => logServerError(new Error('boom'), ctx)).not.toThrow()
  })

  it('still writes the log line when Sentry throws', () => {
    // The two destinations are independent on purpose. Losing one must not
    // lose the other.
    const written = vi.spyOn(logger, 'error').mockImplementation((() => undefined) as never)
    captureException.mockImplementation(() => {
      throw new Error('transport is dead')
    })

    expect(logServerError(new Error('boom'), ctx)).toBe(true)
    expect(written).toHaveBeenCalledOnce()
  })
})
