// @vitest-environment node
import { randomUUID } from 'node:crypto'

import { buildAbilityFor, type Role } from '@triyara/auth'
import { prisma } from '@triyara/db'
import { getLocalStorage } from '@triyara/storage'
import { beforeAll, describe, expect, it, vi } from 'vitest'

// Full stack: route handler -> service -> repository -> real PostgreSQL, with
// the real local storage provider. Only the auth context is mocked, so the
// presign/upload/record round trip, organization isolation, optimistic
// concurrency and the audit rows are exercised for real.

const authState = { roles: ['ADMIN'] as Role[], organizationId: '', userId: '' }

vi.mock('@/auth/context', () => ({
  requireAuth: vi.fn(async () => ({
    user: {
      id: authState.userId,
      organizationId: authState.organizationId,
      email: 'docs-it@triyara.test',
      name: 'Docs IT',
      roles: authState.roles,
    },
    organizationId: authState.organizationId,
    ability: buildAbilityFor(authState.roles),
  })),
}))

const { GET: listDocs, POST: addDoc } = await import('./[id]/documents/route')
const { POST: presign } = await import('./[id]/documents/presign/route')
const { PATCH: patchDoc, DELETE: deleteDoc } = await import('./[id]/documents/[documentId]/route')
const { GET: download } = await import('./[id]/documents/[documentId]/download/route')

const req = (url: string, init?: RequestInit) => new Request(`http://t.test${url}`, init)
const ctx = (id: string, documentId?: string) =>
  ({ params: Promise.resolve(documentId ? { id, documentId } : { id }) }) as never
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
  title: string | null
  storageKey: string | null
  mimeType: string | null
  fileSize: number | null
  checksum: string | null
  version: number
}
const rows = async (res: Response) => (await body(res)).data as unknown as Row[]
const one = async (res: Response) => (await body(res)).data as unknown as Row

const uniq = () => randomUUID().replace(/-/g, '').slice(0, 10)
const SLUG = 'supplier-docs-itest'

