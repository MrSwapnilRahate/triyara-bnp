// @vitest-environment node
import { randomUUID } from 'node:crypto'

import { buildAbilityFor, type Role } from '@triyara/auth'
import { prisma } from '@triyara/db'
import { beforeAll, describe, expect, it, vi } from 'vitest'

// Full-stack API integration: route handler -> service -> repository -> real
// PostgreSQL. Only the auth context is mocked; nothing else is stubbed, so this
// exercises authorization, org isolation, optimistic locking and audit for real.

const authState = { roles: ['ADMIN'] as Role[], organizationId: '', userId: '' }

vi.mock('@/auth/context', () => ({
  requireAuth: vi.fn(async () => {
    const user = {
      id: authState.userId,
      organizationId: authState.organizationId,
      email: 'supplier-api@triyara.test',
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

const { GET: listSuppliers, POST: createSupplier } = await import('./route')
const {
  GET: getSupplier,
  PATCH: patchSupplier,
  DELETE: deleteSupplier,
} = await import('./[id]/route')
const { GET: listProducts, POST: addProduct } = await import('./[id]/products/route')
const { GET: searchSuppliers } = await import('./search/route')
const { GET: listCountries } = await import('./countries/route')
const { GET: listCertifications } = await import('./certifications/route')

const req = (url: string, init?: RequestInit) => new Request(`http://t.test${url}`, init)
const params = (id: string) => ({ params: Promise.resolve({ id }) })
const body = async (res: Response) =>
  (await res.json()) as {
    success: boolean
    data: never
    meta: { requestId: string; pagination?: { nextCursor: string | null }; [k: string]: unknown }
    errors: Array<{ code: string; message: string }> | null
  }

// Full entropy: codes AND names must be unique across runs, not just within one.
const uniq = () => randomUUID().replace(/-/g, '').slice(0, 10)
const code = () => `SUP-IT-${uniq().toUpperCase()}`

const newSupplier = (over: Record<string, unknown> = {}) => ({
  supplierCode: code(),
  companyName: `IT Supplier ${uniq()}`,
  legalName: `IT Supplier ${uniq()} Pvt Ltd`,
  businessType: 'MANUFACTURER',
  country: 'IN',
  city: 'Kochi',
  ...over,
})

async function create(over: Record<string, unknown> = {}) {
  const res = await createSupplier(
    req('/api/suppliers', { method: 'POST', body: JSON.stringify(newSupplier(over)) }),
  )
  expect(res.status).toBe(201)
  return (await body(res)).data as unknown as { id: string; version: number; supplierCode: string }
}

describe.skipIf(!process.env.DATABASE_URL)('supplier API (integration, real PostgreSQL)', () => {
  let otherOrgId = ''
  let productId = ''

  beforeAll(async () => {
    const org = await prisma.organization.upsert({
      where: { slug: 'supplier-api-itest' },
      update: {},
      create: { name: 'Supplier API IT', slug: 'supplier-api-itest' },
    })
    authState.organizationId = org.id
    const user = await prisma.user.upsert({
      where: { email: 'supplier-api@triyara.test' },
      update: {},
      create: {
        organizationId: org.id,
        email: 'supplier-api@triyara.test',
        name: 'API IT',
        passwordHash: 'x',
      },
    })
    authState.userId = user.id

    const other = await prisma.organization.upsert({
      where: { slug: 'supplier-api-itest-other' },
      update: {},
      create: { name: 'Other Tenant', slug: 'supplier-api-itest-other' },
    })
    otherOrgId = other.id

    const cat = await prisma.category.upsert({
      where: { organizationId_slug: { organizationId: org.id, slug: 'sup-api-cat' } },
      update: {},
      create: {
        organizationId: org.id,
        name: 'IT Cat',
        slug: 'sup-api-cat',
        path: '/sup-api-cat',
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
    it('creates a supplier in DRAFT and returns it on read', async () => {
      const created = await create()
      const res = await getSupplier(req(`/api/suppliers/${created.id}`), params(created.id))
      const b = await body(res)
      expect(res.status).toBe(200)
      expect((b.data as unknown as { status: string }).status).toBe('DRAFT')
      expect(res.headers.get('ETag')).toBe(`W/"v${created.version}"`)
    })

    it('never returns a bank account number', async () => {
      const created = await create()
      await prisma.supplierBankAccount.create({
        data: {
          supplierId: created.id,
          organizationId: authState.organizationId,
          bankName: 'Test Bank',
          accountHolderName: 'IT',
          accountNumber: '1234567890',
          ifscCode: 'TEST0001',
          currency: 'INR',
        },
      })
      const res = await getSupplier(req(`/api/suppliers/${created.id}`), params(created.id))
      const raw = JSON.stringify((await body(res)).data)
      expect(raw).toContain('Test Bank')
      expect(raw).not.toContain('1234567890')
      expect(raw).not.toContain('accountNumber')
    })

    it('rejects a duplicate supplier code with 409', async () => {
      const created = await create()
      const res = await createSupplier(
        req('/api/suppliers', {
          method: 'POST',
          body: JSON.stringify(newSupplier({ supplierCode: created.supplierCode })),
        }),
      )
      expect(res.status).toBe(409)
      expect((await body(res)).success).toBe(false)
    })

    it('soft-deletes and then hides the supplier from reads', async () => {
      const created = await create()
      const del = await deleteSupplier(
        req(`/api/suppliers/${created.id}`, {
          method: 'DELETE',
          headers: { 'if-match': `W/"v${created.version}"` },
        }),
        params(created.id),
      )
      expect(del.status).toBe(200)

      const res = await getSupplier(req(`/api/suppliers/${created.id}`), params(created.id))
      expect(res.status).toBe(404)
    })
  })

  describe('optimistic concurrency', () => {
    it('applies a write carrying the current version', async () => {
      const created = await create()
      const res = await patchSupplier(
        req(`/api/suppliers/${created.id}`, {
          method: 'PATCH',
          headers: { 'if-match': `W/"v${created.version}"` },
          body: JSON.stringify({ city: 'Kochi Updated' }),
        }),
        params(created.id),
      )
      expect(res.status).toBe(200)
      expect(res.headers.get('ETag')).toBe(`W/"v${created.version + 1}"`)
    })

    it('refuses a second write reusing the stale version with 412', async () => {
      const created = await create()
      const stale = `W/"v${created.version}"`
      await patchSupplier(
        req(`/api/suppliers/${created.id}`, {
          method: 'PATCH',
          headers: { 'if-match': stale },
          body: JSON.stringify({ city: 'First' }),
        }),
        params(created.id),
      )
      const second = await patchSupplier(
        req(`/api/suppliers/${created.id}`, {
          method: 'PATCH',
          headers: { 'if-match': stale },
          body: JSON.stringify({ city: 'Second' }),
        }),
        params(created.id),
      )
      expect(second.status).toBe(412)

      // The losing write must not have landed.
      const row = await prisma.supplier.findUniqueOrThrow({ where: { id: created.id } })
      expect(row.city).toBe('First')
    })

    it('answers 428 when If-Match is absent entirely', async () => {
      const created = await create()
      const res = await patchSupplier(
        req(`/api/suppliers/${created.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ city: 'Nope' }),
        }),
        params(created.id),
      )
      expect(res.status).toBe(428)
    })
  })

  describe('authorization', () => {
    it('lets a READ_ONLY actor list suppliers', async () => {
      authState.roles = ['READ_ONLY']
      const res = await listSuppliers(req('/api/suppliers?limit=1'))
      authState.roles = ['ADMIN']
      expect(res.status).toBe(200)
    })

    it('refuses creation to a READ_ONLY actor with 403', async () => {
      authState.roles = ['READ_ONLY']
      const res = await createSupplier(
        req('/api/suppliers', { method: 'POST', body: JSON.stringify(newSupplier()) }),
      )
      authState.roles = ['ADMIN']
      expect(res.status).toBe(403)
    })

    it('refuses deletion to a VERIFIER with 403', async () => {
      const created = await create()
      authState.roles = ['VERIFIER']
      const res = await deleteSupplier(
        req(`/api/suppliers/${created.id}`, {
          method: 'DELETE',
          headers: { 'if-match': `W/"v${created.version}"` },
        }),
        params(created.id),
      )
      authState.roles = ['ADMIN']
      expect(res.status).toBe(403)
    })

    it('lets an EXPORT_MANAGER create', async () => {
      authState.roles = ['EXPORT_MANAGER']
      const res = await createSupplier(
        req('/api/suppliers', { method: 'POST', body: JSON.stringify(newSupplier()) }),
      )
      authState.roles = ['ADMIN']
      expect(res.status).toBe(201)
    })
  })

  describe('organization isolation', () => {
    it('reports another tenant’s supplier as 404, never 403', async () => {
      const foreign = await prisma.supplier.create({
        data: {
          organizationId: otherOrgId,
          supplierCode: code(),
          companyName: `Foreign ${uniq()}`,
          legalName: 'Foreign Ltd',
          businessType: 'TRADER',
          createdById: authState.userId,
        },
      })
      const res = await getSupplier(req(`/api/suppliers/${foreign.id}`), params(foreign.id))
      expect(res.status).toBe(404)
    })

    it('excludes another tenant’s suppliers from the list', async () => {
      const marker = uniq()
      await prisma.supplier.create({
        data: {
          organizationId: otherOrgId,
          supplierCode: code(),
          companyName: `Foreign ${marker}`,
          legalName: 'Foreign Ltd',
          businessType: 'TRADER',
          createdById: authState.userId,
        },
      })
      const res = await listSuppliers(req(`/api/suppliers?q=${marker}`))
      expect((await body(res)).data).toHaveLength(0)
    })

    it('refuses to update another tenant’s supplier', async () => {
      const foreign = await prisma.supplier.create({
        data: {
          organizationId: otherOrgId,
          supplierCode: code(),
          companyName: `Foreign ${uniq()}`,
          legalName: 'Foreign Ltd',
          businessType: 'TRADER',
          createdById: authState.userId,
        },
      })
      const res = await patchSupplier(
        req(`/api/suppliers/${foreign.id}`, {
          method: 'PATCH',
          headers: { 'if-match': 'W/"v1"' },
          body: JSON.stringify({ city: 'Hijacked' }),
        }),
        params(foreign.id),
      )
      expect(res.status).toBe(404)

      const row = await prisma.supplier.findUniqueOrThrow({ where: { id: foreign.id } })
      expect(row.city).toBeNull()
    })

    it('keeps facets scoped to the caller’s organization', async () => {
      await prisma.supplier.create({
        data: {
          organizationId: otherOrgId,
          supplierCode: code(),
          companyName: `Foreign ${uniq()}`,
          legalName: 'Foreign Ltd',
          businessType: 'TRADER',
          country: 'ZW',
          createdById: authState.userId,
        },
      })
      const res = await listCountries(req('/api/suppliers/countries'))
      const rows = (await body(res)).data as unknown as Array<{ country: string }>
      expect(rows.map((r) => r.country)).not.toContain('ZW')
    })
  })

  describe('audit logging', () => {
    it('writes an audit entry carrying the caller request id', async () => {
      const requestId = `req-${uniq()}`
      const res = await createSupplier(
        req('/api/suppliers', {
          method: 'POST',
          headers: { 'x-request-id': requestId },
          body: JSON.stringify(newSupplier()),
        }),
      )
      const created = (await body(res)).data as unknown as { id: string }

      const entries = await prisma.auditLog.findMany({
        where: { organizationId: authState.organizationId, entityId: created.id },
        select: { action: true, actorId: true, requestId: true },
      })
      expect(entries.map((e) => e.action)).toContain('supplier.created')
      expect(entries[0]!.actorId).toBe(authState.userId)
      expect(entries[0]!.requestId).toBe(requestId)
    })

    it('records an update distinctly from the create', async () => {
      const created = await create()
      await patchSupplier(
        req(`/api/suppliers/${created.id}`, {
          method: 'PATCH',
          headers: { 'if-match': `W/"v${created.version}"` },
          body: JSON.stringify({ city: 'Audited' }),
        }),
        params(created.id),
      )
      const actions = await prisma.auditLog.findMany({
        where: { organizationId: authState.organizationId, entityId: created.id },
        orderBy: { createdAt: 'asc' },
        select: { action: true },
      })
      expect(actions.map((a) => a.action)).toEqual(['supplier.created', 'supplier.updated'])
    })
  })

  describe('pagination', () => {
    it('pages by cursor without repeating a row', async () => {
      const marker = uniq().toUpperCase()
      for (let i = 0; i < 3; i += 1) {
        await createSupplier(
          req('/api/suppliers', {
            method: 'POST',
            body: JSON.stringify(newSupplier({ companyName: `PG ${marker} ${i}` })),
          }),
        )
      }
      const first = await body(await listSuppliers(req(`/api/suppliers?q=${marker}&limit=2`)))
      expect(first.data).toHaveLength(2)
      expect(first.meta.pagination?.nextCursor).toBeTruthy()

      const second = await body(
        await listSuppliers(
          req(`/api/suppliers?q=${marker}&limit=2&cursor=${first.meta.pagination!.nextCursor}`),
        ),
      )
      expect(second.data).toHaveLength(1)

      const ids = new Set(
        [
          ...(first.data as unknown as Array<{ id: string }>),
          ...(second.data as unknown as Array<{ id: string }>),
        ].map((s) => s.id),
      )
      expect(ids.size).toBe(3)
    })

    it('returns a null cursor on the last page', async () => {
      const marker = uniq().toUpperCase()
      await createSupplier(
        req('/api/suppliers', {
          method: 'POST',
          body: JSON.stringify(newSupplier({ companyName: `Solo ${marker}` })),
        }),
      )
      const b = await body(await listSuppliers(req(`/api/suppliers?q=${marker}&limit=25`)))
      expect(b.data).toHaveLength(1)
      expect(b.meta.pagination?.nextCursor).toBeNull()
    })
  })

  describe('filtering and sorting', () => {
    it('filters by status', async () => {
      const marker = uniq().toUpperCase()
      await createSupplier(
        req('/api/suppliers', {
          method: 'POST',
          body: JSON.stringify(newSupplier({ companyName: `Filt ${marker}` })),
        }),
      )
      const drafts = await body(await listSuppliers(req(`/api/suppliers?q=${marker}&status=DRAFT`)))
      expect(drafts.data).toHaveLength(1)

      const approved = await body(
        await listSuppliers(req(`/api/suppliers?q=${marker}&status=APPROVED`)),
      )
      expect(approved.data).toHaveLength(0)
    })

    it('sorts by companyName ascending and descending', async () => {
      const marker = uniq().toUpperCase()
      for (const name of ['Zulu', 'Alpha']) {
        await createSupplier(
          req('/api/suppliers', {
            method: 'POST',
            body: JSON.stringify(newSupplier({ companyName: `${name} ${marker}` })),
          }),
        )
      }
      const asc = (
        (await body(await listSuppliers(req(`/api/suppliers?q=${marker}&sort=companyName`))))
          .data as unknown as Array<{ companyName: string }>
      ).map((s) => s.companyName)
      expect(asc[0]).toContain('Alpha')

      const desc = (
        (await body(await listSuppliers(req(`/api/suppliers?q=${marker}&sort=-companyName`))))
          .data as unknown as Array<{ companyName: string }>
      ).map((s) => s.companyName)
      expect(desc[0]).toContain('Zulu')
    })

    it('excludes soft-deleted suppliers unless asked for them', async () => {
      const marker = uniq().toUpperCase()
      const created = await create({ companyName: `Del ${marker}` })
      await deleteSupplier(
        req(`/api/suppliers/${created.id}`, {
          method: 'DELETE',
          headers: { 'if-match': `W/"v${created.version}"` },
        }),
        params(created.id),
      )
      expect(
        (await body(await listSuppliers(req(`/api/suppliers?q=${marker}`)))).data,
      ).toHaveLength(0)
      expect(
        (await body(await listSuppliers(req(`/api/suppliers?q=${marker}&includeDeleted=true`))))
          .data,
      ).toHaveLength(1)
    })
  })

  describe('search', () => {
    it('finds a supplier by a fragment of its company name', async () => {
      const marker = uniq().toUpperCase()
      await create({ companyName: `Searchable ${marker}` })
      const b = await body(await searchSuppliers(req(`/api/suppliers/search?q=${marker}`)))
      expect(b.data).toHaveLength(1)
      expect((b.data as unknown as Array<{ companyName: string }>)[0]!.companyName).toContain(
        marker,
      )
    })

    it('finds a supplier by its exact code and ranks it first', async () => {
      const marker = uniq().toUpperCase()
      const target = await create({ companyName: `Ranked ${marker}` })
      // A second supplier whose NAME contains the code, so both match the query.
      await create({ companyName: `Decoy ${target.supplierCode} ${marker}` })

      const b = await body(
        await searchSuppliers(req(`/api/suppliers/search?q=${target.supplierCode}`)),
      )
      const hits = b.data as unknown as Array<{ id: string }>
      expect(hits.length).toBeGreaterThanOrEqual(2)
      expect(hits[0]!.id).toBe(target.id)
    })

    it('returns the compact projection only - no contacts, no banking', async () => {
      const marker = uniq().toUpperCase()
      await create({ companyName: `Compact ${marker}` })
      const b = await body(await searchSuppliers(req(`/api/suppliers/search?q=${marker}`)))
      const hit = (b.data as unknown as Array<Record<string, unknown>>)[0]!
      expect(Object.keys(hit).sort()).toEqual([
        'city',
        'companyName',
        'country',
        'id',
        'isVerified',
        'status',
        'supplierCode',
      ])
    })

    it('excludes soft-deleted suppliers', async () => {
      const marker = uniq().toUpperCase()
      const created = await create({ companyName: `Gone ${marker}` })
      await deleteSupplier(
        req(`/api/suppliers/${created.id}`, {
          method: 'DELETE',
          headers: { 'if-match': `W/"v${created.version}"` },
        }),
        params(created.id),
      )
      const b = await body(await searchSuppliers(req(`/api/suppliers/search?q=${marker}`)))
      expect(b.data).toHaveLength(0)
    })

    it('does not leak another tenant’s suppliers', async () => {
      const marker = uniq().toUpperCase()
      await prisma.supplier.create({
        data: {
          organizationId: otherOrgId,
          supplierCode: code(),
          companyName: `Foreign ${marker}`,
          legalName: 'Foreign Ltd',
          businessType: 'TRADER',
          createdById: authState.userId,
        },
      })
      const b = await body(await searchSuppliers(req(`/api/suppliers/search?q=${marker}`)))
      expect(b.data).toHaveLength(0)
    })
  })

  describe('offerings', () => {
    it('adds an offering and lists it under the supplier', async () => {
      const created = await create()
      const add = await addProduct(
        req(`/api/suppliers/${created.id}/products`, {
          method: 'POST',
          body: JSON.stringify({ productId, moq: 100, moqUnit: 'KG', leadTimeDays: 14 }),
        }),
        params(created.id),
      )
      expect(add.status).toBe(201)

      const listed = await body(
        await listProducts(req(`/api/suppliers/${created.id}/products`), params(created.id)),
      )
      expect(listed.data).toHaveLength(1)
      expect((listed.data as unknown as Array<{ productId: string }>)[0]!.productId).toBe(productId)
    })

    it('rejects a price with no currency', async () => {
      const created = await create()
      const res = await addProduct(
        req(`/api/suppliers/${created.id}/products`, {
          method: 'POST',
          body: JSON.stringify({ productId, price: 100 }),
        }),
        params(created.id),
      )
      expect(res.status).toBe(422)
    })

    it('rejects a validity window that closes before it opens', async () => {
      const created = await create()
      const res = await addProduct(
        req(`/api/suppliers/${created.id}/products`, {
          method: 'POST',
          body: JSON.stringify({
            productId,
            validFrom: '2026-06-01',
            validTo: '2026-05-01',
          }),
        }),
        params(created.id),
      )
      expect(res.status).toBe(422)
    })

    it('does not list offerings belonging to a different supplier', async () => {
      const a = await create()
      const b = await create()
      await addProduct(
        req(`/api/suppliers/${a.id}/products`, {
          method: 'POST',
          body: JSON.stringify({ productId }),
        }),
        params(a.id),
      )
      const listed = await body(
        await listProducts(req(`/api/suppliers/${b.id}/products`), params(b.id)),
      )
      expect(listed.data).toHaveLength(0)
    })
  })

  describe('facets', () => {
    it('reports the countries in use with a supplier count', async () => {
      await create({ country: 'IN' })
      const rows = (await body(await listCountries(req('/api/suppliers/countries'))))
        .data as unknown as Array<{ country: string; suppliers: number }>
      const india = rows.find((r) => r.country === 'IN')
      expect(india).toBeTruthy()
      expect(india!.suppliers).toBeGreaterThan(0)
    })

    it('counts certification types, distinguishing active from total', async () => {
      const created = await create()
      await prisma.supplierCertification.createMany({
        data: [
          {
            supplierId: created.id,
            organizationId: authState.organizationId,
            type: 'BRCGS',
            certificateNumber: `CERT-${uniq()}`,
            status: 'ACTIVE',
          },
          {
            supplierId: created.id,
            organizationId: authState.organizationId,
            type: 'BRCGS',
            certificateNumber: `CERT-${uniq()}`,
            status: 'EXPIRED',
          },
        ],
      })
      const rows = (await body(await listCertifications(req('/api/suppliers/certifications'))))
        .data as unknown as Array<{ type: string; total: number; active: number }>
      const brcgs = rows.find((r) => r.type === 'BRCGS')
      expect(brcgs).toBeTruthy()
      expect(brcgs!.total).toBeGreaterThanOrEqual(2)
      expect(brcgs!.active).toBeLessThan(brcgs!.total)
    })
  })
})
