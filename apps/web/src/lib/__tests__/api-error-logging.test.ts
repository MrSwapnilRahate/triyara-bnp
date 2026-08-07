// @vitest-environment node
import { ForbiddenError, logger, NotFoundError } from '@triyara/lib'
import { NextResponse } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const currentUser = vi.fn()
vi.mock('@/auth/context', () => ({ currentUser }))

const { errorResponse, route } = await import('../api')

let written: Record<string, unknown>[] = []

beforeEach(() => {
  written = []
  currentUser.mockReset()
  currentUser.mockResolvedValue({ id: 'u1', organizationId: 'org1' })
  vi.spyOn(logger, 'error').mockImplementation(((payload: unknown) => {
    written.push(payload as Record<string, unknown>)
  }) as never)
})

afterEach(() => vi.restoreAllMocks())

const req = (method = 'POST', url = 'https://portal.triyaraexports.com/api/v1/suppliers?q=Acme') =>
  new Request(url, { method, headers: { 'x-request-id': 'req-99' } })

const throwing = (error: unknown) => () => Promise.reject(error)

describe('one error, one line', () => {
  it('logs an unexpected failure exactly once through the wrapper', async () => {
    // `route()` catches and delegates to `errorResponse()`, which is the only
    // thing that logs. If both did, every 500 in the file would be doubled.
    const res = await route(req(), throwing(new TypeError('boom')))

    expect(res.status).toBe(500)
    expect(written).toHaveLength(1)
  })

  it('logs a direct errorResponse call exactly once', async () => {
    // The CSV export route calls this without the wrapper. It must not be the
    // one endpoint that logs nothing.
    const res = errorResponse(new TypeError('boom'), 'req-99', {
      method: 'GET',
      path: '/api/v1/admin-access-requests/export',
    })

    expect(res.status).toBe(500)
    expect(written).toHaveLength(1)
  })

  it('does not log an expected failure at all', async () => {
    const res = await route(req(), throwing(new NotFoundError('Supplier not found.')))

    expect(res.status).toBe(404)
    expect(written).toHaveLength(0)
  })
})

describe('what the wrapper contributes', () => {
  it('supplies the method and path the classifier cannot see', async () => {
    await route(req('DELETE'), throwing(new Error('boom')))

    expect(written[0]!.method).toBe('DELETE')
    expect(written[0]!.path).toBe('/api/v1/suppliers')
  })

  it('never lets the query string through', async () => {
    await route(
      req('GET', 'https://portal.triyaraexports.com/api/v1/suppliers?q=Acme%20Textiles'),
      throwing(new Error('boom')),
    )

    expect(written).toHaveLength(1)
    expect(JSON.stringify(written)).not.toContain('Acme')
  })

  it('attributes the failure to the caller', async () => {
    await route(req(), throwing(new Error('boom')))

    expect(written[0]!.userId).toBe('u1')
    expect(written[0]!.organizationId).toBe('org1')
  })

  it('reuses the incoming request id rather than inventing one', async () => {
    // The client already has this id from the response envelope; a fresh one
    // would make the log unsearchable by the only reference the user holds.
    await route(req(), throwing(new Error('boom')))

    expect(written[0]!.requestId).toBe('req-99')
  })

  it('does not read the session for an error it will not log', async () => {
    // A 404 is the common case in this catch block. Paying for a JWT decode on
    // every one of them would be a cost with nothing to show for it.
    await route(req(), throwing(new ForbiddenError()))

    expect(currentUser).not.toHaveBeenCalled()
  })

  it('still reports the error when the session cannot be read', async () => {
    // An expired session is an ordinary way to arrive here. Failing to name
    // the user must not replace the error we were trying to report.
    currentUser.mockRejectedValue(new Error('JWTExpired'))

    const res = await route(req(), throwing(new Error('boom')))

    expect(res.status).toBe(500)
    expect(written).toHaveLength(1)
    expect(written[0]!.userId).toBeUndefined()
  })

  it('still reports the error for an unauthenticated caller', async () => {
    currentUser.mockResolvedValue(null)

    await route(req(), throwing(new Error('boom')))

    expect(written).toHaveLength(1)
    expect(written[0]!.userId).toBeUndefined()
  })
})

describe('the response the caller receives is unchanged', () => {
  it('still hides the internal message behind a generic 500', async () => {
    const res = await route(req(), throwing(new Error('ECONNREFUSED 10.0.0.1:5432')))
    const body = (await res.json()) as { errors: { code: string; message: string }[] }

    // The address belongs in the log, not in the response.
    expect(body.errors[0]).toEqual({ code: 'INTERNAL', message: 'Internal server error' })
  })

  it('still returns the envelope with the request id', async () => {
    const res = await route(req(), throwing(new Error('boom')))
    const body = (await res.json()) as { success: boolean; meta: { requestId: string } }

    expect(body.success).toBe(false)
    expect(body.meta.requestId).toBe('req-99')
  })

  it('still passes a success through untouched', async () => {
    const res = await route(req(), (requestId) =>
      Promise.resolve(NextResponse.json({ ok: true, requestId })),
    )

    expect(res.status).toBe(200)
    expect(written).toHaveLength(0)
  })
})
