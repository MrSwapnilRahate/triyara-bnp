// @vitest-environment node
import { randomUUID } from 'node:crypto'

import { buildAbilityFor, type Role } from '@triyara/auth'
import { prisma } from '@triyara/db'
import { beforeAll, describe, expect, it, vi } from 'vitest'

// Full stack: route handler -> service -> repository -> real PostgreSQL. Only
// the auth context is mocked, so authorization, organization isolation, the
// single-primary rule, optimistic concurrency and the audit rows are all
// exercised for real.

const authState = { roles: ['ADMIN'] as Role[], organizationId: '', userId: '' }

vi.mock('@/auth/context', () => ({
  requireAuth: vi.fn(async () => ({
    user: {
      id: authState.userId,
      organizationId: authState.organizationId,
      email: 'contacts-it@triyara.test',
      name: 'Contacts IT',
      roles: authState.roles,
    },
    organizationId: authState.organizationId,
    ability: buildAbilityFor(authState.roles),
  })),
}))

const { GET: listContacts, POST: addContact } = await import('./[id]/contacts/route')
const { PATCH: patchContact, DELETE: deleteContact } =
  await import('./[id]/contacts/[contactId]/route')

const req = (url: string, init?: RequestInit) => new Request(`http://t.test${url}`, init)
const ctx = (id: string, contactId?: string) =>
  ({
    params: Promise.resolve(contactId ? { id, contactId } : { id }),
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
  name: string
  email: string | null
  phone: string | null
  whatsapp: string | null
  isPrimary: boolean
  version: number
}

const rows = async (res: Response) => (await body(res)).data as unknown as Row[]
const one = async (res: Response) => (await body(res)).data as unknown as Row

// Fixtures namespaced to this file: vitest runs files in parallel and `upsert`
// is a select-then-insert, so a shared slug races on an empty database.
const uniq = () => randomUUID().replace(/-/g, '').slice(0, 10)
const SLUG = 'supplier-contacts-itest'

describe.skipIf(!process.env.DATABASE_URL)(
  'supplier contacts API (integration, real PostgreSQL)',
  () => {
    let otherOrgId = ''

    async function makeSupplier(organizationId?: string) {
      const id = uniq()
      return prisma.supplier.create({
        data: {
          organizationId: organizationId ?? authState.organizationId,
          supplierCode: `SC-${id.toUpperCase()}`,
          companyName: `Spice Co ${id}`,
          legalName: `Spice Co ${id} Pvt Ltd`,
          businessType: 'MANUFACTURER',
        },
      })
    }

    async function add(supplierId: string, payload: Record<string, unknown>) {
      return addContact(
        req(`/api/suppliers/${supplierId}/contacts`, {
          method: 'POST',
          body: JSON.stringify(payload),
        }),
        ctx(supplierId),
      )
    }

    async function patch(
      supplierId: string,
      contactId: string,
      payload: Record<string, unknown>,
      version: number,
    ) {
      return patchContact(
        req(`/api/suppliers/${supplierId}/contacts/${contactId}`, {
          method: 'PATCH',
          headers: { 'if-match': `W/"v${version}"` },
          body: JSON.stringify(payload),
        }),
        ctx(supplierId, contactId),
      )
    }

    beforeAll(async () => {
      const org = await prisma.organization.upsert({
        where: { slug: SLUG },
        update: {},
        create: { name: 'Supplier Contacts IT', slug: SLUG },
      })
      authState.organizationId = org.id

      const me = await prisma.user.upsert({
        where: { email: 'contacts-it@triyara.test' },
        update: {},
        create: {
          organizationId: org.id,
          email: 'contacts-it@triyara.test',
          name: 'Contacts IT',
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
          const res = await add(supplier.id, { name: 'Ravi', phone: '+91900000' })
          expect(res.status).toBe(201)
        }
        authState.roles = ['ADMIN']
      })

      it.each([['VERIFIER'], ['READ_ONLY']])(
        'refuses %s on write but allows read',
        async (role) => {
          const supplier = await makeSupplier()
          await add(supplier.id, { name: 'Ravi', phone: '+91900000' })

          authState.roles = [role as Role]
          const write = await add(supplier.id, { name: 'Other', phone: '+91900001' })
          const read = await listContacts(
            req(`/api/suppliers/${supplier.id}/contacts`),
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

        const list = await listContacts(
          req(`/api/suppliers/${outsider.id}/contacts`),
          ctx(outsider.id),
        )
        const create = await add(outsider.id, { name: 'Ravi', phone: '+91900000' })

        expect(await rows(list)).toEqual([])
        expect(create.status).toBe(404)
      })

      it('does not create a contact against another tenant’s supplier', async () => {
        const outsider = await makeSupplier(otherOrgId)
        await add(outsider.id, { name: 'Ravi', phone: '+91900000' })

        const held = await prisma.supplierContact.findMany({ where: { supplierId: outsider.id } })
        expect(held).toHaveLength(0)
      })
    })

    describe('create', () => {
      it('stores every field the model carries', async () => {
        const supplier = await makeSupplier()
        const res = await add(supplier.id, {
          name: 'Ravi Kumar',
          role: 'SALES',
          designation: 'Sr. Manager - Exports',
          email: 'ravi@spice.test',
          phone: '+912212345678',
          whatsapp: '+919900112233',
          notes: 'Best reached after 6pm IST',
        })

        expect(res.status).toBe(201)
        const created = await one(res)
        expect(created).toMatchObject({
          name: 'Ravi Kumar',
          email: 'ravi@spice.test',
          whatsapp: '+919900112233',
          version: 1,
        })
      })

      it('refuses a contact nobody can reach', async () => {
        const supplier = await makeSupplier()
        const res = await add(supplier.id, { name: 'Unreachable' })

        expect(res.status).toBe(422)
        const held = await prisma.supplierContact.findMany({ where: { supplierId: supplier.id } })
        expect(held).toHaveLength(0)
      })

      it('writes an audit row against the supplier', async () => {
        const supplier = await makeSupplier()
        await add(supplier.id, { name: 'Ravi', whatsapp: '+919000000000' })

        const audit = await prisma.auditLog.findFirst({
          where: {
            entityType: 'Supplier',
            entityId: supplier.id,
            action: 'supplier.contact_added',
          },
          orderBy: { createdAt: 'desc' },
        })
        expect(audit).not.toBeNull()
        expect(audit!.organizationId).toBe(authState.organizationId)
        expect(audit!.actorId).toBe(authState.userId)
      })
    })

    describe('exactly one primary', () => {
      it('demotes the previous primary when a new one is added', async () => {
        const supplier = await makeSupplier()
        await add(supplier.id, { name: 'First', phone: '+9111', isPrimary: true })
        await add(supplier.id, { name: 'Second', phone: '+9122', isPrimary: true })

        const list = await listContacts(
          req(`/api/suppliers/${supplier.id}/contacts`),
          ctx(supplier.id),
        )
        const primaries = (await rows(list)).filter((r) => r.isPrimary)

        expect(primaries).toHaveLength(1)
        expect(primaries[0]!.name).toBe('Second')
      })

      it('demotes the previous primary when one is promoted', async () => {
        const supplier = await makeSupplier()
        await add(supplier.id, { name: 'First', phone: '+9111', isPrimary: true })
        const secondRes = await add(supplier.id, { name: 'Second', phone: '+9122' })
        const second = await one(secondRes)

        await patch(supplier.id, second.id, { isPrimary: true }, second.version)

        const list = await listContacts(
          req(`/api/suppliers/${supplier.id}/contacts`),
          ctx(supplier.id),
        )
        const all = await rows(list)
        expect(all.filter((r) => r.isPrimary)).toHaveLength(1)
        expect(all[0]!.name).toBe('Second') // primary sorts first
      })

      it('is guaranteed by the database, not just by this code', async () => {
        // SupplierContact_one_primary is a partial unique index:
        //   UNIQUE ("supplierId") WHERE isPrimary AND deletedAt IS NULL
        // Writing a second primary directly must fail. If this ever passes,
        // the constraint has been dropped and the service is the only thing
        // holding the invariant up.
        const supplier = await makeSupplier()
        await add(supplier.id, { name: 'Held', phone: '+9111', isPrimary: true })

        await expect(
          prisma.supplierContact.create({
            data: {
              supplierId: supplier.id,
              organizationId: authState.organizationId,
              name: 'Usurper',
              phone: '+9199',
              isPrimary: true,
            },
          }),
        ).rejects.toThrow()
      })

      it('never leaves two primaries after concurrent promotions', async () => {
        const supplier = await makeSupplier()
        const a = await one(await add(supplier.id, { name: 'A', phone: '+9111' }))
        const b = await one(await add(supplier.id, { name: 'B', phone: '+9122' }))

        await Promise.all([
          patch(supplier.id, a.id, { isPrimary: true }, a.version),
          patch(supplier.id, b.id, { isPrimary: true }, b.version),
        ])

        const live = await prisma.supplierContact.count({
          where: { supplierId: supplier.id, deletedAt: null, isPrimary: true },
        })
        expect(live).toBeLessThanOrEqual(1)
      })
    })

    describe('update', () => {
      it('edits a field and bumps the version', async () => {
        const supplier = await makeSupplier()
        const created = await one(await add(supplier.id, { name: 'Ravi', phone: '+9111' }))

        const res = await patch(supplier.id, created.id, { name: 'Ravi Kumar' }, created.version)
        const updated = await one(res)

        expect(res.status).toBe(200)
        expect(updated.name).toBe('Ravi Kumar')
        expect(updated.version).toBe(created.version + 1)
      })

      it('refuses a stale version with 412 and leaves the row alone', async () => {
        const supplier = await makeSupplier()
        const created = await one(await add(supplier.id, { name: 'Ravi', phone: '+9111' }))
        await patch(supplier.id, created.id, { name: 'First write' }, created.version)

        const stale = await patch(supplier.id, created.id, { name: 'Second' }, created.version)
        expect(stale.status).toBe(412)

        const row = await prisma.supplierContact.findUniqueOrThrow({ where: { id: created.id } })
        expect(row.name).toBe('First write')
      })

      it('refuses to clear the last way of reaching someone', async () => {
        const supplier = await makeSupplier()
        const created = await one(await add(supplier.id, { name: 'Ravi', phone: '+9111' }))

        const res = await patch(supplier.id, created.id, { phone: '' }, created.version)
        expect(res.status).toBe(422)
      })

      it('allows clearing one channel while another remains', async () => {
        const supplier = await makeSupplier()
        const created = await one(
          await add(supplier.id, { name: 'Ravi', phone: '+9111', email: 'r@t.test' }),
        )

        const res = await patch(supplier.id, created.id, { phone: '' }, created.version)
        expect(res.status).toBe(200)
        expect((await one(res)).phone).toBeNull()
      })

      it('writes an audit row', async () => {
        const supplier = await makeSupplier()
        const created = await one(await add(supplier.id, { name: 'Ravi', phone: '+9111' }))
        await patch(supplier.id, created.id, { name: 'Ravi K' }, created.version)

        const audit = await prisma.auditLog.findFirst({
          where: {
            entityType: 'Supplier',
            entityId: supplier.id,
            action: 'supplier.contact_updated',
          },
        })
        expect(audit).not.toBeNull()
      })
    })

    describe('delete', () => {
      it('soft-deletes and drops the contact from the list', async () => {
        const supplier = await makeSupplier()
        const created = await one(await add(supplier.id, { name: 'Ravi', phone: '+9111' }))

        const res = await deleteContact(
          req(`/api/suppliers/${supplier.id}/contacts/${created.id}`, {
            method: 'DELETE',
            headers: { 'if-match': `W/"v${created.version}"` },
          }),
          ctx(supplier.id, created.id),
        )
        expect(res.status).toBe(200)

        const list = await listContacts(
          req(`/api/suppliers/${supplier.id}/contacts`),
          ctx(supplier.id),
        )
        expect((await rows(list)).map((r) => r.id)).not.toContain(created.id)

        // Soft, not hard: the audit trail names this person.
        const row = await prisma.supplierContact.findUniqueOrThrow({ where: { id: created.id } })
        expect(row.deletedAt).not.toBeNull()
      })

      it('writes an audit row', async () => {
        const supplier = await makeSupplier()
        const created = await one(await add(supplier.id, { name: 'Ravi', phone: '+9111' }))
        await deleteContact(
          req(`/api/suppliers/${supplier.id}/contacts/${created.id}`, {
            method: 'DELETE',
            headers: { 'if-match': `W/"v${created.version}"` },
          }),
          ctx(supplier.id, created.id),
        )

        const audit = await prisma.auditLog.findFirst({
          where: {
            entityType: 'Supplier',
            entityId: supplier.id,
            action: 'supplier.contact_removed',
          },
        })
        expect(audit).not.toBeNull()
      })
    })

    describe('ordering', () => {
      it('puts the primary first, so the person to ring is the first row', async () => {
        const supplier = await makeSupplier()
        await add(supplier.id, { name: 'Alpha', phone: '+9111' })
        await add(supplier.id, { name: 'Beta', phone: '+9122' })
        const gamma = await one(await add(supplier.id, { name: 'Gamma', phone: '+9133' }))
        await patch(supplier.id, gamma.id, { isPrimary: true }, gamma.version)

        const list = await listContacts(
          req(`/api/suppliers/${supplier.id}/contacts`),
          ctx(supplier.id),
        )
        expect((await rows(list))[0]!.name).toBe('Gamma')
      })
    })
  },
)
