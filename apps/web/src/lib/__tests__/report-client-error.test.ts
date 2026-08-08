// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const captureException = vi.fn()
vi.mock('@sentry/nextjs', () => ({ captureException }))

const { reportClientError } = await import('../report-client-error')

beforeEach(() => captureException.mockReset())
afterEach(() => vi.restoreAllMocks())

describe('a server render failure is not reported twice', () => {
  it('files nothing when the error carries a digest', () => {
    // A digest means Next caught this on the server. `onRequestError` has
    // already logged and reported it, and the copy the boundary receives has
    // had its message replaced with a generic one - so the second report would
    // be both a duplicate and the less useful of the two.
    const error = Object.assign(new Error('An error occurred in the Server Components render.'), {
      digest: '1234567890',
    })

    reportClientError(error)

    expect(captureException).not.toHaveBeenCalled()
  })

  it('files the error when there is no digest', () => {
    // No digest means it happened in the browser, and nothing has seen it.
    const error = new TypeError('Cannot read properties of undefined')

    reportClientError(error)

    expect(captureException).toHaveBeenCalledOnce()
    expect(captureException.mock.calls[0]![0]).toBe(error)
  })

  it('tags a browser failure as such', () => {
    reportClientError(new Error('boom'))
    expect(captureException.mock.calls[0]![1]).toEqual({ tags: { source: 'client-render' } })
  })

  it('treats an empty digest as no digest', () => {
    // `digest: ''` would be falsy either way, but the boundary between "server
    // said something" and "it did not" is worth pinning down.
    reportClientError(Object.assign(new Error('boom'), { digest: '' }))
    expect(captureException).toHaveBeenCalledOnce()
  })
})

describe('a boundary must still render', () => {
  it('does not rethrow when Sentry throws', () => {
    // The boundary's job is to show the user something useful. If reporting
    // threw, the boundary itself would fail and the user would get nothing.
    captureException.mockImplementation(() => {
      throw new Error('SDK not initialised')
    })

    expect(() => reportClientError(new Error('boom'))).not.toThrow()
  })
})
