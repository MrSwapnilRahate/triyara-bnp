// @vitest-environment node
import { randomUUID } from 'node:crypto'

import { buildAbilityFor, type Role } from '@triyara/auth'
import { prisma } from '@triyara/db'
import { beforeAll, describe, expect, it, vi } from 'vitest'

// Full stack: route handler -> service -> repository -> real PostgreSQL. Only
// the auth context is mocked, so authorization, organization isolation,
// optimistic concurrency, the date rule and the audit rows are exercised for
// real.

const authState = { roles: ['ADMIN'] as Role[], organizationId: '', userId: '' }

vi.mock('@/auth/context', () => ({
  requireAuth: vi.fn(async () => ({
    user: {
      id: authState.userId,
      organizationId: authState.organizationId,
      email: 'certs-it@triyara.test',
      name: 'Certs IT',
      roles: authState.roles,
    },
    organizationId: authState.organizationId,
    ability: buildAbilityFor(authState.roles),
  })),
}))

const { GET: listCerts, POST: addCert } = await import('./[id]/certifications/route')
const { PATCH: patchCert, DELETE: deleteCert } =
  await import('./[id]/certifications/[certificationId]/route')

const req = (url: string, init?: RequestInit) => new Request(`http://t.test${url}`, init)
const ctx = (id: string, certificationId?: string) =>
  ({
    params: Promise.resolve(certificationId ? { id, certificationId } : { id }),
  }) as never
const body = async (res: Response) =>
  (await res.json()) as {
    success: boolean
    data: never
    meta: { requestId: string; [k: string]: unknown }
    errors: Array<{ code: string; message: string }> | null
  }

type Row = {
  id: string
  type: string
  certificateNumber: string
  issuedBy: string | null
  issuedDate: string | null
  expiryDate: string | null
  status: string
  scope: string | null
  version: number
}

const rows = async (res: Response) => (await body(res)).data as unknown as Row[]
const one = async (res: Response) => (await body(res)).data as unknown as Row

// Fixtures namespaced to this file: vitest runs files in parallel and `upsert`
// is a select-then-insert, so a shared slug races on an empty database.
const uniq = () => randomUUID().replace(/-/g, '').slice(0, 10)
const SLUG = 'supplier-certs-itest'

