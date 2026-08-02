// @vitest-environment node
import { buildAbilityFor, type Role } from '@triyara/auth'
import { ConflictError, NotFoundError, PreconditionFailedError } from '@triyara/lib'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Route layer in isolation: auth context and the service are mocked, so these
// assert the HTTP contract - envelope, status, If-Match, delegation - and leave
// the business rules to the service and integration tests.

const authState = { roles: ['ADMIN'] as Role[], organizationId: 'org1', userId: 'u1' }

vi.mock('@/auth/context', () => ({
  requireAuth: vi.fn(async () => ({
    user: {
      id: authState.userId,
      organizationId: authState.organizationId,
      email: 'a@b.com',
      name: 'A',
      roles: authState.roles,
    },
    organizationId: authState.organizationId,
    ability: buildAbilityFor(authState.roles),
  })),
}))

const supplierContactService = { list: vi.fn(), add: vi.fn(), update: vi.fn(), remove: vi.fn() }
vi.mock('@/lib/supplier-master-service', () => ({ supplierContactService }))

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
    errors: Array<{ code: string; message: string; field?: string }> | null
  }

const contact = (over: Record<string, unknown> = {}) => ({
  id: 'c1',
  supplierId: 's1',
  name: 'Ravi Kumar',
  role: 'SALES',
  designation: null,
  email: 'ravi@spice.test',
  phone: null,
  whatsapp: '+919000000000',
  isPrimary: true,
  sortOrder: 10,
  notes: null,
  version: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...over,
})

describe('supplier contact routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState.roles = ['ADMIN']
    supplierContactService.list.mockResolvedValue([contact()])
    supplierContactService.add.mockResolvedValue(contact())
    supplierContactService.update.mockResolvedValue(contact({ version: 2 }))
    supplierContactService.remove.mockResolvedValue(contact({ version: 2 }))
  })

  describe('GET /suppliers/:id/contacts', () => {
    it('returns contacts in the platform envelope', async () => {
      const res = await listContacts(req('/api/suppliers/s1/contacts'), ctx('s1'))
      const payload = await body(res)

      expect(res.status).toBe(200)
      expect(payload.success).toBe(true)
      expect(payload.errors).toBeNull()
      expect(payload.meta).toMatchObject({ supplierId: 's1', count: 1 })
    })

    it('passes the supplier id from the path', async () => {
      await listContacts(req('/api/suppliers/s9/contacts'), ctx('s9'))
      expect(supplierContactService.list).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'org1' }),
        's9',
      )
    })

    it('translates a missing supplier into 404', async () => {
      supplierContactService.list.mockRejectedValue(new NotFoundError('Supplier not found.'))
      const res = await listContacts(req('/api/suppliers/nope/contacts'), ctx('nope'))
      expect(res.status).toBe(404)
    })
  })

  describe('POST /suppliers/:id/contacts', () => {
    const post = (payload: unknown, id = 's1') =>
      addContact(
        req(`/api/suppliers/${id}/contacts`, {
          method: 'POST',
          body: JSON.stringify(payload),
        }),
        ctx(id),
      )

    it('creates and returns 201 with an ETag', async () => {
      const res = await post({ name: 'Ravi Kumar', email: 'ravi@spice.test' })

      expect(res.status).toBe(201)
      expect(res.headers.get('ETag')).toBe('W/"v1"')
      expect(supplierContactService.add).toHaveBeenCalledWith(
        expect.anything(),
        's1',
        expect.objectContaining({ name: 'Ravi Kumar' }),
      )
    })

    it('rejects a nameless contact with 422', async () => {
      const res = await post({ email: 'ravi@spice.test' })
      expect(res.status).toBe(422)
      expect(supplierContactService.add).not.toHaveBeenCalled()
    })

    it('rejects an unknown role with 422', async () => {
      const res = await post({ name: 'Ravi', role: 'CHIEF_WIZARD', email: 'r@t.test' })
      expect(res.status).toBe(422)
      expect(supplierContactService.add).not.toHaveBeenCalled()
    })

    it('rejects a malformed email with 422', async () => {
      const res = await post({ name: 'Ravi', email: 'not-an-email' })
      expect(res.status).toBe(422)
      expect(supplierContactService.add).not.toHaveBeenCalled()
    })

    it('surfaces the unreachable-contact rule as 422', async () => {
      supplierContactService.add.mockRejectedValue(
        new ConflictError('Give at least one of email, phone or WhatsApp.'),
      )
      const res = await post({ name: 'Ravi' })
      expect([409, 422]).toContain(res.status)
    })
  })

  describe('PATCH /suppliers/:id/contacts/:contactId', () => {
    const patch = (payload: unknown, headers?: Record<string, string>) =>
      patchContact(
        req('/api/suppliers/s1/contacts/c1', {
          method: 'PATCH',
          body: JSON.stringify(payload),
          ...(headers ? { headers } : {}),
        }),
        ctx('s1', 'c1'),
      )

    it('requires If-Match, answering 428 without one', async () => {
      const res = await patch({ name: 'Ravi K' })
      expect(res.status).toBe(428)
      expect(supplierContactService.update).not.toHaveBeenCalled()
    })

    it('passes the expected version through', async () => {
      const res = await patch({ name: 'Ravi K' }, { 'if-match': 'W/"v1"' })

      expect(res.status).toBe(200)
      expect(supplierContactService.update).toHaveBeenCalledWith(
        expect.anything(),
        's1',
        'c1',
        1,
        expect.objectContaining({ name: 'Ravi K' }),
      )
    })

    it('returns the new ETag so the next edit can be guarded', async () => {
      const res = await patch({ name: 'Ravi K' }, { 'if-match': 'W/"v1"' })
      expect(res.headers.get('ETag')).toBe('W/"v2"')
    })

    it('accepts a lone isPrimary, which is how "make primary" is expressed', async () => {
      await patch({ isPrimary: true }, { 'if-match': 'W/"v1"' })
      expect(supplierContactService.update).toHaveBeenCalledWith(expect.anything(), 's1', 'c1', 1, {
        isPrimary: true,
      })
    })

    it('translates a stale version into 412', async () => {
      supplierContactService.update.mockRejectedValue(new PreconditionFailedError())
      const res = await patch({ name: 'x' }, { 'if-match': 'W/"v1"' })
      expect(res.status).toBe(412)
    })
  })

  describe('DELETE /suppliers/:id/contacts/:contactId', () => {
    const del = (headers?: Record<string, string>) =>
      deleteContact(
        req('/api/suppliers/s1/contacts/c1', {
          method: 'DELETE',
          ...(headers ? { headers } : {}),
        }),
        ctx('s1', 'c1'),
      )

    it('requires If-Match', async () => {
      const res = await del()
      expect(res.status).toBe(428)
      expect(supplierContactService.remove).not.toHaveBeenCalled()
    })

    it('removes with the expected version', async () => {
      const res = await del({ 'if-match': 'W/"v1"' })

      expect(res.status).toBe(200)
      expect(supplierContactService.remove).toHaveBeenCalledWith(expect.anything(), 's1', 'c1', 1)
    })

    it('translates a stale version into 412', async () => {
      supplierContactService.remove.mockRejectedValue(new PreconditionFailedError())
      const res = await del({ 'if-match': 'W/"v1"' })
      expect(res.status).toBe(412)
    })
  })
})
