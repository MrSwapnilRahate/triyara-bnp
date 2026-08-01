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

const supplierDocumentService = {
  list: vi.fn(),
  presign: vi.fn(),
  add: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  fileUrl: vi.fn(),
}
vi.mock('@/lib/supplier-master-service', () => ({ supplierDocumentService }))

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

const doc = (over: Record<string, unknown> = {}) => ({
  id: 'd1',
  supplierId: 's1',
  type: 'CATALOG',
  title: 'Spice catalogue 2026',
  fileUrl: null,
  storageKey: 'org1/suppliers/s1/uuid/catalogue.pdf',
  mimeType: 'application/pdf',
  fileSize: 204800,
  checksum: 'abc123',
  documentNumber: null,
  issuedDate: null,
  expiryDate: null,
  documentId: null,
  version: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...over,
})

describe('supplier document routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState.roles = ['ADMIN']
    supplierDocumentService.list.mockResolvedValue([doc()])
    supplierDocumentService.add.mockResolvedValue(doc())
    supplierDocumentService.update.mockResolvedValue(doc({ version: 2 }))
    supplierDocumentService.remove.mockResolvedValue(doc({ version: 2 }))
    supplierDocumentService.presign.mockResolvedValue({
      uploadUrl: 'http://storage.test/put',
      method: 'PUT',
      headers: {},
      storageKey: 'org1/suppliers/s1/uuid/catalogue.pdf',
      expiresAt: new Date().toISOString(),
    })
    supplierDocumentService.fileUrl.mockResolvedValue('http://storage.test/signed')
  })

  describe('GET /suppliers/:id/documents', () => {
    it('returns them in the platform envelope', async () => {
      const res = await listDocs(req('/api/suppliers/s1/documents'), ctx('s1'))
      const payload = await body(res)

      expect(res.status).toBe(200)
      expect(payload.success).toBe(true)
      expect(payload.meta).toMatchObject({ supplierId: 's1', count: 1 })
    })

    it('translates a missing supplier into 404', async () => {
      supplierDocumentService.list.mockRejectedValue(new NotFoundError('Supplier not found.'))
      const res = await listDocs(req('/api/suppliers/x/documents'), ctx('x'))
      expect(res.status).toBe(404)
    })
  })

  describe('POST /suppliers/:id/documents/presign', () => {
    const post = (payload: unknown) =>
      presign(
        req('/api/suppliers/s1/documents/presign', {
          method: 'POST',
          body: JSON.stringify(payload),
        }),
        ctx('s1'),
      )

    it('returns an upload target', async () => {
      const res = await post({
        fileName: 'catalogue.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 204800,
      })
      const payload = await body(res)

      expect(res.status).toBe(200)
      expect(payload.data).toMatchObject({ method: 'PUT' })
    })

    it('rejects a mime type outside the platform allow-list', async () => {
      const res = await post({
        fileName: 'x.exe',
        mimeType: 'application/x-msdownload',
        sizeBytes: 10,
      })
      expect(res.status).toBe(422)
      expect(supplierDocumentService.presign).not.toHaveBeenCalled()
    })

    it('rejects a file over the size ceiling', async () => {
      const res = await post({
        fileName: 'huge.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 21 * 1024 * 1024,
      })
      expect(res.status).toBe(422)
      expect(supplierDocumentService.presign).not.toHaveBeenCalled()
    })
  })

  describe('POST /suppliers/:id/documents', () => {
    const post = (payload: unknown) =>
      addDoc(
        req('/api/suppliers/s1/documents', { method: 'POST', body: JSON.stringify(payload) }),
        ctx('s1'),
      )

    it('records and returns 201 with an ETag', async () => {
      const res = await post({ type: 'CATALOG', storageKey: 'k', title: 'Catalogue' })

      expect(res.status).toBe(201)
      expect(res.headers.get('ETag')).toBe('W/"v1"')
    })

    it('rejects a missing storage key with 422', async () => {
      const res = await post({ type: 'CATALOG' })
      expect(res.status).toBe(422)
      expect(supplierDocumentService.add).not.toHaveBeenCalled()
    })

    it('rejects an unknown document type with 422', async () => {
      const res = await post({ type: 'NOT_A_TYPE', storageKey: 'k' })
      expect(res.status).toBe(422)
      expect(supplierDocumentService.add).not.toHaveBeenCalled()
    })

    it('ignores a client-supplied fileSize, which storage decides', async () => {
      await post({ type: 'CATALOG', storageKey: 'k', fileSize: 999999 })
      const [, , dto] = supplierDocumentService.add.mock.calls[0] as [unknown, string, object]
      expect(dto).not.toHaveProperty('fileSize')
    })

    it('surfaces a missing upload as 422', async () => {
      supplierDocumentService.add.mockRejectedValue(
        new ValidationError('That upload was not found. Try uploading again.'),
      )
      const res = await post({ type: 'CATALOG', storageKey: 'gone' })
      expect(res.status).toBe(422)
    })
  })

  describe('PATCH /suppliers/:id/documents/:documentId', () => {
    const patch = (payload: unknown, headers?: Record<string, string>) =>
      patchDoc(
        req('/api/suppliers/s1/documents/d1', {
          method: 'PATCH',
          body: JSON.stringify(payload),
          ...(headers ? { headers } : {}),
        }),
        ctx('s1', 'd1'),
      )

    it('requires If-Match', async () => {
      const res = await patch({ title: 'x' })
      expect(res.status).toBe(428)
      expect(supplierDocumentService.update).not.toHaveBeenCalled()
    })

    it('passes the expected version through', async () => {
      const res = await patch({ title: 'Newer catalogue' }, { 'if-match': 'W/"v1"' })
      expect(res.status).toBe(200)
      expect(supplierDocumentService.update).toHaveBeenCalledWith(
        expect.anything(),
        's1',
        'd1',
        1,
        expect.objectContaining({ title: 'Newer catalogue' }),
      )
    })

    it('carries a new storage key when the file is replaced', async () => {
      await patch({ storageKey: 'newer' }, { 'if-match': 'W/"v1"' })
      expect(supplierDocumentService.update).toHaveBeenCalledWith(
        expect.anything(),
        's1',
        'd1',
        1,
        { storageKey: 'newer' },
      )
    })

    it('translates a stale version into 412', async () => {
      supplierDocumentService.update.mockRejectedValue(new PreconditionFailedError())
      const res = await patch({ title: 'x' }, { 'if-match': 'W/"v1"' })
      expect(res.status).toBe(412)
    })
  })

  describe('DELETE /suppliers/:id/documents/:documentId', () => {
    it('requires If-Match', async () => {
      const res = await deleteDoc(
        req('/api/suppliers/s1/documents/d1', { method: 'DELETE' }),
        ctx('s1', 'd1'),
      )
      expect(res.status).toBe(428)
      expect(supplierDocumentService.remove).not.toHaveBeenCalled()
    })

    it('removes with the expected version', async () => {
      const res = await deleteDoc(
        req('/api/suppliers/s1/documents/d1', {
          method: 'DELETE',
          headers: { 'if-match': 'W/"v1"' },
        }),
        ctx('s1', 'd1'),
      )
      expect(res.status).toBe(200)
      expect(supplierDocumentService.remove).toHaveBeenCalledWith(expect.anything(), 's1', 'd1', 1)
    })
  })

  describe('GET /suppliers/:id/documents/:documentId/download', () => {
    it('redirects to a signed URL', async () => {
      const res = await download(req('/api/suppliers/s1/documents/d1/download'), ctx('s1', 'd1'))
      expect(res.status).toBe(302)
      expect(supplierDocumentService.fileUrl).toHaveBeenCalledWith(
        expect.anything(),
        's1',
        'd1',
        'attachment',
      )
    })

    it('honours ?disposition=inline so a photograph previews', async () => {
      await download(
        req('/api/suppliers/s1/documents/d1/download?disposition=inline'),
        ctx('s1', 'd1'),
      )
      expect(supplierDocumentService.fileUrl).toHaveBeenCalledWith(
        expect.anything(),
        's1',
        'd1',
        'inline',
      )
    })

    it('answers 404 when the file is gone', async () => {
      supplierDocumentService.fileUrl.mockRejectedValue(new NotFoundError('Document not found.'))
      const res = await download(req('/api/suppliers/s1/documents/d1/download'), ctx('s1', 'd1'))
      expect(res.status).toBe(404)
    })
  })
})
