// @vitest-environment node
import { NotFoundError, ValidationError } from '@triyara/lib'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Public registration routes in isolation. These assert the HTTP contract and,
// more importantly, the things that are only true because the endpoint is
// UNAUTHENTICATED: no session is consulted, the organization cannot be steered
// from the body, and the response reveals nothing about what was stored.

const supplierRegistrationService = { submit: vi.fn(), presign: vi.fn() }

vi.mock('@/lib/supplier-registration-service', () => ({ supplierRegistrationService }))

// requireAuth must never be reached. Mocked to throw so that a future edit
// adding it to these routes fails loudly instead of quietly locking suppliers
// out of the one form they are supposed to be able to use.
vi.mock('@/auth/context', () => ({
  requireAuth: vi.fn(() => {
    throw new Error('requireAuth must not be called on a public route')
  }),
}))

const { POST: submit } = await import('./route')
const { POST: presign } = await import('./presign/route')

/**
 * A fresh client address per request.
 *
 * The limiter is module state shared by every test in the file, and it is
 * enforced BEFORE validation — deliberately, so a flood of malformed requests
 * still costs an attacker their allowance. Tests that are not about rate
 * limiting therefore have to arrive from somewhere they have not used up.
 */
let origin = 0
const nextOrigin = () => `192.0.2.${(origin++ % 250) + 1}`

const req = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('http://t.test/api/public/supplier-registration', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': nextOrigin(),
      ...headers,
    },
    body: JSON.stringify(body),
  })

const body = async (res: Response) =>
  (await res.json()) as {
    success: boolean
    data: Record<string, unknown> | null
    meta: { requestId: string }
    errors: Array<{ code: string; message: string; field?: string }> | null
  }

const valid = () => ({
  company: {
    companyName: 'Kerala Spice Exports',
    legalName: 'Kerala Spice Exports Pvt Ltd',
    businessType: 'MANUFACTURER_EXPORTER',
    country: 'IN',
  },
  contact: { name: 'Priya Raman', whatsapp: '+91 98470 11111' },
})

const created = {
  id: 's1',
  supplierCode: 'REG-ABCDEF0123',
  companyName: 'Kerala Spice Exports',
  status: 'PENDING_REVIEW',
  submittedAt: new Date('2026-08-02T00:00:00.000Z'),
}

beforeEach(() => vi.clearAllMocks())

