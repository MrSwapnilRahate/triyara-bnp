// @vitest-environment node
import { NotFoundError, ValidationError } from '@triyara/lib'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Public buyer registration routes in isolation. These assert the HTTP contract
// and the things only true because the endpoint is UNAUTHENTICATED: no session
// is consulted, the organization cannot be steered from the body, and the
// response reveals nothing about what was stored.

const buyerRegistrationService = { submit: vi.fn(), presign: vi.fn(), decide: vi.fn() }

vi.mock('@/lib/buyer-registration-service', () => ({ buyerRegistrationService }))

// requireAuth must never be reached. Mocked to throw so a future edit adding it
// fails loudly rather than quietly locking buyers out of the enquiry form.
vi.mock('@/auth/context', () => ({
  requireAuth: vi.fn(() => {
    throw new Error('requireAuth must not be called on a public route')
  }),
}))

const { POST: submit } = await import('./route')
const { POST: presign } = await import('./presign/route')

/** A fresh client address per request; the limiter is shared module state. */
let origin = 0
const nextOrigin = () => `198.51.100.${(origin++ % 250) + 1}`

const req = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://t.test${path}`, {
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
    errors: Array<{ code: string; message: string }> | null
  }

const valid = () => ({
  company: { companyName: 'Gulf Spice Trading LLC', country: 'AE' },
  contact: { name: 'Fatima Al Mansouri', phone: '+971 50 123 4567' },
})

const created = {
  id: 'acc1',
  legalName: 'Gulf Spice Trading LLC',
  registrationStatus: 'PENDING_REVIEW',
  submittedAt: new Date('2026-08-02T00:00:00.000Z'),
}

beforeEach(() => vi.clearAllMocks())

describe('POST /api/public/buyer-registration', () => {
  it('accepts an enquiry without any session', async () => {
    buyerRegistrationService.submit.mockResolvedValue(created)
    const res = await submit(req('/api/public/buyer-registration', valid()))
    const b = await body(res)

    expect(res.status).toBe(201)
    expect(b.success).toBe(true)
    expect(b.meta.requestId).toBeTruthy()
  })

  it('tells the submitter it worked and nothing else', async () => {
    buyerRegistrationService.submit.mockResolvedValue(created)
    const b = await body(await submit(req('/api/public/buyer-registration', valid())))

    expect(b.data).toEqual({ submitted: true, companyName: 'Gulf Spice Trading LLC' })
    // Our internal account id is ours, not theirs.
    expect(JSON.stringify(b.data)).not.toContain('acc1')
  })

  it('ignores an organizationId supplied in the body', async () => {
    buyerRegistrationService.submit.mockResolvedValue(created)
    await submit(
      req('/api/public/buyer-registration', { ...valid(), organizationId: 'someone-elses-org' }),
    )
    const [, dto] = buyerRegistrationService.submit.mock.calls[0] as [unknown, object]
    expect(dto).not.toHaveProperty('organizationId')
  })

  it('accepts a buyer reachable only on WhatsApp', async () => {
    buyerRegistrationService.submit.mockResolvedValue(created)
    const res = await submit(
      req('/api/public/buyer-registration', {
        ...valid(),
        contact: { name: 'Fatima', whatsapp: '+971 55 000 0000' },
      }),
    )
    expect(res.status).toBe(201)
  })

  it('refuses a contact with no way to reach them', async () => {
    const res = await submit(
      req('/api/public/buyer-registration', { ...valid(), contact: { name: 'Nobody' } }),
    )
    expect(res.status).toBe(422)
    expect(buyerRegistrationService.submit).not.toHaveBeenCalled()
  })

  it('refuses a country that is not an ISO alpha-2 code', async () => {
    const res = await submit(
      req('/api/public/buyer-registration', {
        ...valid(),
        company: { companyName: 'X', country: 'United Arab Emirates' },
      }),
    )
    expect(res.status).toBe(422)
  })

  it('caps the product list rather than accepting an unbounded payload', async () => {
    const res = await submit(
      req('/api/public/buyer-registration', {
        ...valid(),
        requirement: { products: Array.from({ length: 200 }, (_, i) => ({ product: `p${i}` })) },
      }),
    )
    expect(res.status).toBe(422)
    expect(buyerRegistrationService.submit).not.toHaveBeenCalled()
  })

  it('refuses a document type the Document module cannot store', async () => {
    // CATALOG is a valid SUPPLIER document type but has no DocumentType
    // equivalent. Reusing the supplier schema here would let it through and
    // fail at the database instead.
    const res = await submit(
      req('/api/public/buyer-registration', {
        ...valid(),
        documents: [{ type: 'CATALOG', storageKey: 'k' }],
      }),
    )
    expect(res.status).toBe(422)
    expect(buyerRegistrationService.submit).not.toHaveBeenCalled()
  })

  it('surfaces a missing upload as a 422 the submitter can act on', async () => {
    buyerRegistrationService.submit.mockRejectedValue(
      new ValidationError('The upload for profile.pdf was not found. Please attach it again.'),
    )
    const b = await body(await submit(req('/api/public/buyer-registration', valid())))
    expect(b.errors?.[0]?.message).toContain('attach it again')
  })

  it('does not leak configuration problems as a stack trace', async () => {
    buyerRegistrationService.submit.mockRejectedValue(
      new NotFoundError('Registration is not available at the moment. Please contact us directly.'),
    )
    const b = await body(await submit(req('/api/public/buyer-registration', valid())))
    expect(b.errors?.[0]?.message).toContain('contact us directly')
  })

  it('shares the submission rate limit with the supplier form', async () => {
    buyerRegistrationService.submit.mockResolvedValue(created)
    const from = (ip: string) =>
      submit(req('/api/public/buyer-registration', valid(), { 'x-forwarded-for': ip }))

    const statuses: number[] = []
    for (let i = 0; i < 7; i++) statuses.push((await from('203.0.113.200')).status)

    // One attacker must not get a fresh allowance by switching forms.
    expect(statuses.filter((s) => s === 201).length).toBeLessThanOrEqual(5)
    expect(statuses).toContain(429)
    expect((await from('203.0.113.201')).status).toBe(201)
  })
})

describe('POST /api/public/buyer-registration/presign', () => {
  const path = '/api/public/buyer-registration/presign'

  it('issues an upload target without a session', async () => {
    buyerRegistrationService.presign.mockResolvedValue({
      uploadUrl: 'http://t.test/upload?sig=x',
      method: 'PUT',
      headers: {},
      storageKey: 'org/buyer-registrations/uuid/profile.pdf',
      expiresAt: '2026-08-02T01:00:00.000Z',
    })
    const res = await presign(
      req(path, { fileName: 'profile.pdf', mimeType: 'application/pdf', sizeBytes: 2048 }),
    )
    expect(res.status).toBe(201)
  })

  it('refuses a MIME type outside the platform allow-list', async () => {
    const res = await presign(
      req(path, { fileName: 'x.exe', mimeType: 'application/x-msdownload', sizeBytes: 10 }),
    )
    expect(res.status).toBe(422)
    expect(buyerRegistrationService.presign).not.toHaveBeenCalled()
  })

  it('refuses a file over the platform ceiling', async () => {
    const res = await presign(
      req(path, {
        fileName: 'huge.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 200 * 1024 * 1024,
      }),
    )
    expect(res.status).toBe(422)
  })
})
