// @vitest-environment node
import { randomUUID } from 'node:crypto'

import { buildAbilityFor, type Role } from '@triyara/auth'
import { prisma } from '@triyara/db'
import { beforeAll, describe, expect, it, vi } from 'vitest'

// Full-stack API integration: route handler -> service -> repository -> real
// PostgreSQL. Only the auth context is mocked; nothing else is stubbed, so this
// exercises authorization, org isolation, the workflow table, cost redaction,
// optimistic locking and audit for real.

const authState = { roles: ['ADMIN'] as Role[], organizationId: '', userId: '' }

vi.mock('@/auth/context', () => ({
  requireAuth: vi.fn(async () => {
    const user = {
      id: authState.userId,
      organizationId: authState.organizationId,
      email: 'quote-api@triyara.test',
      name: 'API IT',
      roles: authState.roles,
    }
    return {
      user,
      organizationId: authState.organizationId,
      ability: buildAbilityFor(authState.roles),
    }
  }),
}))

const { GET: listQuotations, POST: createQuotation } = await import('./route')
const {
  GET: getQuotation,
  PATCH: patchQuotation,
  DELETE: deleteQuotation,
} = await import('./[id]/route')
const { GET: listItems } = await import('./[id]/items/route')
const { POST: approve } = await import('./[id]/approve/route')
const { POST: reject } = await import('./[id]/reject/route')
const { POST: send } = await import('./[id]/send/route')
const { POST: accept } = await import('./[id]/accept/route')
const { POST: expire } = await import('./[id]/expire/route')

const req = (url: string, init?: RequestInit) => new Request(`http://t.test${url}`, init)
const params = (id: string) => ({ params: Promise.resolve({ id }) })
const body = async (res: Response) =>
  (await res.json()) as {
    success: boolean
    data: never
    meta: { requestId: string; pagination?: { nextCursor: string | null }; [k: string]: unknown }
    errors: Array<{ code: string; message: string }> | null
  }

// Full entropy: numbers AND titles must be unique across runs, not just within one.
const uniq = () => randomUUID().replace(/-/g, '').slice(0, 10)
const num = () => `QT-IT-${uniq().toUpperCase()}`

type Created = {
  id: string
  version: number
  quotationNumber: string
  status: string
  items: Array<{ id: string }>
}

