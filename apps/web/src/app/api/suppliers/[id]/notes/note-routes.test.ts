// @vitest-environment node
import { buildAbilityFor, type Role } from '@triyara/auth'
import { NotFoundError, PreconditionFailedError } from '@triyara/lib'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Supplier note routes in isolation: auth and the service are mocked, so these
// assert the HTTP contract (envelope, status, ETag/If-Match, validation,
// delegation) rather than re-testing service behaviour.

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

const supplierNoteService = { list: vi.fn(), add: vi.fn(), update: vi.fn(), remove: vi.fn() }

vi.mock('@/lib/supplier-master-service', () => ({
  supplierMasterService: {},
  supplierOfferingService: {},
  supplierNoteService,
}))

const { GET: listNotes, POST: addNote } = await import('./route')
const { PATCH: patchNote, DELETE: deleteNote } = await import('./[noteId]/route')

const req = (url: string, init?: RequestInit) => new Request(`http://t.test${url}`, init)
const params = (id: string) => ({ params: Promise.resolve({ id }) })
const noteParams = (id: string, noteId: string) => ({ params: Promise.resolve({ id, noteId }) })
const body = async (res: Response) =>
  (await res.json()) as {
    success: boolean
    data: never
    meta: { requestId: string; [k: string]: unknown }
    errors: Array<{ code: string; message: string; field?: string }> | null
  }

const note = (over: Record<string, unknown> = {}) => ({
  id: 'n1',
  supplierId: 's1',
  authorId: 'u1',
  body: 'Quoted $1800 CIF Jebel Ali',
  source: 'WHATSAPP',
  editedAt: null,
  version: 1,
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-08-01T10:00:00.000Z',
  deletedAt: null,
  author: { id: 'u1', name: 'Priya', email: 'a@b.com' },
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  authState.roles = ['ADMIN']
})

describe('GET /api/suppliers/:id/notes', () => {
  it('returns the envelope with pagination and filters in meta', async () => {
    supplierNoteService.list.mockResolvedValue({ items: [note()], nextCursor: 'cur1' })
    const res = await listNotes(
      req('/api/suppliers/s1/notes?limit=5&source=WHATSAPP'),
      params('s1'),
    )
    const b = await body(res)

    expect(res.status).toBe(200)
    expect(b.success).toBe(true)
    expect(b.errors).toBeNull()
    expect(b.data).toHaveLength(1)
    expect(b.meta.supplierId).toBe('s1')
    expect(b.meta.pagination).toEqual({ limit: 5, nextCursor: 'cur1' })
    expect(b.meta.filters).toMatchObject({ source: 'WHATSAPP' })
  })

  it('takes the supplier from the path, never from the query', async () => {
    supplierNoteService.list.mockResolvedValue({ items: [], nextCursor: null })
    // A supplierId in the query must not redirect the read to another supplier.
    await listNotes(req('/api/suppliers/s1/notes?supplierId=s999'), params('s1'))
    expect(supplierNoteService.list).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org1' }),
      's1',
      expect.any(Object),
    )
  })

  it('rejects an unknown channel with 422', async () => {
    const res = await listNotes(req('/api/suppliers/s1/notes?source=CARRIER_PIGEON'), params('s1'))
    expect(res.status).toBe(422)
    expect(supplierNoteService.list).not.toHaveBeenCalled()
  })

  it('surfaces an invisible supplier as 404', async () => {
    supplierNoteService.list.mockRejectedValue(new NotFoundError('Supplier not found.'))
    const res = await listNotes(req('/api/suppliers/sX/notes'), params('sX'))
    expect(res.status).toBe(404)
  })
})

describe('POST /api/suppliers/:id/notes', () => {
  it('creates a note and returns 201 with an ETag', async () => {
    supplierNoteService.add.mockResolvedValue(note({ version: 1 }))
    const res = await addNote(
      req('/api/suppliers/s1/notes', {
        method: 'POST',
        body: JSON.stringify({ body: 'Quoted $1800 CIF Jebel Ali', source: 'WHATSAPP' }),
      }),
      params('s1'),
    )

    expect(res.status).toBe(201)
    expect(res.headers.get('ETag')).toBe('W/"v1"')
    expect(supplierNoteService.add).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org1' }),
      's1',
      expect.objectContaining({ body: 'Quoted $1800 CIF Jebel Ali', source: 'WHATSAPP' }),
    )
  })

  it('accepts a note with no channel', async () => {
    supplierNoteService.add.mockResolvedValue(note({ source: null }))
    const res = await addNote(
      req('/api/suppliers/s1/notes', {
        method: 'POST',
        body: JSON.stringify({ body: 'Walk-in.' }),
      }),
      params('s1'),
    )
    expect(res.status).toBe(201)
  })

  it('rejects a whitespace-only note with 422', async () => {
    // An all-spaces body would otherwise sit in the timeline saying nothing.
    const res = await addNote(
      req('/api/suppliers/s1/notes', { method: 'POST', body: JSON.stringify({ body: '   ' }) }),
      params('s1'),
    )
    expect(res.status).toBe(422)
    expect(supplierNoteService.add).not.toHaveBeenCalled()
  })

  it('rejects a note past the length ceiling with 422', async () => {
    const res = await addNote(
      req('/api/suppliers/s1/notes', {
        method: 'POST',
        body: JSON.stringify({ body: 'x'.repeat(10_001) }),
      }),
      params('s1'),
    )
    expect(res.status).toBe(422)
  })

  it('forbids a reader from writing a note', async () => {
    authState.roles = ['READ_ONLY']
    supplierNoteService.add.mockRejectedValue(
      Object.assign(new Error('Forbidden'), { code: 'FORBIDDEN', httpStatus: 403 }),
    )
    const res = await addNote(
      req('/api/suppliers/s1/notes', { method: 'POST', body: JSON.stringify({ body: 'nope' }) }),
      params('s1'),
    )
    expect(res.status).not.toBe(201)
  })
})