describe.skipIf(!process.env.DATABASE_URL)(
  'supplier documents API (integration, real PostgreSQL + storage)',
  () => {
    let otherOrgId = ''

    async function makeSupplier(organizationId?: string) {
      const id = uniq()
      return prisma.supplier.create({
        data: {
          organizationId: organizationId ?? authState.organizationId,
          supplierCode: `DC-${id.toUpperCase()}`,
          companyName: `Spice Co ${id}`,
          legalName: `Spice Co ${id} Pvt Ltd`,
          businessType: 'MANUFACTURER',
        },
      })
    }

    /** The real two-step: presign, write the bytes, then record the row. */
    async function upload(supplierId: string, bytes = Buffer.from('%PDF-1.4 fake catalogue')) {
      const res = await presign(
        req(`/api/suppliers/${supplierId}/documents/presign`, {
          method: 'POST',
          body: JSON.stringify({
            fileName: 'catalogue.pdf',
            mimeType: 'application/pdf',
            sizeBytes: bytes.byteLength,
          }),
        }),
        ctx(supplierId),
      )
      expect(res.status).toBe(200)
      const presigned = (await body(res)).data as unknown as { storageKey: string }
      await getLocalStorage().write(presigned.storageKey, bytes)
      return presigned.storageKey
    }

    const record = (supplierId: string, payload: Record<string, unknown>) =>
      addDoc(
        req(`/api/suppliers/${supplierId}/documents`, {
          method: 'POST',
          body: JSON.stringify(payload),
        }),
        ctx(supplierId),
      )

    beforeAll(async () => {
      const org = await prisma.organization.upsert({
        where: { slug: SLUG },
        update: {},
        create: { name: 'Supplier Docs IT', slug: SLUG },
      })
      authState.organizationId = org.id
      const me = await prisma.user.upsert({
        where: { email: 'docs-it@triyara.test' },
        update: {},
        create: {
          organizationId: org.id,
          email: 'docs-it@triyara.test',
          name: 'Docs IT',
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
      it('lets ADMIN and EXPORT_MANAGER upload', async () => {
        for (const role of ['ADMIN', 'EXPORT_MANAGER'] as Role[]) {
          authState.roles = [role]
          const s = await makeSupplier()
          const key = await upload(s.id)
          const res = await record(s.id, { type: 'CATALOG', storageKey: key })
          expect(res.status).toBe(201)
        }
        authState.roles = ['ADMIN']
      })

      it.each([['VERIFIER'], ['READ_ONLY']])(
        'refuses %s on write but allows read',
        async (role) => {
          const s = await makeSupplier()
          const key = await upload(s.id)
          await record(s.id, { type: 'CATALOG', storageKey: key })

          authState.roles = [role as Role]
          const write = await record(s.id, { type: 'GST', storageKey: key })
          const read = await listDocs(req(`/api/suppliers/${s.id}/documents`), ctx(s.id))

          expect(write.status).toBe(403)
          expect(read.status).toBe(200)
          authState.roles = ['ADMIN']
        },
      )
    })

    describe('organization isolation', () => {
      it('reports a supplier in another tenant as 404, never 403', async () => {
        const outsider = await makeSupplier(otherOrgId)
        const list = await listDocs(
          req(`/api/suppliers/${outsider.id}/documents`),
          ctx(outsider.id),
        )
        const create = await record(outsider.id, { type: 'GST', storageKey: 'x' })

        expect(await rows(list)).toEqual([])
        expect(create.status).toBe(404)
      })
    })

    describe('upload round trip', () => {
      it('stores the file and records it with size and checksum from storage', async () => {
        const s = await makeSupplier()
        const bytes = Buffer.from('%PDF-1.4 a real-ish catalogue body')
        const key = await upload(s.id, bytes)

        const res = await record(s.id, {
          type: 'CATALOG',
          storageKey: key,
          title: 'Spice catalogue 2026',
          mimeType: 'application/pdf',
        })

        expect(res.status).toBe(201)
        const created = await one(res)
        expect(created.title).toBe('Spice catalogue 2026')
        // Not what the client claimed - what storage actually holds.
        expect(created.fileSize).toBe(bytes.byteLength)
        expect(created.checksum).toBeTruthy()
      })

      it('namespaces the storage key by organization and supplier', async () => {
        const s = await makeSupplier()
        const key = await upload(s.id)
        expect(key.startsWith(`${authState.organizationId}/suppliers/${s.id}/`)).toBe(true)
      })

      it('refuses to record a key nobody uploaded', async () => {
        const s = await makeSupplier()
        const res = await record(s.id, {
          type: 'GST',
          storageKey: `${authState.organizationId}/suppliers/${s.id}/ghost/none.pdf`,
        })

        expect(res.status).toBe(422)
        const held = await prisma.supplierDocument.findMany({ where: { supplierId: s.id } })
        expect(held).toHaveLength(0)
      })

      it('writes an audit row against the supplier', async () => {
        const s = await makeSupplier()
        const key = await upload(s.id)
        await record(s.id, { type: 'COMPANY_PROFILE', storageKey: key })

        const audit = await prisma.auditLog.findFirst({
          where: { entityType: 'Supplier', entityId: s.id, action: 'supplier.document_added' },
          orderBy: { createdAt: 'desc' },
        })
        expect(audit).not.toBeNull()
        expect(audit!.actorId).toBe(authState.userId)
      })
    })

    describe('download', () => {
      it('redirects to a signed URL for the stored object', async () => {
        const s = await makeSupplier()
        const key = await upload(s.id)
        const created = await one(await record(s.id, { type: 'CATALOG', storageKey: key }))

        const res = await download(
          req(`/api/suppliers/${s.id}/documents/${created.id}/download`),
          ctx(s.id, created.id),
        )
        expect(res.status).toBe(302)
        expect(res.headers.get('location')).toBeTruthy()
      })
    })

    describe('replace', () => {
      it('keeps the row and swaps the file, recording it as a replacement', async () => {
        const s = await makeSupplier()
        const first = await upload(s.id, Buffer.from('%PDF old'))
        const created = await one(await record(s.id, { type: 'CATALOG', storageKey: first }))

        const second = await upload(s.id, Buffer.from('%PDF a much newer catalogue'))
        const res = await patchDoc(
          req(`/api/suppliers/${s.id}/documents/${created.id}`, {
            method: 'PATCH',
            headers: { 'if-match': `W/"v${created.version}"` },
            body: JSON.stringify({ storageKey: second }),
          }),
          ctx(s.id, created.id),
        )

        expect(res.status).toBe(200)
        const updated = await one(res)
        expect(updated.id).toBe(created.id)
        expect(updated.storageKey).toBe(second)
        expect(updated.fileSize).not.toBe(created.fileSize)

        const audit = await prisma.auditLog.findFirst({
          where: { entityType: 'Supplier', entityId: s.id, action: 'supplier.document_replaced' },
        })
        expect(audit).not.toBeNull()
      })

      it('refuses a stale version with 412', async () => {
        const s = await makeSupplier()
        const key = await upload(s.id)
        const created = await one(await record(s.id, { type: 'CATALOG', storageKey: key }))

        const edit = (title: string) =>
          patchDoc(
            req(`/api/suppliers/${s.id}/documents/${created.id}`, {
              method: 'PATCH',
              headers: { 'if-match': `W/"v${created.version}"` },
              body: JSON.stringify({ title }),
            }),
            ctx(s.id, created.id),
          )

        await edit('First write')
        const stale = await edit('Second')
        expect(stale.status).toBe(412)

        const row = await prisma.supplierDocument.findUniqueOrThrow({ where: { id: created.id } })
        expect(row.title).toBe('First write')
      })
    })

    describe('delete', () => {
      it('soft-deletes and drops it from the list', async () => {
        const s = await makeSupplier()
        const key = await upload(s.id)
        const created = await one(await record(s.id, { type: 'CATALOG', storageKey: key }))

        const res = await deleteDoc(
          req(`/api/suppliers/${s.id}/documents/${created.id}`, {
            method: 'DELETE',
            headers: { 'if-match': `W/"v${created.version}"` },
          }),
          ctx(s.id, created.id),
        )
        expect(res.status).toBe(200)

        const list = await listDocs(req(`/api/suppliers/${s.id}/documents`), ctx(s.id))
        expect((await rows(list)).map((r) => r.id)).not.toContain(created.id)

        const row = await prisma.supplierDocument.findUniqueOrThrow({ where: { id: created.id } })
        expect(row.deletedAt).not.toBeNull()
      })
    })

    describe('ordering', () => {
      it('puts the newest first', async () => {
        const s = await makeSupplier()
        for (const title of ['oldest', 'middle', 'newest']) {
          const key = await upload(s.id)
          await record(s.id, { type: 'OTHER', storageKey: key, title })
        }
        const list = await listDocs(req(`/api/suppliers/${s.id}/documents`), ctx(s.id))
        expect((await rows(list)).map((r) => r.title)).toEqual(['newest', 'middle', 'oldest'])
      })
    })
  },
)