describe.skipIf(!process.env.DATABASE_URL)(
  'supplier certifications API (integration, real PostgreSQL)',
  () => {
    let otherOrgId = ''

    async function makeSupplier(organizationId?: string) {
      const id = uniq()
      return prisma.supplier.create({
        data: {
          organizationId: organizationId ?? authState.organizationId,
          supplierCode: `CT-${id.toUpperCase()}`,
          companyName: `Spice Co ${id}`,
          legalName: `Spice Co ${id} Pvt Ltd`,
          businessType: 'MANUFACTURER',
        },
      })
    }

    const add = (supplierId: string, payload: Record<string, unknown>) =>
      addCert(
        req(`/api/suppliers/${supplierId}/certifications`, {
          method: 'POST',
          body: JSON.stringify(payload),
        }),
        ctx(supplierId),
      )

    const patch = (
      supplierId: string,
      certId: string,
      payload: Record<string, unknown>,
      version: number,
    ) =>
      patchCert(
        req(`/api/suppliers/${supplierId}/certifications/${certId}`, {
          method: 'PATCH',
          headers: { 'if-match': `W/"v${version}"` },
          body: JSON.stringify(payload),
        }),
        ctx(supplierId, certId),
      )

    beforeAll(async () => {
      const org = await prisma.organization.upsert({
        where: { slug: SLUG },
        update: {},
        create: { name: 'Supplier Certs IT', slug: SLUG },
      })
      authState.organizationId = org.id

      const me = await prisma.user.upsert({
        where: { email: 'certs-it@triyara.test' },
        update: {},
        create: {
          organizationId: org.id,
          email: 'certs-it@triyara.test',
          name: 'Certs IT',
          passwordHash: 'x',
        },
      })
      authState.userId = me.id

      const other = await prisma.organization.upsert({
        where: { slug: `${SLUG}-other` },
        update: {},
        create: { name: 'Other Tenant', slug: `${SLUG}-other` },
      })
      otherOrgId = other.id
    })

    describe('authorization', () => {
      it('lets ADMIN and EXPORT_MANAGER write', async () => {
        for (const role of ['ADMIN', 'EXPORT_MANAGER'] as Role[]) {
          authState.roles = [role]
          const supplier = await makeSupplier()
          const res = await add(supplier.id, { type: 'FSSAI', certificateNumber: `FS-${uniq()}` })
          expect(res.status).toBe(201)
        }
        authState.roles = ['ADMIN']
      })

      it.each([['VERIFIER'], ['READ_ONLY']])(
        'refuses %s on write but allows read',
        async (role) => {
          const supplier = await makeSupplier()
          await add(supplier.id, { type: 'ISO', certificateNumber: `IS-${uniq()}` })

          authState.roles = [role as Role]
          const write = await add(supplier.id, { type: 'HACCP', certificateNumber: 'H-1' })
          const read = await listCerts(
            req(`/api/suppliers/${supplier.id}/certifications`),
            ctx(supplier.id),
          )

          expect(write.status).toBe(403)
          expect(read.status).toBe(200)
          authState.roles = ['ADMIN']
        },
      )
    })

    describe('organization isolation', () => {
      it('reports a supplier in another tenant as 404, never 403', async () => {
        const outsider = await makeSupplier(otherOrgId)

        const list = await listCerts(
          req(`/api/suppliers/${outsider.id}/certifications`),
          ctx(outsider.id),
        )
        const create = await add(outsider.id, { type: 'FSSAI', certificateNumber: 'X-1' })

        expect(await rows(list)).toEqual([])
        expect(create.status).toBe(404)
      })

      it('does not record against another tenant’s supplier', async () => {
        const outsider = await makeSupplier(otherOrgId)
        await add(outsider.id, { type: 'FSSAI', certificateNumber: 'X-2' })

        const held = await prisma.supplierCertification.findMany({
          where: { supplierId: outsider.id },
        })
        expect(held).toHaveLength(0)
      })
    })

    describe('create', () => {
      it('stores every field the model carries', async () => {
        const supplier = await makeSupplier()
        const res = await add(supplier.id, {
          type: 'HACCP',
          certificateNumber: 'H-778899',
          issuedBy: 'SGS India',
          issuedDate: '2026-01-15',
          expiryDate: '2027-01-14',
          scope: 'Unit II - spice grinding',
          status: 'ACTIVE',
        })

        expect(res.status).toBe(201)
        expect(await one(res)).toMatchObject({
          type: 'HACCP',
          certificateNumber: 'H-778899',
          issuedBy: 'SGS India',
          scope: 'Unit II - spice grinding',
          status: 'ACTIVE',
          version: 1,
        })
      })

      it('defaults status to ACTIVE when none is given', async () => {
        const supplier = await makeSupplier()
        const res = await add(supplier.id, { type: 'ISO', certificateNumber: 'I-1' })
        expect((await one(res)).status).toBe('ACTIVE')
      })

      it('refuses an expiry that falls before the issue date', async () => {
        const supplier = await makeSupplier()
        const res = await add(supplier.id, {
          type: 'FSSAI',
          certificateNumber: 'F-1',
          issuedDate: '2027-01-01',
          expiryDate: '2026-01-01',
        })

        expect(res.status).toBe(422)
        const held = await prisma.supplierCertification.findMany({
          where: { supplierId: supplier.id },
        })
        expect(held).toHaveLength(0)
      })

      it('allows two certificates of the same type, covering different units', async () => {
        const supplier = await makeSupplier()
        const a = await add(supplier.id, {
          type: 'ISO',
          certificateNumber: 'I-A',
          scope: 'Unit I',
        })
        const b = await add(supplier.id, {
          type: 'ISO',
          certificateNumber: 'I-B',
          scope: 'Unit II',
        })

        expect([a.status, b.status]).toEqual([201, 201])
      })

      it('writes an audit row against the supplier', async () => {
        const supplier = await makeSupplier()
        await add(supplier.id, { type: 'FSSAI', certificateNumber: 'F-AUDIT' })

        const audit = await prisma.auditLog.findFirst({
          where: {
            entityType: 'Supplier',
            entityId: supplier.id,
            action: 'supplier.certification_added',
          },
          orderBy: { createdAt: 'desc' },
        })
        expect(audit).not.toBeNull()
        expect(audit!.organizationId).toBe(authState.organizationId)
        expect(audit!.actorId).toBe(authState.userId)
      })
    })

    describe('update', () => {
      it('edits a field and bumps the version', async () => {
        const supplier = await makeSupplier()
        const created = await one(
          await add(supplier.id, { type: 'FSSAI', certificateNumber: 'F-OLD' }),
        )

        const res = await patch(
          supplier.id,
          created.id,
          { certificateNumber: 'F-NEW' },
          created.version,
        )

        expect(res.status).toBe(200)
        const updated = await one(res)
        expect(updated.certificateNumber).toBe('F-NEW')
        expect(updated.version).toBe(created.version + 1)
      })

      it('records a lapse by status alone', async () => {
        const supplier = await makeSupplier()
        const created = await one(
          await add(supplier.id, { type: 'ISO', certificateNumber: 'I-LAPSE' }),
        )

        const res = await patch(supplier.id, created.id, { status: 'SUSPENDED' }, created.version)
        expect((await one(res)).status).toBe('SUSPENDED')
      })

      it('refuses a stale version with 412 and leaves the row alone', async () => {
        const supplier = await makeSupplier()
        const created = await one(
          await add(supplier.id, { type: 'FSSAI', certificateNumber: 'F-RACE' }),
        )
        await patch(supplier.id, created.id, { issuedBy: 'First write' }, created.version)

        const stale = await patch(supplier.id, created.id, { issuedBy: 'Second' }, created.version)
        expect(stale.status).toBe(412)

        const row = await prisma.supplierCertification.findUniqueOrThrow({
          where: { id: created.id },
        })
        expect(row.issuedBy).toBe('First write')
      })

      it('judges the date rule against the result, not the patch', async () => {
        const supplier = await makeSupplier()
        const created = await one(
          await add(supplier.id, {
            type: 'FSSAI',
            certificateNumber: 'F-DATES',
            issuedDate: '2026-01-01',
            expiryDate: '2027-01-01',
          }),
        )

        // Moving expiry back before the STORED issue date must be refused.
        const bad = await patch(
          supplier.id,
          created.id,
          { expiryDate: '2025-01-01' },
          created.version,
        )
        expect(bad.status).toBe(422)

        // Moving it forward is fine.
        const good = await patch(
          supplier.id,
          created.id,
          { expiryDate: '2028-01-01' },
          created.version,
        )
        expect(good.status).toBe(200)
      })

      it('writes an audit row', async () => {
        const supplier = await makeSupplier()
        const created = await one(
          await add(supplier.id, { type: 'ISO', certificateNumber: 'I-AUD' }),
        )
        await patch(supplier.id, created.id, { status: 'EXPIRED' }, created.version)

        const audit = await prisma.auditLog.findFirst({
          where: {
            entityType: 'Supplier',
            entityId: supplier.id,
            action: 'supplier.certification_updated',
          },
        })
        expect(audit).not.toBeNull()
      })
    })

    describe('delete', () => {
      it('soft-deletes and drops it from the list', async () => {
        const supplier = await makeSupplier()
        const created = await one(
          await add(supplier.id, { type: 'FSSAI', certificateNumber: 'F-DEL' }),
        )

        const res = await deleteCert(
          req(`/api/suppliers/${supplier.id}/certifications/${created.id}`, {
            method: 'DELETE',
            headers: { 'if-match': `W/"v${created.version}"` },
          }),
          ctx(supplier.id, created.id),
        )
        expect(res.status).toBe(200)

        const list = await listCerts(
          req(`/api/suppliers/${supplier.id}/certifications`),
          ctx(supplier.id),
        )
        expect((await rows(list)).map((r) => r.id)).not.toContain(created.id)

        // Soft, not hard: an expired certificate is compliance history.
        const row = await prisma.supplierCertification.findUniqueOrThrow({
          where: { id: created.id },
        })
        expect(row.deletedAt).not.toBeNull()
      })

      it('writes an audit row', async () => {
        const supplier = await makeSupplier()
        const created = await one(
          await add(supplier.id, { type: 'ISO', certificateNumber: 'I-DEL' }),
        )
        await deleteCert(
          req(`/api/suppliers/${supplier.id}/certifications/${created.id}`, {
            method: 'DELETE',
            headers: { 'if-match': `W/"v${created.version}"` },
          }),
          ctx(supplier.id, created.id),
        )

        const audit = await prisma.auditLog.findFirst({
          where: {
            entityType: 'Supplier',
            entityId: supplier.id,
            action: 'supplier.certification_removed',
          },
        })
        expect(audit).not.toBeNull()
      })
    })

    describe('ordering', () => {
      it('puts the soonest expiry first, with undated certificates last', async () => {
        const supplier = await makeSupplier()
        await add(supplier.id, { type: 'ISO', certificateNumber: 'far', expiryDate: '2030-01-01' })
        await add(supplier.id, { type: 'GMP', certificateNumber: 'none' })
        await add(supplier.id, {
          type: 'HACCP',
          certificateNumber: 'soon',
          expiryDate: '2026-06-01',
        })

        const list = await listCerts(
          req(`/api/suppliers/${supplier.id}/certifications`),
          ctx(supplier.id),
        )
        expect((await rows(list)).map((r) => r.certificateNumber)).toEqual(['soon', 'far', 'none'])
      })
    })
  },
)
