// @vitest-environment node
import { randomUUID } from 'node:crypto'

import { buildAbilityFor, type Role } from '@triyara/auth'
import { prisma } from '@triyara/db'
import { beforeAll, describe, expect, it, vi } from 'vitest'

// Full-stack API integration: route handler -> service -> repository -> real
// PostgreSQL. Only the auth context is mocked; nothing else is stubbed, so this
// exercises authorization, org isolation, the workflow table, optimistic
// locking and audit for real.

const authState = { roles: ['ADMIN'] as Role[], organizationId: '', userId: '' }

vi.mock('@/auth/context', () => ({
  requireAuth: vi.fn(async () => {
    const user = {
      id: authState.userId,
      organizationId: authState.organizationId,
      email: 'rfq-api@triyara.test',
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

const { GET: listRfqs, POST: createRfq } = await import('./route')
const { GET: getRfq, PATCH: patchRfq, DELETE: deleteRfq } = await import('./[id]/route')
const { GET: listItems, POST: replaceItems } = await import('./[id]/items/route')
const { GET: listResponses, POST: submitResponse } = await import('./[id]/responses/route')
const { POST: publishRfq } = await import('./[id]/publish/route')
const { POST: closeRfq } = await import('./[id]/close/route')
const { POST: reopenRfq } = await import('./[id]/reopen/route')

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
const num = () => `RFQ-IT-${uniq().toUpperCase()}`

describe.skipIf(!process.env.DATABASE_URL)('RFQ API (integration, real PostgreSQL)', () => {
  let otherOrgId = ''
  let accountId = ''
  let productId = ''
  let supplierId = ''
  let supplierId2 = ''

  const newRfq = (over: Record<string, unknown> = {}) => ({
    rfqNumber: num(),
    type: 'BUYER',
    buyerId: accountId,
    title: `IT RFQ ${uniq()}`,
    currency: 'USD',
    destinationCountry: 'AE',
    destinationPort: 'Jebel Ali',
    items: [{ productId, quantity: 10, unit: 'MT', requiredCertifications: [] }],
    ...over,
  })

  async function create(over: Record<string, unknown> = {}) {
    const res = await createRfq(
      req('/api/rfqs', { method: 'POST', body: JSON.stringify(newRfq(over)) }),
    )
    expect(res.status).toBe(201)
    return (await body(res)).data as unknown as {
      id: string
      version: number
      rfqNumber: string
      status: string
      items: Array<{ id: string }>
    }
  }

  /** Walks an RFQ to ISSUED so bids can be submitted against it. */
  async function issued() {
    const rfq = await create()
    await prisma.rFQSupplier.create({
      data: {
        rfqId: rfq.id,
        organizationId: authState.organizationId,
        supplierId,
        status: 'INVITED',
        invitedById: authState.userId,
      },
    })
    let v = rfq.version
    for (const status of ['PENDING_APPROVAL', 'APPROVED'] as const) {
      const updated = await prisma.rFQ.update({
        where: { id: rfq.id },
        data: { status, version: { increment: 1 } },
      })
      v = updated.version
    }
    const res = await publishRfq(
      req(`/api/rfqs/${rfq.id}/publish`, {
        method: 'POST',
        headers: { 'if-match': `W/"v${v}"` },
      }),
      params(rfq.id),
    )
    expect(res.status).toBe(200)
    const after = (await body(res)).data as unknown as { version: number; status: string }
    const participation = await prisma.rFQSupplier.findFirstOrThrow({ where: { rfqId: rfq.id } })
    return {
      ...rfq,
      version: after.version,
      status: after.status,
      participationId: participation.id,
    }
  }

  beforeAll(async () => {
    const org = await prisma.organization.upsert({
      where: { slug: 'rfq-api-itest' },
      update: {},
      create: { name: 'RFQ API IT', slug: 'rfq-api-itest' },
    })
    authState.organizationId = org.id
    const user = await prisma.user.upsert({
      where: { email: 'rfq-api@triyara.test' },
      update: {},
      create: {
        organizationId: org.id,
        email: 'rfq-api@triyara.test',
        name: 'API IT',
        passwordHash: 'x',
      },
    })
    authState.userId = user.id

    const other = await prisma.organization.upsert({
      where: { slug: 'rfq-api-itest-other' },
      update: {},
      create: { name: 'Other Tenant', slug: 'rfq-api-itest-other' },
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
      where: { organizationId_slug: { organizationId: org.id, slug: 'rfq-api-cat' } },
      update: {},
      create: {
        organizationId: org.id,
        name: 'IT Cat',
        slug: 'rfq-api-cat',
        path: '/rfq-api-cat',
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

    for (const label of ['S1', 'S2']) {
      const s = await prisma.supplier.create({
        data: {
          organizationId: org.id,
          supplierCode: `S-${uniq().toUpperCase()}`,
          companyName: `${label} ${uniq()}`,
          legalName: label,
          businessType: 'TRADER',
          createdById: user.id,
        },
      })
      if (label === 'S1') supplierId = s.id
      else supplierId2 = s.id
    }
  })

  describe('lifecycle', () => {
    it('creates an RFQ in DRAFT with its lines and revision 1', async () => {
      const rfq = await create()
      expect(rfq.status).toBe('DRAFT')
      expect(rfq.items).toHaveLength(1)

      const res = await getRfq(req(`/api/rfqs/${rfq.id}`), params(rfq.id))
      expect(res.status).toBe(200)
      expect(res.headers.get('ETag')).toBe(`W/"v${rfq.version}"`)
    })

    it('rejects a BUYER RFQ with no buyerId', async () => {
      const res = await createRfq(
        req('/api/rfqs', {
          method: 'POST',
          body: JSON.stringify({ ...newRfq(), buyerId: undefined }),
        }),
      )
      expect(res.status).toBe(422)
    })

    it('rejects an INTERNAL RFQ that carries a buyer', async () => {
      const res = await createRfq(
        req('/api/rfqs', {
          method: 'POST',
          body: JSON.stringify({ ...newRfq(), type: 'INTERNAL' }),
        }),
      )
      expect(res.status).toBe(422)
    })

    it('rejects a duplicate RFQ number with 409', async () => {
      const rfq = await create()
      const res = await createRfq(
        req('/api/rfqs', {
          method: 'POST',
          body: JSON.stringify(newRfq({ rfqNumber: rfq.rfqNumber })),
        }),
      )
      expect(res.status).toBe(409)
    })

    it('rejects a deadline after the expected shipment date', async () => {
      const res = await createRfq(
        req('/api/rfqs', {
          method: 'POST',
          body: JSON.stringify(
            newRfq({
              quotationDeadline: '2026-09-01T00:00:00.000Z',
              expectedShipmentDate: '2026-08-01T00:00:00.000Z',
            }),
          ),
        }),
      )
      expect(res.status).toBe(422)
    })

    it('soft-deletes and then hides the RFQ from reads', async () => {
      const rfq = await create()
      const del = await deleteRfq(
        req(`/api/rfqs/${rfq.id}`, {
          method: 'DELETE',
          headers: { 'if-match': `W/"v${rfq.version}"` },
        }),
        params(rfq.id),
      )
      expect(del.status).toBe(200)
      expect((await getRfq(req(`/api/rfqs/${rfq.id}`), params(rfq.id))).status).toBe(404)
    })
  })

  describe('workflow transitions', () => {
    it('refuses to publish an RFQ that is not APPROVED', async () => {
      const rfq = await create()
      const res = await publishRfq(
        req(`/api/rfqs/${rfq.id}/publish`, {
          method: 'POST',
          headers: { 'if-match': `W/"v${rfq.version}"` },
        }),
        params(rfq.id),
      )
      expect(res.status).toBe(409)
    })

    it('refuses to publish an APPROVED RFQ with no invited suppliers', async () => {
      const rfq = await create()
      const updated = await prisma.rFQ.update({
        where: { id: rfq.id },
        data: { status: 'APPROVED', version: { increment: 1 } },
      })
      const res = await publishRfq(
        req(`/api/rfqs/${rfq.id}/publish`, {
          method: 'POST',
          headers: { 'if-match': `W/"v${updated.version}"` },
        }),
        params(rfq.id),
      )
      expect(res.status).toBe(409)
    })

    it('publishes an APPROVED RFQ that has invited suppliers', async () => {
      const rfq = await issued()
      expect(rfq.status).toBe('ISSUED')
    })

    it('refuses to close an RFQ that has not reached a closable state', async () => {
      const rfq = await create()
      const res = await closeRfq(
        req(`/api/rfqs/${rfq.id}/close`, {
          method: 'POST',
          headers: { 'if-match': `W/"v${rfq.version}"` },
        }),
        params(rfq.id),
      )
      expect(res.status).toBe(409)
      expect((await body(res)).errors?.[0]?.message).toMatch(/cannot be closed/)
    })

    it('closes an AWARDED RFQ', async () => {
      const rfq = await create()
      const updated = await prisma.rFQ.update({
        where: { id: rfq.id },
        data: { status: 'AWARDED', version: { increment: 1 } },
      })
      const res = await closeRfq(
        req(`/api/rfqs/${rfq.id}/close`, {
          method: 'POST',
          headers: { 'if-match': `W/"v${updated.version}"` },
        }),
        params(rfq.id),
      )
      expect(res.status).toBe(200)
      expect((await body(res)).meta.status).toBe('CLOSED')
    })

    it('records the close on the approval history', async () => {
      const rfq = await create()
      const updated = await prisma.rFQ.update({
        where: { id: rfq.id },
        data: { status: 'AWARDED', version: { increment: 1 } },
      })
      await closeRfq(
        req(`/api/rfqs/${rfq.id}/close`, {
          method: 'POST',
          headers: { 'if-match': `W/"v${updated.version}"` },
        }),
        params(rfq.id),
      )
      const approvals = await prisma.rFQApproval.findMany({
        where: { rfqId: rfq.id },
        orderBy: { createdAt: 'asc' },
      })
      expect(approvals.at(-1)!.comments).toMatch(/closed/i)
    })

    it('reopens a CANCELLED RFQ back to DRAFT', async () => {
      const rfq = await create()
      const updated = await prisma.rFQ.update({
        where: { id: rfq.id },
        data: { status: 'CANCELLED', version: { increment: 1 } },
      })
      const res = await reopenRfq(
        req(`/api/rfqs/${rfq.id}/reopen`, {
          method: 'POST',
          headers: { 'if-match': `W/"v${updated.version}"` },
        }),
        params(rfq.id),
      )
      expect(res.status).toBe(200)
      expect((await body(res)).meta.status).toBe('DRAFT')
    })

    it('refuses to reopen a CLOSED RFQ - CLOSED is terminal', async () => {
      const rfq = await create()
      const updated = await prisma.rFQ.update({
        where: { id: rfq.id },
        data: { status: 'CLOSED', version: { increment: 1 } },
      })
      const res = await reopenRfq(
        req(`/api/rfqs/${rfq.id}/reopen`, {
          method: 'POST',
          headers: { 'if-match': `W/"v${updated.version}"` },
        }),
        params(rfq.id),
      )
      expect(res.status).toBe(409)
    })

    it('freezes commercial terms once ISSUED', async () => {
      const rfq = await issued()
      const res = await patchRfq(
        req(`/api/rfqs/${rfq.id}`, {
          method: 'PATCH',
          headers: { 'if-match': `W/"v${rfq.version}"` },
          body: JSON.stringify({ currency: 'EUR' }),
        }),
        params(rfq.id),
      )
      expect(res.status).toBe(409)
    })

    it('still allows a non-term edit after ISSUED', async () => {
      const rfq = await issued()
      const res = await patchRfq(
        req(`/api/rfqs/${rfq.id}`, {
          method: 'PATCH',
          headers: { 'if-match': `W/"v${rfq.version}"` },
          body: JSON.stringify({ description: 'Clarified packing.' }),
        }),
        params(rfq.id),
      )
      expect(res.status).toBe(200)
    })
  })

  describe('optimistic concurrency', () => {
    it('refuses a second write reusing a stale version and does not apply it', async () => {
      const rfq = await create()
      const stale = `W/"v${rfq.version}"`
      await patchRfq(
        req(`/api/rfqs/${rfq.id}`, {
          method: 'PATCH',
          headers: { 'if-match': stale },
          body: JSON.stringify({ title: 'First' }),
        }),
        params(rfq.id),
      )
      const second = await patchRfq(
        req(`/api/rfqs/${rfq.id}`, {
          method: 'PATCH',
          headers: { 'if-match': stale },
          body: JSON.stringify({ title: 'Second' }),
        }),
        params(rfq.id),
      )
      expect(second.status).toBe(412)
      const row = await prisma.rFQ.findUniqueOrThrow({ where: { id: rfq.id } })
      expect(row.title).toBe('First')
    })

    it('guards workflow moves with If-Match too', async () => {
      const rfq = await create()
      const updated = await prisma.rFQ.update({
        where: { id: rfq.id },
        data: { status: 'AWARDED', version: { increment: 1 } },
      })
      const stale = await closeRfq(
        req(`/api/rfqs/${rfq.id}/close`, {
          method: 'POST',
          headers: { 'if-match': `W/"v${updated.version - 1}"` },
        }),
        params(rfq.id),
      )
      expect(stale.status).toBe(412)
    })

    it('answers 428 when If-Match is absent on a workflow move', async () => {
      const rfq = await create()
      const res = await publishRfq(
        req(`/api/rfqs/${rfq.id}/publish`, { method: 'POST' }),
        params(rfq.id),
      )
      expect(res.status).toBe(428)
    })
  })

  describe('authorization', () => {
    it('lets a READ_ONLY actor list RFQs', async () => {
      authState.roles = ['READ_ONLY']
      const res = await listRfqs(req('/api/rfqs?limit=1'))
      authState.roles = ['ADMIN']
      expect(res.status).toBe(200)
    })

    it('refuses creation to a READ_ONLY actor', async () => {
      authState.roles = ['READ_ONLY']
      const res = await createRfq(
        req('/api/rfqs', { method: 'POST', body: JSON.stringify(newRfq()) }),
      )
      authState.roles = ['ADMIN']
      expect(res.status).toBe(403)
    })

    it('lets an EXPORT_MANAGER create and publish', async () => {
      const rfq = await create()
      await prisma.rFQSupplier.create({
        data: {
          rfqId: rfq.id,
          organizationId: authState.organizationId,
          supplierId,
          status: 'INVITED',
          invitedById: authState.userId,
        },
      })
      const updated = await prisma.rFQ.update({
        where: { id: rfq.id },
        data: { status: 'APPROVED', version: { increment: 1 } },
      })
      authState.roles = ['EXPORT_MANAGER']
      const res = await publishRfq(
        req(`/api/rfqs/${rfq.id}/publish`, {
          method: 'POST',
          headers: { 'if-match': `W/"v${updated.version}"` },
        }),
        params(rfq.id),
      )
      authState.roles = ['ADMIN']
      expect(res.status).toBe(200)
    })

    it('refuses reopen to an EXPORT_MANAGER - it needs manage', async () => {
      const rfq = await create()
      const updated = await prisma.rFQ.update({
        where: { id: rfq.id },
        data: { status: 'CANCELLED', version: { increment: 1 } },
      })
      authState.roles = ['EXPORT_MANAGER']
      const res = await reopenRfq(
        req(`/api/rfqs/${rfq.id}/reopen`, {
          method: 'POST',
          headers: { 'if-match': `W/"v${updated.version}"` },
        }),
        params(rfq.id),
      )
      authState.roles = ['ADMIN']
      expect(res.status).toBe(403)
    })

    it('refuses deletion to a VERIFIER', async () => {
      const rfq = await create()
      authState.roles = ['VERIFIER']
      const res = await deleteRfq(
        req(`/api/rfqs/${rfq.id}`, {
          method: 'DELETE',
          headers: { 'if-match': `W/"v${rfq.version}"` },
        }),
        params(rfq.id),
      )
      authState.roles = ['ADMIN']
      expect(res.status).toBe(403)
    })
  })

  describe('organization isolation', () => {
    const foreignRfq = async () =>
      prisma.rFQ.create({
        data: {
          organizationId: otherOrgId,
          rfqNumber: num(),
          type: 'INTERNAL',
          title: `Foreign ${uniq()}`,
          createdById: authState.userId,
        },
      })

    it('reports another tenant’s RFQ as 404, never 403', async () => {
      const foreign = await foreignRfq()
      expect((await getRfq(req(`/api/rfqs/${foreign.id}`), params(foreign.id))).status).toBe(404)
    })

    it('excludes another tenant’s RFQs from the list', async () => {
      const marker = uniq()
      await prisma.rFQ.create({
        data: {
          organizationId: otherOrgId,
          rfqNumber: num(),
          type: 'INTERNAL',
          title: `Foreign ${marker}`,
          createdById: authState.userId,
        },
      })
      expect((await body(await listRfqs(req(`/api/rfqs?q=${marker}`)))).data).toHaveLength(0)
    })

    it('refuses to update another tenant’s RFQ and leaves it untouched', async () => {
      const foreign = await foreignRfq()
      const res = await patchRfq(
        req(`/api/rfqs/${foreign.id}`, {
          method: 'PATCH',
          headers: { 'if-match': 'W/"v1"' },
          body: JSON.stringify({ title: 'Hijacked' }),
        }),
        params(foreign.id),
      )
      expect(res.status).toBe(404)
      const row = await prisma.rFQ.findUniqueOrThrow({ where: { id: foreign.id } })
      expect(row.title).not.toBe('Hijacked')
    })

    it('refuses a workflow move on another tenant’s RFQ', async () => {
      const foreign = await foreignRfq()
      const res = await closeRfq(
        req(`/api/rfqs/${foreign.id}/close`, {
          method: 'POST',
          headers: { 'if-match': 'W/"v1"' },
        }),
        params(foreign.id),
      )
      expect(res.status).toBe(404)
    })

    it('refuses to read another tenant’s responses', async () => {
      const foreign = await foreignRfq()
      const res = await listResponses(req(`/api/rfqs/${foreign.id}/responses`), params(foreign.id))
      expect(res.status).toBe(404)
    })
  })

  describe('items', () => {
    it('lists the lines with RFQ context', async () => {
      const rfq = await create()
      const b = await body(await listItems(req(`/api/rfqs/${rfq.id}/items`), params(rfq.id)))
      expect(b.data).toHaveLength(1)
      expect(b.meta).toMatchObject({ rfqId: rfq.id, count: 1 })
    })

    it('replaces the line set and cuts a new revision', async () => {
      const rfq = await create()
      const res = await replaceItems(
        req(`/api/rfqs/${rfq.id}/items`, {
          method: 'POST',
          headers: { 'if-match': `W/"v${rfq.version}"` },
          body: JSON.stringify({
            items: [
              { productId, quantity: 20, unit: 'MT', requiredCertifications: [] },
              {
                customProductName: `Custom ${uniq()}`,
                quantity: 5,
                unit: 'MT',
                requiredCertifications: [],
              },
            ],
            reason: 'Buyer raised quantities.',
          }),
        }),
        params(rfq.id),
      )
      const b = await body(res)
      expect(res.status).toBe(201)
      expect(b.data).toHaveLength(2)
      expect(b.meta.revision).toBe(2)

      const revisions = await prisma.rFQRevision.findMany({ where: { rfqId: rfq.id } })
      expect(revisions.some((r) => r.reason === 'Buyer raised quantities.')).toBe(true)
    })

    it('rejects a line that is neither a catalog product nor a named custom item', async () => {
      const rfq = await create()
      const res = await replaceItems(
        req(`/api/rfqs/${rfq.id}/items`, {
          method: 'POST',
          headers: { 'if-match': `W/"v${rfq.version}"` },
          body: JSON.stringify({
            items: [{ quantity: 1, unit: 'MT', requiredCertifications: [] }],
          }),
        }),
        params(rfq.id),
      )
      expect(res.status).toBe(422)
    })
  })

  describe('responses', () => {
    it('accepts a bid and lists it under the RFQ', async () => {
      const rfq = await issued()
      const submit = await submitResponse(
        req(`/api/rfqs/${rfq.id}/responses`, {
          method: 'POST',
          body: JSON.stringify({
            rfqSupplierId: rfq.participationId,
            quotationCurrency: 'USD',
            lines: [{ rfqItemId: rfq.items[0]!.id, price: 1200, currency: 'USD' }],
          }),
        }),
        params(rfq.id),
      )
      expect(submit.status).toBe(201)

      const listed = await body(
        await listResponses(req(`/api/rfqs/${rfq.id}/responses`), params(rfq.id)),
      )
      expect(listed.data).toHaveLength(1)
      expect(listed.meta.rfqId).toBe(rfq.id)
    })

    it('supersedes an earlier bid on re-submission', async () => {
      const rfq = await issued()
      const line = { rfqItemId: rfq.items[0]!.id, currency: 'USD' }
      for (const price of [1200, 1100]) {
        const res = await submitResponse(
          req(`/api/rfqs/${rfq.id}/responses`, {
            method: 'POST',
            body: JSON.stringify({
              rfqSupplierId: rfq.participationId,
              lines: [{ ...line, price }],
            }),
          }),
          params(rfq.id),
        )
        expect(res.status).toBe(201)
      }
      const current = await body(
        await listResponses(req(`/api/rfqs/${rfq.id}/responses`), params(rfq.id)),
      )
      expect(current.data).toHaveLength(1)
      expect(Number((current.data as unknown as Array<{ price: string }>)[0]!.price)).toBe(1100)

      const all = await body(
        await listResponses(req(`/api/rfqs/${rfq.id}/responses?currentOnly=false`), params(rfq.id)),
      )
      expect(all.data).toHaveLength(2)
    })

    it('refuses a bid using a participation from another RFQ', async () => {
      const a = await issued()
      const b = await issued()
      const res = await submitResponse(
        req(`/api/rfqs/${a.id}/responses`, {
          method: 'POST',
          body: JSON.stringify({
            rfqSupplierId: b.participationId,
            lines: [{ rfqItemId: a.items[0]!.id, price: 1, currency: 'USD' }],
          }),
        }),
        params(a.id),
      )
      expect(res.status).toBe(404)
    })

    it('refuses a bid while the RFQ is still DRAFT', async () => {
      const rfq = await create()
      const participation = await prisma.rFQSupplier.create({
        data: {
          rfqId: rfq.id,
          organizationId: authState.organizationId,
          supplierId: supplierId2,
          status: 'INVITED',
          invitedById: authState.userId,
        },
      })
      const res = await submitResponse(
        req(`/api/rfqs/${rfq.id}/responses`, {
          method: 'POST',
          body: JSON.stringify({
            rfqSupplierId: participation.id,
            lines: [{ rfqItemId: rfq.items[0]!.id, price: 100, currency: 'USD' }],
          }),
        }),
        params(rfq.id),
      )
      expect(res.status).toBe(409)
    })

    it('rejects the same line quoted twice in one submission', async () => {
      const rfq = await issued()
      const res = await submitResponse(
        req(`/api/rfqs/${rfq.id}/responses`, {
          method: 'POST',
          body: JSON.stringify({
            rfqSupplierId: rfq.participationId,
            lines: [
              { rfqItemId: rfq.items[0]!.id, price: 100, currency: 'USD' },
              { rfqItemId: rfq.items[0]!.id, price: 90, currency: 'USD' },
            ],
          }),
        }),
        params(rfq.id),
      )
      expect(res.status).toBe(422)
    })
  })

  describe('audit logging', () => {
    it('writes an audit entry carrying the caller request id', async () => {
      const requestId = `req-${uniq()}`
      const res = await createRfq(
        req('/api/rfqs', {
          method: 'POST',
          headers: { 'x-request-id': requestId },
          body: JSON.stringify(newRfq()),
        }),
      )
      const created = (await body(res)).data as unknown as { id: string }
      const entries = await prisma.auditLog.findMany({
        where: { organizationId: authState.organizationId, entityId: created.id },
        select: { action: true, actorId: true, requestId: true },
      })
      expect(entries.map((e) => e.action)).toContain('rfq.created')
      expect(entries[0]!.actorId).toBe(authState.userId)
      expect(entries[0]!.requestId).toBe(requestId)
    })

    it('audits a workflow move distinctly from the create', async () => {
      const rfq = await create()
      const updated = await prisma.rFQ.update({
        where: { id: rfq.id },
        data: { status: 'AWARDED', version: { increment: 1 } },
      })
      await closeRfq(
        req(`/api/rfqs/${rfq.id}/close`, {
          method: 'POST',
          headers: { 'if-match': `W/"v${updated.version}"` },
        }),
        params(rfq.id),
      )
      const actions = await prisma.auditLog.findMany({
        where: { organizationId: authState.organizationId, entityId: rfq.id },
        orderBy: { createdAt: 'asc' },
        select: { action: true },
      })
      expect(actions.length).toBeGreaterThanOrEqual(2)
      expect(actions[0]!.action).toBe('rfq.created')
    })
  })

  describe('pagination, filtering and sorting', () => {
    it('pages by cursor without repeating a row', async () => {
      const marker = uniq().toUpperCase()
      for (let i = 0; i < 3; i += 1) await create({ title: `PG ${marker} ${i}` })

      const first = await body(await listRfqs(req(`/api/rfqs?q=${marker}&limit=2`)))
      expect(first.data).toHaveLength(2)
      expect(first.meta.pagination?.nextCursor).toBeTruthy()

      const second = await body(
        await listRfqs(
          req(`/api/rfqs?q=${marker}&limit=2&cursor=${first.meta.pagination!.nextCursor}`),
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

    it('returns a null cursor on the last page', async () => {
      const marker = uniq().toUpperCase()
      await create({ title: `Solo ${marker}` })
      const b = await body(await listRfqs(req(`/api/rfqs?q=${marker}&limit=25`)))
      expect(b.data).toHaveLength(1)
      expect(b.meta.pagination?.nextCursor).toBeNull()
    })

    it('filters by status', async () => {
      const marker = uniq().toUpperCase()
      await create({ title: `Filt ${marker}` })
      expect(
        (await body(await listRfqs(req(`/api/rfqs?q=${marker}&status=DRAFT`)))).data,
      ).toHaveLength(1)
      expect(
        (await body(await listRfqs(req(`/api/rfqs?q=${marker}&status=CLOSED`)))).data,
      ).toHaveLength(0)
    })

    it('sorts by rfqNumber in both directions', async () => {
      const marker = uniq().toUpperCase()
      await create({ rfqNumber: `RFQ-AAA-${marker}`, title: `Sort ${marker}` })
      await create({ rfqNumber: `RFQ-ZZZ-${marker}`, title: `Sort ${marker}` })
      const asc = (
        (await body(await listRfqs(req(`/api/rfqs?q=${marker}&sort=rfqNumber`))))
          .data as unknown as Array<{ rfqNumber: string }>
      ).map((r) => r.rfqNumber)
      expect(asc[0]).toContain('AAA')
      const desc = (
        (await body(await listRfqs(req(`/api/rfqs?q=${marker}&sort=-rfqNumber`))))
          .data as unknown as Array<{ rfqNumber: string }>
      ).map((r) => r.rfqNumber)
      expect(desc[0]).toContain('ZZZ')
    })

    it('excludes soft-deleted RFQs unless asked for them', async () => {
      const marker = uniq().toUpperCase()
      const rfq = await create({ title: `Del ${marker}` })
      await deleteRfq(
        req(`/api/rfqs/${rfq.id}`, {
          method: 'DELETE',
          headers: { 'if-match': `W/"v${rfq.version}"` },
        }),
        params(rfq.id),
      )
      expect((await body(await listRfqs(req(`/api/rfqs?q=${marker}`)))).data).toHaveLength(0)
      expect(
        (await body(await listRfqs(req(`/api/rfqs?q=${marker}&includeDeleted=true`)))).data,
      ).toHaveLength(1)
    })

    it('finds RFQs a given supplier was invited to', async () => {
      const rfq = await issued()
      const b = await body(await listRfqs(req(`/api/rfqs?supplierId=${supplierId}&limit=100`)))
      expect((b.data as unknown as Array<{ id: string }>).some((r) => r.id === rfq.id)).toBe(true)
    })
  })
})
