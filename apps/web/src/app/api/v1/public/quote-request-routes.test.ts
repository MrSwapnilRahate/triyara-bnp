// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The PUBLIC intake route in isolation. The service is mocked, so these assert
// the HTTP contract an anonymous caller actually meets: validation, the rate
// limit, the envelope, and the CORS allowlist that lets the marketing site
// reach it at all.

const quoteRequestService = { submit: vi.fn() }
vi.mock('@/lib/quote-request-service', () => ({ quoteRequestService }))

const enforcePublicSubmitLimit = vi.fn()
vi.mock('@/lib/public-rate-limit', () => ({ enforcePublicSubmitLimit }))

const VALID = {
  product: 'Dehydrated Onion',
  quantity: '2 x 40ft monthly',
  contactName: 'A Buyer',
  contactEmail: 'buyer@example.test',
}

const MARKETING_ORIGIN = 'https://www.triyaraexports.com'

function post(body: unknown, origin?: string) {
  return new Request('https://portal.triyaraexports.com/api/v1/public/quote-requests', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(origin ? { origin } : {}),
    },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  quoteRequestService.submit.mockResolvedValue({ id: 'qr1', reference: 'QR-2026-000001' })
})

describe('accepting an enquiry', () => {
  it('records it and returns the reference', async () => {
    const { POST } = await import('./quote-requests/route')
    const res = await POST(post(VALID))
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body.success).toBe(true)
    expect(body.data).toEqual({ submitted: true, reference: 'QR-2026-000001' })
    expect(quoteRequestService.submit).toHaveBeenCalledOnce()
  })

  it('echoes nothing else back', async () => {
    // An anonymous caller has no business learning our internal id, our tenant,
    // or confirmation of what we stored.
    const { POST } = await import('./quote-requests/route')
    const body = await (await POST(post(VALID))).json()

    expect(Object.keys(body.data).sort()).toEqual(['reference', 'submitted'])
    expect(JSON.stringify(body)).not.toContain('qr1')
  })

  it('applies the rate limit before doing any work', async () => {
    const { POST } = await import('./quote-requests/route')
    await POST(post(VALID))
    expect(enforcePublicSubmitLimit).toHaveBeenCalledOnce()
  })
})

describe('rejecting bad input', () => {
  it.each([
    ['no product', { ...VALID, product: '' }],
    ['no quantity', { ...VALID, quantity: '' }],
    ['no contact name', { ...VALID, contactName: '' }],
    ['no email', { ...VALID, contactEmail: '' }],
    ['a malformed email', { ...VALID, contactEmail: 'not-an-email' }],
  ])('refuses %s', async (_label, body) => {
    const { POST } = await import('./quote-requests/route')
    const res = await POST(post(body))

    expect(res.status).toBe(422)
    expect(quoteRequestService.submit).not.toHaveBeenCalled()
  })

  it('refuses a lead score it did not define', async () => {
    // The score is caller-supplied and advisory. Bounding it stops the field
    // being used as an open text channel into the queue.
    const { POST } = await import('./quote-requests/route')
    const res = await POST(post({ ...VALID, leadScore: '<script>' }))
    expect(res.status).toBe(422)
  })

  it('surfaces the rate limit as 429, not a generic failure', async () => {
    const { AppError } = await import('@triyara/lib')
    enforcePublicSubmitLimit.mockImplementationOnce(() => {
      throw new AppError('Too many enquiries.', 'RATE_LIMITED', 429)
    })

    const { POST } = await import('./quote-requests/route')
    const res = await POST(post(VALID))

    expect(res.status).toBe(429)
    expect(quoteRequestService.submit).not.toHaveBeenCalled()
  })
})

describe('cross-origin access', () => {
  it('lets the marketing site through', async () => {
    const { POST } = await import('./quote-requests/route')
    const res = await POST(post(VALID, MARKETING_ORIGIN))

    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(MARKETING_ORIGIN)
    expect(res.headers.get('Vary')).toBe('Origin')
  })

  it('never answers with a wildcard', async () => {
    const { POST } = await import('./quote-requests/route')
    const res = await POST(post(VALID, MARKETING_ORIGIN))
    expect(res.headers.get('Access-Control-Allow-Origin')).not.toBe('*')
  })

  it('does not reflect an origin that is not on the list', async () => {
    // The failure that matters: an attacker site must not be able to post
    // enquiries from a visitor's browser.
    const { POST } = await import('./quote-requests/route')
    const res = await POST(post(VALID, 'https://not-triyara.example'))
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })

  it('sends the headers on a failure too', async () => {
    // Without them the browser hides the response and the visitor sees a
    // generic network error instead of the reason their enquiry was refused.
    const { POST } = await import('./quote-requests/route')
    const res = await POST(post({ ...VALID, contactEmail: 'nope' }, MARKETING_ORIGIN))

    expect(res.status).toBe(422)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(MARKETING_ORIGIN)
  })

  it('answers the preflight', async () => {
    const { OPTIONS } = await import('./quote-requests/route')
    const res = OPTIONS(
      new Request('https://portal.triyaraexports.com/api/v1/public/quote-requests', {
        method: 'OPTIONS',
        headers: { origin: MARKETING_ORIGIN },
      }),
    )

    expect(res.status).toBe(204)
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST')
  })
})