describe('PATCH /api/suppliers/:id/notes/:noteId', () => {
  it('requires If-Match and answers 428 without it', async () => {
    const res = await patchNote(
      req('/api/suppliers/s1/notes/n1', {
        method: 'PATCH',
        body: JSON.stringify({ body: 'revised' }),
      }),
      noteParams('s1', 'n1'),
    )
    expect(res.status).toBe(428)
    expect(supplierNoteService.update).not.toHaveBeenCalled()
  })

  it('forwards the parsed version from If-Match', async () => {
    supplierNoteService.update.mockResolvedValue(note({ version: 4, editedAt: 'now' }))
    const res = await patchNote(
      req('/api/suppliers/s1/notes/n1', {
        method: 'PATCH',
        headers: { 'If-Match': 'W/"v3"' },
        body: JSON.stringify({ body: 'revised' }),
      }),
      noteParams('s1', 'n1'),
    )

    expect(res.status).toBe(200)
    expect(res.headers.get('ETag')).toBe('W/"v4"')
    expect(supplierNoteService.update).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org1' }),
      's1',
      'n1',
      3,
      expect.objectContaining({ body: 'revised' }),
    )
  })

  it('maps a stale version to 412', async () => {
    supplierNoteService.update.mockRejectedValue(new PreconditionFailedError())
    const res = await patchNote(
      req('/api/suppliers/s1/notes/n1', {
        method: 'PATCH',
        headers: { 'If-Match': 'W/"v1"' },
        body: JSON.stringify({ body: 'revised' }),
      }),
      noteParams('s1', 'n1'),
    )
    expect(res.status).toBe(412)
  })

  it('rejects an empty patch with 422', async () => {
    const res = await patchNote(
      req('/api/suppliers/s1/notes/n1', {
        method: 'PATCH',
        headers: { 'If-Match': 'W/"v1"' },
        body: JSON.stringify({}),
      }),
      noteParams('s1', 'n1'),
    )
    expect(res.status).toBe(422)
    expect(supplierNoteService.update).not.toHaveBeenCalled()
  })

  it('allows clearing the channel with an explicit null', async () => {
    supplierNoteService.update.mockResolvedValue(note({ source: null, version: 2 }))
    const res = await patchNote(
      req('/api/suppliers/s1/notes/n1', {
        method: 'PATCH',
        headers: { 'If-Match': 'W/"v1"' },
        body: JSON.stringify({ source: null }),
      }),
      noteParams('s1', 'n1'),
    )
    expect(res.status).toBe(200)
    expect(supplierNoteService.update).toHaveBeenCalledWith(
      expect.anything(),
      's1',
      'n1',
      1,
      expect.objectContaining({ source: null }),
    )
  })

  it('surfaces a note reached through the wrong supplier as 404', async () => {
    supplierNoteService.update.mockRejectedValue(new NotFoundError('Note not found.'))
    const res = await patchNote(
      req('/api/suppliers/s2/notes/n1', {
        method: 'PATCH',
        headers: { 'If-Match': 'W/"v1"' },
        body: JSON.stringify({ body: 'x' }),
      }),
      noteParams('s2', 'n1'),
    )
    expect(res.status).toBe(404)
  })
})

describe('DELETE /api/suppliers/:id/notes/:noteId', () => {
  it('requires If-Match and answers 428 without it', async () => {
    const res = await deleteNote(
      req('/api/suppliers/s1/notes/n1', { method: 'DELETE' }),
      noteParams('s1', 'n1'),
    )
    expect(res.status).toBe(428)
    expect(supplierNoteService.remove).not.toHaveBeenCalled()
  })

  it('soft deletes and returns the tombstone', async () => {
    supplierNoteService.remove.mockResolvedValue(
      note({ version: 2, deletedAt: '2026-08-02T00:00:00.000Z' }),
    )
    const res = await deleteNote(
      req('/api/suppliers/s1/notes/n1', { method: 'DELETE', headers: { 'If-Match': 'W/"v1"' } }),
      noteParams('s1', 'n1'),
    )
    const b = await body(res)

    expect(res.status).toBe(200)
    expect(b.data).toEqual({ id: 'n1', deletedAt: '2026-08-02T00:00:00.000Z' })
    expect(supplierNoteService.remove).toHaveBeenCalledWith(expect.anything(), 's1', 'n1', 1)
  })

  it('maps a stale version to 412', async () => {
    supplierNoteService.remove.mockRejectedValue(new PreconditionFailedError())
    const res = await deleteNote(
      req('/api/suppliers/s1/notes/n1', { method: 'DELETE', headers: { 'If-Match': 'W/"v9"' } }),
      noteParams('s1', 'n1'),
    )
    expect(res.status).toBe(412)
  })

  it('maps a missing note to 404, never to a conflict', async () => {
    supplierNoteService.remove.mockRejectedValue(new NotFoundError('Note not found.'))
    const res = await deleteNote(
      req('/api/suppliers/s1/notes/nX', { method: 'DELETE', headers: { 'If-Match': 'W/"v1"' } }),
      noteParams('s1', 'nX'),
    )
    expect(res.status).toBe(404)
  })
})