describe.skipIf(!process.env.DATABASE_URL)('quotation API (integration, real PostgreSQL)', () => {
  let otherOrgId = ''
  let accountId = ''
  let productId = ''

  const newQuotation = (over: Record<string, unknown> = {}) => ({
    quotationNumber: num(),
    type: 'FIRM',
    buyerId: accountId,
    title: `IT Quotation ${uniq()}`,
    currency: 'USD',
    baseCurrency: 'USD',
    validUntil: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    items: [{ productId, quantity: 10, unit: 'MT', unitPrice: 100, unitCost: 80 }],
    ...over,
  })

  async function create(over: Record<string, unknown> = {}): Promise<Created> {
    const res = await createQuotation(
      req('/api/quotations', { method: 'POST', body: JSON.stringify(newQuotation(over)) }),
    )
    expect(res.status).toBe(201)
    return (await body(res)).data as unknown as Created
  }

  /** Drives a quotation to SENT through the real endpoints. */
  async function sent(over: Record<string, unknown> = {}) {
    const q = await create(over)
    const app = await approve(
      req(`/api/quotations/${q.id}/approve`, {
        method: 'POST',
        headers: { 'if-match': `W/"v${q.version}"` },
        body: '{}',
      }),
      params(q.id),
    )
    expect(app.status).toBe(200)
    const v = ((await body(app)).data as unknown as { version: number }).version
    const s = await send(
      req(`/api/quotations/${q.id}/send`, {
        method: 'POST',
        headers: { 'if-match': `W/"v${v}"` },
      }),
      params(q.id),
    )
    expect(s.status).toBe(200)
    const after = (await body(s)).data as unknown as { version: number; status: string }
    return { ...q, version: after.version, status: after.status }
  }

  beforeAll(async () => {
    const org = await prisma.organization.upsert({
      where: { slug: 'quote-api-itest' },
      update: {},
      create: { name: 'Quotation API IT', slug: 'quote-api-itest' },
    })
    authState.organizationId = org.id
    const user = await prisma.user.upsert({
      where: { email: 'quote-api@triyara.test' },
      update: {},
      create: {
        organizationId: org.id,
        email: 'quote-api@triyara.test',
        name: 'API IT',
        passwordHash: 'x',
      },
    })
    authState.userId = user.id

    const other = await prisma.organization.upsert({
      where: { slug: 'quote-api-itest-other' },
      update: {},
      create: { name: 'Other Tenant', slug: 'quote-api-itest-other' },
    })
    otherOrgId = other.id

    const account = await prisma.account.create({
      data: {
        organizationId: org.id,
        legalName: `Buyer ${uniq()}`,
        createdById: user.id,
        updatedById: user.id,
      },
    })
    accountId = account.id

    const cat = await prisma.category.upsert({
      where: { organizationId_slug: { organizationId: org.id, slug: 'quote-api-cat' } },
      update: {},
      create: {
        organizationId: org.id,
        name: 'IT Cat',
        slug: 'quote-api-cat',
        path: '/quote-api-cat',
        depth: 0,
      },
    })
    const product = await prisma.product.create({
      data: {
        organizationId: org.id,
        categoryId: cat.id,
        sku: `P-${uniq()}`,
        name: `IT Product ${uniq()}`,
        slug: `it-${uniq()}`,
      },
    })
    productId = product.id
  })

  describe('lifecycle', () => {
    it('creates in DRAFT at revision 1 with priced totals', async () => {
      const q = await create()
      expect(q.status).toBe('DRAFT')
      const res = await getQuotation(req(`/api/quotations/${q.id}`), params(q.id))
      const d = (await body(res)).data as unknown as {
        revisionNumber: number
        subtotal: string
        grandTotal: string
      }
      expect(res.status).toBe(200)
      expect(d.revisionNumber).toBe(1)
      expect(Number(d.subtotal)).toBe(1000)
      expect(Number(d.grandTotal)).toBe(1000)
      expect(res.headers.get('ETag')).toBe(`W/"v${q.version}"`)
    })

    it('rejects a duplicate number and revision with 409', async () => {
      const q = await create()
      const res = await createQuotation(
        req('/api/quotations', {
          method: 'POST',
          body: JSON.stringify(newQuotation({ quotationNumber: q.quotationNumber })),
        }),
      )
      expect(res.status).toBe(409)
    })

    it('rejects a line with no product and no custom name', async () => {
      const res = await createQuotation(
        req('/api/quotations', {
          method: 'POST',
          body: JSON.stringify(
            newQuotation({ items: [{ quantity: 1, unit: 'MT', unitPrice: 10 }] }),
          ),
        }),
      )
      expect(res.status).toBe(422)
    })

    it('rejects a zero unit price', async () => {
      const res = await createQuotation(
        req('/api/quotations', {
          method: 'POST',
          body: JSON.stringify(
            newQuotation({ items: [{ productId, quantity: 1, unit: 'MT', unitPrice: 0 }] }),
          ),
        }),
      )
      expect(res.status).toBe(422)
    })

    it('refuses a cross-currency quotation with no exchange rate on file', async () => {
      const res = await createQuotation(
        req('/api/quotations', {
          method: 'POST',
          body: JSON.stringify(newQuotation({ currency: 'GBP', baseCurrency: 'INR' })),
        }),
      )
      expect(res.status).toBe(422)
      expect((await body(res)).errors?.[0]?.message).toMatch(/exchange rate/i)
    })

    it('rejects a validity window that closes before it opens', async () => {
      const res = await createQuotation(
        req('/api/quotations', {
          method: 'POST',
          body: JSON.stringify(
            newQuotation({
              validFrom: '2026-06-01T00:00:00.000Z',
              validUntil: '2026-05-01T00:00:00.000Z',
            }),
          ),
        }),
      )
      expect(res.status).toBe(422)
    })

    it('withdraws rather than erases, then hides it from reads', async () => {
      const q = await create()
      const del = await deleteQuotation(
        req(`/api/quotations/${q.id}`, {
          method: 'DELETE',
          headers: { 'if-match': `W/"v${q.version}"` },
        }),
        params(q.id),
      )
      expect(del.status).toBe(200)
      expect(((await body(del)).data as unknown as { status: string }).status).toBe('WITHDRAWN')
      expect((await getQuotation(req(`/api/quotations/${q.id}`), params(q.id))).status).toBe(404)
    })
  })

  describe('workflow transitions', () => {
    it('approves a DRAFT quotation', async () => {
      const q = await create()
      const res = await approve(
        req(`/api/quotations/${q.id}/approve`, {
          method: 'POST',
          headers: { 'if-match': `W/"v${q.version}"` },
          body: JSON.stringify({ comments: 'Margin acceptable.' }),
        }),
        params(q.id),
      )
      expect(res.status).toBe(200)
      expect((await body(res)).meta.status).toBe('APPROVED')
    })

    it('refuses to send a quotation that is not APPROVED', async () => {
      const q = await create()
      const res = await send(
        req(`/api/quotations/${q.id}/send`, {
          method: 'POST',
          headers: { 'if-match': `W/"v${q.version}"` },
        }),
        params(q.id),
      )
      expect(res.status).toBe(409)
    })

    it('refuses to send a quotation with no validity date', async () => {
      const q = await create({ validUntil: undefined })
      const app = await approve(
        req(`/api/quotations/${q.id}/approve`, {
          method: 'POST',
          headers: { 'if-match': `W/"v${q.version}"` },
          body: '{}',
        }),
        params(q.id),
      )
      const v = ((await body(app)).data as unknown as { version: number }).version
      const res = await send(
        req(`/api/quotations/${q.id}/send`, {
          method: 'POST',
          headers: { 'if-match': `W/"v${v}"` },
        }),
        params(q.id),
      )
      expect(res.status).toBe(422)
      expect((await body(res)).errors?.[0]?.message).toMatch(/validity date/i)
    })

    it('sends an approved quotation and stamps sentAt', async () => {
      const q = await sent()
      expect(q.status).toBe('SENT')
      const d = (await body(await getQuotation(req(`/api/quotations/${q.id}`), params(q.id))))
        .data as unknown as { sentAt: string | null }
      expect(d.sentAt).not.toBeNull()
    })

    it('accepts a SENT quotation', async () => {
      const q = await sent()
      const res = await accept(
        req(`/api/quotations/${q.id}/accept`, {
          method: 'POST',
          headers: { 'if-match': `W/"v${q.version}"` },
          body: JSON.stringify({ comments: 'Buyer confirmed by email.' }),
        }),
        params(q.id),
      )
      expect(res.status).toBe(200)
      expect((await body(res)).meta.status).toBe('ACCEPTED')
    })

    it('refuses to accept a DRAFT quotation', async () => {
      const q = await create()
      const res = await accept(
        req(`/api/quotations/${q.id}/accept`, {
          method: 'POST',
          headers: { 'if-match': `W/"v${q.version}"` },
          body: '{}',
        }),
        params(q.id),
      )
      expect(res.status).toBe(409)
      expect((await body(res)).errors?.[0]?.message).toMatch(/cannot be accepted/)
    })

    it('expires a SENT quotation', async () => {
      const q = await sent()
      const res = await expire(
        req(`/api/quotations/${q.id}/expire`, {
          method: 'POST',
          headers: { 'if-match': `W/"v${q.version}"` },
          body: '{}',
        }),
        params(q.id),
      )
      expect(res.status).toBe(200)
      expect((await body(res)).meta.status).toBe('EXPIRED')
    })

    it('refuses to expire a DRAFT quotation', async () => {
      const q = await create()
      const res = await expire(
        req(`/api/quotations/${q.id}/expire`, {
          method: 'POST',
          headers: { 'if-match': `W/"v${q.version}"` },
          body: '{}',
        }),
        params(q.id),
      )
      expect(res.status).toBe(409)
    })

    it('rejects a SENT quotation', async () => {
      const q = await sent()
      const res = await reject(
        req(`/api/quotations/${q.id}/reject`, {
          method: 'POST',
          headers: { 'if-match': `W/"v${q.version}"` },
          body: '{}',
        }),
        params(q.id),
      )
      expect(res.status).toBe(200)
      expect((await body(res)).meta.status).toBe('REJECTED')
    })

    it('treats ACCEPTED as terminal', async () => {
      const q = await sent()
      const acc = await accept(
        req(`/api/quotations/${q.id}/accept`, {
          method: 'POST',
          headers: { 'if-match': `W/"v${q.version}"` },
          body: '{}',
        }),
        params(q.id),
      )
      const v = ((await body(acc)).data as unknown as { version: number }).version
      const res = await expire(
        req(`/api/quotations/${q.id}/expire`, {
          method: 'POST',
          headers: { 'if-match': `W/"v${v}"` },
          body: '{}',
        }),
        params(q.id),
      )
      expect(res.status).toBe(409)
    })

    it('freezes the document once SENT', async () => {
      const q = await sent()
      const res = await patchQuotation(
        req(`/api/quotations/${q.id}`, {
          method: 'PATCH',
          headers: { 'if-match': `W/"v${q.version}"` },
          body: JSON.stringify({ title: 'Too late' }),
        }),
        params(q.id),
      )
      expect(res.status).toBe(409)
      expect((await body(res)).errors?.[0]?.message).toMatch(/revision/i)
    })

    it('records each move on the approval history', async () => {
      const q = await sent()
      await accept(
        req(`/api/quotations/${q.id}/accept`, {
          method: 'POST',
          headers: { 'if-match': `W/"v${q.version}"` },
          body: '{}',
        }),
        params(q.id),
      )
      const approvals = await prisma.quotationApproval.findMany({
        where: { quotationId: q.id },
        orderBy: { sequence: 'asc' },
      })
      // Opening DRAFT row, then approve, send and accept.
      expect(approvals.length).toBeGreaterThanOrEqual(4)
      expect(approvals.at(-1)!.comments).toMatch(/accepted/i)
    })
  })

  describe('internal cost redaction', () => {
    it('hides cost and margin from a non-admin, on the record and on its lines', async () => {
      const q = await create()
      authState.roles = ['EXPORT_MANAGER']
      const b = await body(await getQuotation(req(`/api/quotations/${q.id}`), params(q.id)))
      const items = await body(await listItems(req(`/api/quotations/${q.id}/items`), params(q.id)))
      authState.roles = ['ADMIN']

      const d = b.data as unknown as { costTotal: null; marginPercent: null }
      expect(d.costTotal).toBeNull()
      expect(d.marginPercent).toBeNull()
      expect((items.data as unknown as Array<{ unitCost: null }>)[0]!.unitCost).toBeNull()
    })

    it('shows cost and margin to an admin', async () => {
      const q = await create()
      const b = await body(await getQuotation(req(`/api/quotations/${q.id}`), params(q.id)))
      const d = b.data as unknown as { costTotal: string; marginPercent: string }
      expect(Number(d.costTotal)).toBe(800)
      expect(Number(d.marginPercent)).toBe(20)
    })
  })

  describe('optimistic concurrency', () => {
    it('refuses a second write reusing a stale version and does not apply it', async () => {
      const q = await create()
      const stale = `W/"v${q.version}"`
      await patchQuotation(
        req(`/api/quotations/${q.id}`, {
          method: 'PATCH',
          headers: { 'if-match': stale },
          body: JSON.stringify({ title: 'First' }),
        }),
        params(q.id),
      )
      const second = await patchQuotation(
        req(`/api/quotations/${q.id}`, {
          method: 'PATCH',
          headers: { 'if-match': stale },
          body: JSON.stringify({ title: 'Second' }),
        }),
        params(q.id),
      )
      expect(second.status).toBe(412)
      const row = await prisma.quotation.findUniqueOrThrow({ where: { id: q.id } })
      expect(row.title).toBe('First')
    })

    it('guards workflow moves with If-Match', async () => {
      const q = await create()
      const stale = await approve(
        req(`/api/quotations/${q.id}/approve`, {
          method: 'POST',
          headers: { 'if-match': `W/"v${q.version + 5}"` },
          body: '{}',
        }),
        params(q.id),
      )
      expect(stale.status).toBe(412)
    })

    it('answers 428 when If-Match is absent on a workflow move', async () => {
      const q = await create()
      expect(
        (
          await approve(
            req(`/api/quotations/${q.id}/approve`, { method: 'POST', body: '{}' }),
            params(q.id),
          )
        ).status,
      ).toBe(428)
    })
  })

  describe('authorization', () => {
    it('lets a READ_ONLY actor list quotations', async () => {
      authState.roles = ['READ_ONLY']
      const res = await listQuotations(req('/api/quotations?limit=1'))
      authState.roles = ['ADMIN']
      expect(res.status).toBe(200)
    })

    it('refuses creation to a READ_ONLY actor', async () => {
      authState.roles = ['READ_ONLY']
      const res = await createQuotation(
        req('/api/quotations', { method: 'POST', body: JSON.stringify(newQuotation()) }),
      )
      authState.roles = ['ADMIN']
      expect(res.status).toBe(403)
    })

    it('lets an EXPORT_MANAGER approve an ordinary quotation', async () => {
      const q = await create()
      authState.roles = ['EXPORT_MANAGER']
      const res = await approve(
        req(`/api/quotations/${q.id}/approve`, {
          method: 'POST',
          headers: { 'if-match': `W/"v${q.version}"` },
          body: '{}',
        }),
        params(q.id),
      )
      authState.roles = ['ADMIN']
      expect(res.status).toBe(200)
    })

    it('demands an ADMIN to approve above the value threshold', async () => {
      // Default threshold is 1,000,000; 20,000 MT x 100 = 2,000,000.
      const q = await create({
        items: [{ productId, quantity: 20000, unit: 'MT', unitPrice: 100, unitCost: 80 }],
      })
      authState.roles = ['EXPORT_MANAGER']
      const denied = await approve(
        req(`/api/quotations/${q.id}/approve`, {
          method: 'POST',
          headers: { 'if-match': `W/"v${q.version}"` },
          body: '{}',
        }),
        params(q.id),
      )
      authState.roles = ['ADMIN']
      expect(denied.status).toBe(403)

      const allowed = await approve(
        req(`/api/quotations/${q.id}/approve`, {
          method: 'POST',
          headers: { 'if-match': `W/"v${q.version}"` },
          body: '{}',
        }),
        params(q.id),
      )
      expect(allowed.status).toBe(200)
    })

    it('demands an ADMIN to approve below the margin floor', async () => {
      // Default floor is 10%; cost 98 against price 100 is 2%.
      const q = await create({
        items: [{ productId, quantity: 10, unit: 'MT', unitPrice: 100, unitCost: 98 }],
      })
      authState.roles = ['EXPORT_MANAGER']
      const denied = await approve(
        req(`/api/quotations/${q.id}/approve`, {
          method: 'POST',
          headers: { 'if-match': `W/"v${q.version}"` },
          body: '{}',
        }),
        params(q.id),
      )
      authState.roles = ['ADMIN']
      expect(denied.status).toBe(403)
    })

    it('refuses deletion to a VERIFIER', async () => {
      const q = await create()
      authState.roles = ['VERIFIER']
      const res = await deleteQuotation(
        req(`/api/quotations/${q.id}`, {
          method: 'DELETE',
          headers: { 'if-match': `W/"v${q.version}"` },
        }),
        params(q.id),
      )
      authState.roles = ['ADMIN']
      expect(res.status).toBe(403)
    })
  })

  describe('organization isolation', () => {
    const foreign = async () =>
      prisma.quotation.create({
        data: {
          organizationId: otherOrgId,
          quotationNumber: num(),
          revisionNumber: 1,
          type: 'FIRM',
          buyerId: accountId,
          title: `Foreign ${uniq()}`,
          currency: 'USD',
          baseCurrency: 'USD',
          subtotal: 1,
          chargesTotal: 0,
          discountTotal: 0,
          taxTotal: 0,
          grandTotal: 1,
          createdById: authState.userId,
        },
      })

    it('reports another tenant’s quotation as 404, never 403', async () => {
      const f = await foreign()
      expect((await getQuotation(req(`/api/quotations/${f.id}`), params(f.id))).status).toBe(404)
    })

    it('excludes another tenant’s quotations from the list', async () => {
      const marker = uniq().toUpperCase()
      await prisma.quotation.create({
        data: {
          organizationId: otherOrgId,
          quotationNumber: `QT-FOREIGN-${marker}`,
          revisionNumber: 1,
          type: 'FIRM',
          buyerId: accountId,
          currency: 'USD',
          baseCurrency: 'USD',
          subtotal: 1,
          chargesTotal: 0,
          discountTotal: 0,
          taxTotal: 0,
          grandTotal: 1,
          createdById: authState.userId,
        },
      })
      expect(
        (await body(await listQuotations(req(`/api/quotations?q=${marker}`)))).data,
      ).toHaveLength(0)
    })

    it('refuses to update another tenant’s quotation and leaves it untouched', async () => {
      const f = await foreign()
      const res = await patchQuotation(
        req(`/api/quotations/${f.id}`, {
          method: 'PATCH',
          headers: { 'if-match': 'W/"v1"' },
          body: JSON.stringify({ title: 'Hijacked' }),
        }),
        params(f.id),
      )
      expect(res.status).toBe(404)
      const row = await prisma.quotation.findUniqueOrThrow({ where: { id: f.id } })
      expect(row.title).not.toBe('Hijacked')
    })

    it('refuses a workflow move on another tenant’s quotation', async () => {
      const f = await foreign()
      const res = await approve(
        req(`/api/quotations/${f.id}/approve`, {
          method: 'POST',
          headers: { 'if-match': 'W/"v1"' },
          body: '{}',
        }),
        params(f.id),
      )
      expect(res.status).toBe(404)
    })

    it('refuses to read another tenant’s items', async () => {
      const f = await foreign()
      expect((await listItems(req(`/api/quotations/${f.id}/items`), params(f.id))).status).toBe(404)
    })
  })

  describe('audit logging', () => {
    it('writes an audit entry carrying the caller request id', async () => {
      const requestId = `req-${uniq()}`
      const res = await createQuotation(
        req('/api/quotations', {
          method: 'POST',
          headers: { 'x-request-id': requestId },
          body: JSON.stringify(newQuotation()),
        }),
      )
      const created = (await body(res)).data as unknown as { id: string }
      const entries = await prisma.auditLog.findMany({
        where: { organizationId: authState.organizationId, entityId: created.id },
        select: { action: true, actorId: true, requestId: true },
      })
      expect(entries.map((e) => e.action)).toContain('quotation.created')
      expect(entries[0]!.actorId).toBe(authState.userId)
      expect(entries[0]!.requestId).toBe(requestId)
    })

    it('audits a workflow move distinctly from the create', async () => {
      const q = await create()
      await approve(
        req(`/api/quotations/${q.id}/approve`, {
          method: 'POST',
          headers: { 'if-match': `W/"v${q.version}"` },
          body: '{}',
        }),
        params(q.id),
      )
      const actions = await prisma.auditLog.findMany({
        where: { organizationId: authState.organizationId, entityId: q.id },
        orderBy: { createdAt: 'asc' },
        select: { action: true },
      })
      expect(actions[0]!.action).toBe('quotation.created')
      expect(actions.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('items', () => {
    it('lists the lines with quotation context', async () => {
      const q = await create()
      const b = await body(await listItems(req(`/api/quotations/${q.id}/items`), params(q.id)))
      expect(b.data).toHaveLength(1)
      expect(b.meta).toMatchObject({
        quotationId: q.id,
        revisionNumber: 1,
        currency: 'USD',
        count: 1,
      })
    })

    it('carries the RFQ line provenance when supplied', async () => {
      const rfq = await prisma.rFQ.create({
        data: {
          organizationId: authState.organizationId,
          rfqNumber: `RFQ-${uniq().toUpperCase()}`,
          type: 'BUYER',
          buyerId: accountId,
          title: `Src ${uniq()}`,
          createdById: authState.userId,
        },
      })
      const rfqItem = await prisma.rFQItem.create({
        data: {
          rfqId: rfq.id,
          organizationId: authState.organizationId,
          lineNumber: 1,
          productId,
          quantity: 10,
          unit: 'MT',
        },
      })
      const q = await create({
        primaryRfqId: rfq.id,
        items: [
          {
            productId,
            rfqItemId: rfqItem.id,
            quantity: 10,
            unit: 'MT',
            unitPrice: 100,
            unitCost: 80,
          },
        ],
      })
      const b = await body(await listItems(req(`/api/quotations/${q.id}/items`), params(q.id)))
      expect((b.data as unknown as Array<{ rfqItemId: string }>)[0]!.rfqItemId).toBe(rfqItem.id)
    })
  })

  describe('pagination, filtering and sorting', () => {
    it('pages by cursor without repeating a row', async () => {
      const marker = uniq().toUpperCase()
      for (let i = 0; i < 3; i += 1) await create({ quotationNumber: `QT-PG-${marker}-${i}` })

      const first = await body(await listQuotations(req(`/api/quotations?q=${marker}&limit=2`)))
      expect(first.data).toHaveLength(2)
      expect(first.meta.pagination?.nextCursor).toBeTruthy()

      const second = await body(
        await listQuotations(
          req(`/api/quotations?q=${marker}&limit=2&cursor=${first.meta.pagination!.nextCursor}`),
        ),
      )
      expect(second.data).toHaveLength(1)
      const ids = new Set(
        [
          ...(first.data as unknown as Array<{ id: string }>),
          ...(second.data as unknown as Array<{ id: string }>),
        ].map((r) => r.id),
      )
      expect(ids.size).toBe(3)
    })

    it('filters by status', async () => {
      const marker = uniq().toUpperCase()
      await create({ quotationNumber: `QT-FL-${marker}` })
      expect(
        (await body(await listQuotations(req(`/api/quotations?q=${marker}&status=DRAFT`)))).data,
      ).toHaveLength(1)
      expect(
        (await body(await listQuotations(req(`/api/quotations?q=${marker}&status=ACCEPTED`)))).data,
      ).toHaveLength(0)
    })

    it('sorts by grandTotal in both directions', async () => {
      const marker = uniq().toUpperCase()
      await create({
        quotationNumber: `QT-LO-${marker}`,
        items: [{ productId, quantity: 1, unit: 'MT', unitPrice: 10, unitCost: 5 }],
      })
      await create({
        quotationNumber: `QT-HI-${marker}`,
        items: [{ productId, quantity: 1, unit: 'MT', unitPrice: 5000, unitCost: 5 }],
      })
      const asc = (
        (await body(await listQuotations(req(`/api/quotations?q=${marker}&sort=grandTotal`))))
          .data as unknown as Array<{ grandTotal: string }>
      ).map((r) => Number(r.grandTotal))
      expect(asc[0]).toBeLessThan(asc.at(-1)!)

      const desc = (
        (await body(await listQuotations(req(`/api/quotations?q=${marker}&sort=-grandTotal`))))
          .data as unknown as Array<{ grandTotal: string }>
      ).map((r) => Number(r.grandTotal))
      expect(desc[0]).toBeGreaterThan(desc.at(-1)!)
    })

    it('excludes withdrawn quotations unless asked for them', async () => {
      const marker = uniq().toUpperCase()
      const q = await create({ quotationNumber: `QT-DEL-${marker}` })
      await deleteQuotation(
        req(`/api/quotations/${q.id}`, {
          method: 'DELETE',
          headers: { 'if-match': `W/"v${q.version}"` },
        }),
        params(q.id),
      )
      expect(
        (await body(await listQuotations(req(`/api/quotations?q=${marker}`)))).data,
      ).toHaveLength(0)
      expect(
        (await body(await listQuotations(req(`/api/quotations?q=${marker}&includeDeleted=true`))))
          .data,
      ).toHaveLength(1)
    })

    it('finds quotations raised against an RFQ', async () => {
      const rfq = await prisma.rFQ.create({
        data: {
          organizationId: authState.organizationId,
          rfqNumber: `RFQ-${uniq().toUpperCase()}`,
          type: 'BUYER',
          buyerId: accountId,
          title: `Src ${uniq()}`,
          createdById: authState.userId,
        },
      })
      const q = await create({ primaryRfqId: rfq.id })
      const b = await body(await listQuotations(req(`/api/quotations?rfqId=${rfq.id}`)))
      expect((b.data as unknown as Array<{ id: string }>).some((r) => r.id === q.id)).toBe(true)
    })
  })
})
