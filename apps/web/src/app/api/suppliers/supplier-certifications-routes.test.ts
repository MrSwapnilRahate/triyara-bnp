// @vitest-environment node
import { buildAbilityFor, type Role } from '@triyara/auth'
import { NotFoundError, PreconditionFailedError, ValidationError } from '@triyara/lib'
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

const supplierCertificationService = {
  list: vi.fn(),
  add: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}
vi.mock('@/lib/supplier-master-service', () => ({ supplierCertificationService }))

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
    errors: Array<{ code: string; message: string; field?: string }> | null
  }

const cert = (over: Record<string, unknown> = {}) => ({
  id: 'k1',
  supplierId: 's1',
  type: 'FSSAI',
  certificateNumber: 'FS-123456',
  issuedBy: 'FSSAI',
  issuedDate: '2026-01-01T00:00:00.000Z',
  expiryDate: '2027-01-01T00:00:00.000Z',
  status: 'ACTIVE',
  scope: null,
  supplierDocumentId: null,
  version: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...over,
})

describe('supplier certification routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState.roles = ['ADMIN']
    supplierCertificationService.list.mockResolvedValue([cert()])
    supplierCertificationService.add.mockResolvedValue(cert())
    supplierCertificationService.update.mockResolvedValue(cert({ version: 2 }))
    supplierCertificationService.remove.mockResolvedValue(cert({ version: 2 }))
  })

  describe('GET /suppliers/:id/certifications', () => {
    it('returns them in the platform envelope', async () => {
      const res = await listCerts(req('/api/suppliers/s1/certifications'), ctx('s1'))
      const payload = await body(res)

      expect(res.status).toBe(200)
      expect(payload.success).toBe(true)
      expect(payload.errors).toBeNull()
      expect(payload.meta).toMatchObject({ supplierId: 's1', count: 1 })
    })

    it('passes the supplier id from the path', async () => {
      await listCerts(req('/api/suppliers/s9/certifications'), ctx('s9'))
      expect(supplierCertificationService.list).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'org1' }),
        's9',
      )
    })

    it('translates a missing supplier into 404', async () => {
      supplierCertificationService.list.mockRejectedValue(new NotFoundError('Supplier not found.'))
      const res = await listCerts(req('/api/suppliers/nope/certifications'), ctx('nope'))
      expect(res.status).toBe(404)
    })
  })

  describe('POST /suppliers/:id/certifications', () => {
    const post = (payload: unknown) =>
      addCert(
        req('/api/suppliers/s1/certifications', {
          method: 'POST',
          body: JSON.stringify(payload),
        }),
        ctx('s1'),
      )

    it('creates and returns 201 with an ETag', async () => {
      const res = await post({ type: 'FSSAI', certificateNumber: 'FS-123456' })

      expect(res.status).toBe(201)
      expect(res.headers.get('ETag')).toBe('W/"v1"')
      expect(supplierCertificationService.add).toHaveBeenCalledWith(
        expect.anything(),
        's1',
        expect.objectContaining({ type: 'FSSAI', certificateNumber: 'FS-123456' }),
      )
    })

    it('rejects a missing certificate number with 422', async () => {
      const res = await post({ type: 'FSSAI' })
      expect(res.status).toBe(422)
      expect(supplierCertificationService.add).not.toHaveBeenCalled()
    })

    it('rejects an unknown certification type with 422', async () => {
      const res = await post({ type: 'DEFINITELY_NOT_REAL', certificateNumber: 'X' })
      expect(res.status).toBe(422)
      expect(supplierCertificationService.add).not.toHaveBeenCalled()
    })

    it('rejects an unknown status with 422', async () => {
      const res = await post({ type: 'FSSAI', certificateNumber: 'X', status: 'MAYBE' })
      expect(res.status).toBe(422)
      expect(supplierCertificationService.add).not.toHaveBeenCalled()
    })

    it('coerces the date strings a date input produces', async () => {
      const res = await post({
        type: 'HACCP',
        certificateNumber: 'H-1',
        issuedDate: '2026-01-01',
        expiryDate: '2027-01-01',
      })

      expect(res.status).toBe(201)
      const [, , dto] = supplierCertificationService.add.mock.calls[0] as [
        unknown,
        string,
        { issuedDate: Date; expiryDate: Date },
      ]
      expect(dto.issuedDate).toBeInstanceOf(Date)
      expect(dto.expiryDate).toBeInstanceOf(Date)
    })

    it('surfaces the date-order rule as 422', async () => {
      supplierCertificationService.add.mockRejectedValue(
        new ValidationError('The expiry date must fall after the issue date.'),
      )
      const res = await post({ type: 'FSSAI', certificateNumber: 'X' })
      expect(res.status).toBe(422)
    })
  })

  describe('PATCH /suppliers/:id/certifications/:certificationId', () => {
    const patch = (payload: unknown, headers?: Record<string, string>) =>
      patchCert(
        req('/api/suppliers/s1/certifications/k1', {
          method: 'PATCH',
          body: JSON.stringify(payload),
          ...(headers ? { headers } : {}),
        }),
        ctx('s1', 'k1'),
      )

    it('requires If-Match, answering 428 without one', async () => {
      const res = await patch({ certificateNumber: 'FS-999' })
      expect(res.status).toBe(428)
      expect(supplierCertificationService.update).not.toHaveBeenCalled()
    })

    it('passes the expected version through', async () => {
      const res = await patch({ certificateNumber: 'FS-999' }, { 'if-match': 'W/"v1"' })

      expect(res.status).toBe(200)
      expect(supplierCertificationService.update).toHaveBeenCalledWith(
        expect.anything(),
        's1',
        'k1',
        1,
        expect.objectContaining({ certificateNumber: 'FS-999' }),
      )
    })

    it('returns the new ETag so the next edit can be guarded', async () => {
      const res = await patch({ certificateNumber: 'FS-999' }, { 'if-match': 'W/"v1"' })
      expect(res.headers.get('ETag')).toBe('W/"v2"')
    })

    it('accepts a lone status change, which is how a lapse is recorded', async () => {
      await patch({ status: 'SUSPENDED' }, { 'if-match': 'W/"v1"' })
      expect(supplierCertificationService.update).toHaveBeenCalledWith(
        expect.anything(),
        's1',
        'k1',
        1,
        { status: 'SUSPENDED' },
      )
    })

    it('translates a stale version into 412', async () => {
      supplierCertificationService.update.mockRejectedValue(new PreconditionFailedError())
      const res = await patch({ status: 'EXPIRED' }, { 'if-match': 'W/"v1"' })
      expect(res.status).toBe(412)
    })
  })

  describe('DELETE /suppliers/:id/certifications/:certificationId', () => {
    const del = (headers?: Record<string, string>) =>
      deleteCert(
        req('/api/suppliers/s1/certifications/k1', {
          method: 'DELETE',
          ...(headers ? { headers } : {}),
        }),
        ctx('s1', 'k1'),
      )

    it('requires If-Match', async () => {
      const res = await del()
      expect(res.status).toBe(428)
      expect(supplierCertificationService.remove).not.toHaveBeenCalled()
    })

    it('removes with the expected version', async () => {
      const res = await del({ 'if-match': 'W/"v1"' })

      expect(res.status).toBe(200)
      expect(supplierCertificationService.remove).toHaveBeenCalledWith(
        expect.anything(),
        's1',
        'k1',
        1,
      )
    })

    it('translates a stale version into 412', async () => {
      supplierCertificationService.remove.mockRejectedValue(new PreconditionFailedError())
      const res = await del({ 'if-match': 'W/"v1"' })
      expect(res.status).toBe(412)
    })
  })
})