describe('POST /api/public/supplier-registration', () => {
  it('accepts a submission without any session', async () => {
    supplierRegistrationService.submit.mockResolvedValue(created)
    const res = await submit(req(valid()))
    const b = await body(res)

    expect(res.status).toBe(201)
    expect(b.success).toBe(true)
    expect(b.meta.requestId).toBeTruthy()
  })

  it('tells the submitter it worked and nothing else', async () => {
    supplierRegistrationService.submit.mockResolvedValue(created)
    const b = await body(await submit(req(valid())))

    expect(b.data).toEqual({ submitted: true, companyName: 'Kerala Spice Exports' })
    // Our internal reference and the record's id are ours, not theirs.
    expect(JSON.stringify(b.data)).not.toContain('REG-ABCDEF0123')
    expect(JSON.stringify(b.data)).not.toContain('s1')
  })

  it('ignores an organizationId supplied in the body', async () => {
    supplierRegistrationService.submit.mockResolvedValue(created)
    await submit(req({ ...valid(), organizationId: 'someone-elses-org' }))

    const [, dto] = supplierRegistrationService.submit.mock.calls[0] as [unknown, object]
    // The tenant comes from configuration. If this ever reached the service,
    // the internet could write into any organization.
    expect(dto).not.toHaveProperty('organizationId')
  })

  it('accepts a supplier reachable only on WhatsApp', async () => {
    supplierRegistrationService.submit.mockResolvedValue(created)
    const res = await submit(
      req({ ...valid(), contact: { name: 'Priya', whatsapp: '+91 98470 11111' } }),
    )
    expect(res.status).toBe(201)
  })

  it('refuses a contact with no way to reach them', async () => {
    const res = await submit(req({ ...valid(), contact: { name: 'Nobody' } }))
    expect(res.status).toBe(422)
    expect(supplierRegistrationService.submit).not.toHaveBeenCalled()
  })

  it('refuses a submission missing the company basics', async () => {
    const res = await submit(req({ contact: { name: 'Priya', mobile: '1' } }))
    expect(res.status).toBe(422)
    expect(supplierRegistrationService.submit).not.toHaveBeenCalled()
  })

  it('refuses a country that is not an ISO alpha-2 code', async () => {
    const res = await submit(req({ ...valid(), company: { ...valid().company, country: 'India' } }))
    expect(res.status).toBe(422)
  })

  it('caps the free-text lists rather than accepting an unbounded payload', async () => {
    const res = await submit(
      req({
        ...valid(),
        products: { proposedProducts: Array.from({ length: 500 }, (_, i) => `p${i}`) },
      }),
    )
    expect(res.status).toBe(422)
    expect(supplierRegistrationService.submit).not.toHaveBeenCalled()
  })

  it('surfaces an upload that is not in storage as a 422 the submitter can act on', async () => {
    supplierRegistrationService.submit.mockRejectedValue(
      new ValidationError('The upload for profile.pdf was not found. Please attach it again.'),
    )
    const res = await submit(req(valid()))
    const b = await body(res)
    expect(res.status).toBe(422)
    expect(b.errors?.[0]?.message).toContain('attach it again')
  })

  it('does not leak configuration problems as a stack trace', async () => {
    supplierRegistrationService.submit.mockRejectedValue(
      new NotFoundError('Registration is not available at the moment. Please contact us directly.'),
    )
    const b = await body(await submit(req(valid())))
    expect(b.errors?.[0]?.message).toContain('contact us directly')
  })

  it('rate limits by client address once the hourly allowance is spent', async () => {
    supplierRegistrationService.submit.mockResolvedValue(created)
    const from = (ip: string) => submit(req(valid(), { 'x-forwarded-for': ip }))

    const statuses: number[] = []
    for (let i = 0; i < 7; i++) statuses.push((await from('203.0.113.10')).status)

    expect(statuses.filter((s) => s === 201).length).toBeLessThanOrEqual(5)
    expect(statuses).toContain(429)

    // A different address is unaffected: the limit is per origin, not global.
    expect((await from('203.0.113.99')).status).toBe(201)
  })
})

describe('POST /api/public/supplier-registration/presign', () => {
  const presignReq = (body: unknown, headers: Record<string, string> = {}) =>
    new Request('http://t.test/api/public/supplier-registration/presign', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': nextOrigin(),
        ...headers,
      },
      body: JSON.stringify(body),
    })

  it('issues an upload target without a session', async () => {
    supplierRegistrationService.presign.mockResolvedValue({
      uploadUrl: 'http://t.test/upload?sig=x',
      method: 'PUT',
      headers: {},
      storageKey: 'org/registrations/uuid/profile.pdf',
      expiresAt: '2026-08-02T01:00:00.000Z',
    })
    const res = await presignReq(
      { fileName: 'profile.pdf', mimeType: 'application/pdf', sizeBytes: 1024 },
      { 'x-forwarded-for': '198.51.100.1' },
    )
    expect((await presign(res)).status).toBe(201)
  })

  it('refuses a MIME type outside the platform allow-list', async () => {
    const res = await presign(
      presignReq(
        { fileName: 'payload.exe', mimeType: 'application/x-msdownload', sizeBytes: 1024 },
        { 'x-forwarded-for': '198.51.100.2' },
      ),
    )
    expect(res.status).toBe(422)
    expect(supplierRegistrationService.presign).not.toHaveBeenCalled()
  })

  it('refuses a file over the platform ceiling', async () => {
    const res = await presign(
      presignReq(
        { fileName: 'huge.pdf', mimeType: 'application/pdf', sizeBytes: 200 * 1024 * 1024 },
        { 'x-forwarded-for': '198.51.100.3' },
      ),
    )
    expect(res.status).toBe(422)
  })
})
