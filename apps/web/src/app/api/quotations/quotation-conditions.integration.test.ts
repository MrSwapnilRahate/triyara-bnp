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
const { POST: replaceItems } = await import('./[id]/items/route')
const { GET: getConditions, PUT: setConditions } = await import('./[id]/conditions/route')
const { GET: listApprovals, POST: decide } = await import('./[id]/approvals/route')
const { GET: listRevisions } = await import('./[id]/revisions/route')
const { POST: revise } = await import('./[id]/revise/route')
const { GET: getChain } = await import('./[id]/chain/route')

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

describe.skipIf(!process.env.DATABASE_URL)(
  'quotation conditions consistency (integration, real PostgreSQL)',
  () => {
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

    // Fixtures are namespaced to this file. Vitest runs test files in parallel,
    // and `upsert` is a select-then-insert: two files seeding the same slug both
    // find nothing on an empty database, both insert, and one dies on the unique
    // constraint. It only passes on a database a previous run already populated,
    // which is why this survived until CI started from a clean one.
    beforeAll(async () => {
      const org = await prisma.organization.upsert({
        where: { slug: 'quote-conditions-itest' },
        update: {},
        create: { name: 'Quotation Conditions IT', slug: 'quote-conditions-itest' },
      })
      authState.organizationId = org.id
      const user = await prisma.user.upsert({
        where: { email: 'quote-conditions@triyara.test' },
        update: {},
        create: {
          organizationId: org.id,
          email: 'quote-conditions@triyara.test',
          name: 'Conditions IT',
          passwordHash: 'x',
        },
      })
      authState.userId = user.id

      const other = await prisma.organization.upsert({
        where: { slug: 'quote-conditions-itest-other' },
        update: {},
        create: { name: 'Other Tenant', slug: 'quote-conditions-itest-other' },
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
        where: { organizationId_slug: { organizationId: org.id, slug: 'quote-conditions-cat' } },
        update: {},
        create: {
          organizationId: org.id,
          name: 'IT Cat',
          slug: 'quote-conditions-cat',
          path: '/quote-conditions-cat',
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

    describe('stored conditions agree with stored totals', () => {
      /**
       * The invariant: a stored tax or charge row must state the figure that
       * actually went into the header totals. A row saying 0 beside a header
       * saying 6923.60 is not a rounding difference - it is the document
       * contradicting itself, and there is no way for a reader to tell which
       * number is the real one.
       */
      const sum = (rows: Array<{ amount: string }>) =>
        Number(rows.reduce((n, r) => n + Number(r.amount), 0).toFixed(4))

      /**
       * Reads the rows and the stored header totals from the quotation itself.
       * The totals come from GET /:id rather than the conditions meta, because
       * the quotation record is the authoritative statement of what was stored -
       * and asserting against the same response that produced the rows would not
       * prove they reconcile.
       */
      async function conditionsOf(id: string) {
        const [conds, quotation] = await Promise.all([
          getConditions(req(`/api/quotations/${id}/conditions`), params(id)),
          getQuotation(req(`/api/quotations/${id}`), params(id)),
        ])
        const payload = await body(conds)
        const record = (await body(quotation)).data as unknown as {
          subtotal: string
          chargesTotal: string
          taxTotal: string
          grandTotal: string
        }
        return {
          totals: record,
          ...(payload.data as unknown as {
            charges: Array<{ amount: string; basis: string }>
            taxes: Array<{ amount: string; taxableAmount: string; ratePercent: string }>
          }),
        }
      }

      it('writes back the tax amount it computed, not the one submitted', async () => {
        const q = await create()
        await setConditions(
          req(`/api/quotations/${q.id}/conditions`, {
            method: 'PUT',
            headers: { 'if-match': `W/"v${q.version}"` },
            body: JSON.stringify({
              charges: [{ type: 'FREIGHT', amount: 150, currency: 'USD' }],
              // Deliberately wrong: the caller claims zero tax on a 5% rate.
              taxes: [
                { type: 'GST', ratePercent: 5, taxableAmount: 0, amount: 0, currency: 'USD' },
              ],
            }),
          }),
          params(q.id),
        )

        const after = await conditionsOf(q.id)
        // 5% of (1000 subtotal + 150 charges) = 57.50.
        expect(Number(after.taxes[0]!.amount)).toBe(57.5)
        expect(Number(after.taxes[0]!.taxableAmount)).toBe(1150)
        // And the row reconciles with the header.
        expect(sum(after.taxes)).toBe(Number(after.totals.taxTotal))
      })

      it('writes back a percentage charge at its computed amount', async () => {
        const q = await create()
        await setConditions(
          req(`/api/quotations/${q.id}/conditions`, {
            method: 'PUT',
            headers: { 'if-match': `W/"v${q.version}"` },
            body: JSON.stringify({
              charges: [
                // 2% of the 1000 subtotal = 20, whatever `amount` claims.
                {
                  type: 'INSURANCE',
                  basis: 'PERCENTAGE',
                  rate: 2,
                  amount: 0,
                  currency: 'USD',
                },
              ],
              taxes: [],
            }),
          }),
          params(q.id),
        )

        const after = await conditionsOf(q.id)
        expect(Number(after.charges[0]!.amount)).toBe(20)
        expect(sum(after.charges)).toBe(Number(after.totals.chargesTotal))
      })

      it('keeps rows correct when several taxes compound in sequence', async () => {
        const q = await create()
        await setConditions(
          req(`/api/quotations/${q.id}/conditions`, {
            method: 'PUT',
            headers: { 'if-match': `W/"v${q.version}"` },
            body: JSON.stringify({
              charges: [],
              taxes: [
                {
                  type: 'GST',
                  ratePercent: 10,
                  amount: 0,
                  taxableAmount: 0,
                  currency: 'USD',
                  sequence: 0,
                },
                {
                  type: 'CESS',
                  ratePercent: 5,
                  amount: 0,
                  taxableAmount: 0,
                  currency: 'USD',
                  sequence: 1,
                  isCompound: true,
                },
              ],
            }),
          }),
          params(q.id),
        )

        const after = await conditionsOf(q.id)
        // Sequence matters: the second is levied on a base including the first,
        // so pairing resolved figures back to rows must not shuffle them.
        const gst = after.taxes.find((t) => Number(t.ratePercent) === 10)!
        const cess = after.taxes.find((t) => Number(t.ratePercent) === 5)!
        expect(Number(gst.amount)).toBe(100)
        expect(Number(cess.amount)).toBe(55)
        expect(sum(after.taxes)).toBe(Number(after.totals.taxTotal))
      })

      it('records a reverse-charge tax without adding it to the header', async () => {
        const q = await create()
        await setConditions(
          req(`/api/quotations/${q.id}/conditions`, {
            method: 'PUT',
            headers: { 'if-match': `W/"v${q.version}"` },
            body: JSON.stringify({
              charges: [],
              taxes: [
                {
                  type: 'VAT',
                  ratePercent: 20,
                  amount: 0,
                  taxableAmount: 0,
                  currency: 'USD',
                  isReverseCharge: true,
                },
              ],
            }),
          }),
          params(q.id),
        )

        const after = await conditionsOf(q.id)
        // The liability is the buyer's: stated on the row, excluded from the total.
        expect(Number(after.taxes[0]!.amount)).toBe(200)
        expect(Number(after.totals.taxTotal)).toBe(0)
      })

      it('keeps rows correct after the lines are replaced under them', async () => {
        const q = await create()
        const set = await setConditions(
          req(`/api/quotations/${q.id}/conditions`, {
            method: 'PUT',
            headers: { 'if-match': `W/"v${q.version}"` },
            body: JSON.stringify({
              charges: [],
              taxes: [
                { type: 'GST', ratePercent: 10, amount: 0, taxableAmount: 0, currency: 'USD' },
              ],
            }),
          }),
          params(q.id),
        )
        const version = Number(set.headers.get('etag')!.match(/v(\d+)/)![1])

        // Doubling the lines doubles the taxable base.
        await replaceItems(
          req(`/api/quotations/${q.id}/items`, {
            method: 'POST',
            headers: { 'if-match': `W/"v${version}"` },
            body: JSON.stringify({
              items: [{ productId, quantity: 20, unit: 'MT', unitPrice: 100, unitCost: 80 }],
            }),
          }),
          params(q.id),
        )

        const after = await conditionsOf(q.id)
        expect(Number(after.totals.subtotal)).toBe(2000)
        expect(Number(after.taxes[0]!.amount)).toBe(200)
        expect(sum(after.taxes)).toBe(Number(after.totals.taxTotal))
      })
    })
  },
)
