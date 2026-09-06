// @vitest-environment node
import { buildAbilityFor, type Role } from '@triyara/auth'
import { UnauthenticatedError } from '@triyara/lib'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Route layer in isolation: auth context and the avatar service are mocked, so
// these assert the HTTP contract - who is let in, what is delegated, and what
// the image response actually says - rather than re-testing the service.

const authState = { roles: ['ADMIN'] as Role[], organizationId: 'org1', userId: 'u1', ok: true }

vi.mock('@/auth/context', () => ({
  requireAuth: vi.fn(async () => {
    if (!authState.ok) throw new UnauthenticatedError()
    return {
      user: {
        id: authState.userId,
        organizationId: authState.organizationId,
        email: 'a@b.com',
        name: 'A',
        roles: authState.roles,
      },
      organizationId: authState.organizationId,
      ability: buildAbilityFor(authState.roles),
    }
  }),
}))

const avatarService = {
  presign: vi.fn(),
  confirm: vi.fn(),
  remove: vi.fn(),
  read: vi.fn(),
  stat: vi.fn(),
}
vi.mock('@/lib/avatar-service', () => ({ avatarService }))

const { POST: presign } = await import('./me/avatar/presign/route')
const { PUT: confirm, DELETE: removeAvatar } = await import('./me/avatar/route')
const { GET: getAvatar } = await import('./users/[id]/avatar/route')

const req = (url: string, init?: RequestInit) => new Request(`http://t.test${url}`, init)
const params = (id: string) => ({ params: Promise.resolve({ id }) })
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])

beforeEach(() => {
  vi.clearAllMocks()
  authState.ok = true
  authState.organizationId = 'org1'
  authState.userId = 'u1'
})

describe('an unauthenticated caller reaches none of it', () => {
  it('cannot presign an upload', async () => {
    authState.ok = false
    const res = await presign(
      req('/api/v1/me/avatar/presign', {
        method: 'POST',
        body: JSON.stringify({ mimeType: 'image/png', sizeBytes: 10 }),
      }),
    )
    expect(res.status).toBe(401)
    expect(avatarService.presign).not.toHaveBeenCalled()
  })

  it('cannot confirm an upload', async () => {
    authState.ok = false
    const res = await confirm(req('/api/v1/me/avatar', { method: 'PUT', body: '{}' }))
    expect(res.status).toBe(401)
    expect(avatarService.confirm).not.toHaveBeenCalled()
  })

  it('cannot read an avatar', async () => {
    authState.ok = false
    const res = await getAvatar(req('/api/v1/users/u2/avatar'), params('u2'))
    // 404 rather than 401: an image endpoint that answered differently for
    // "not signed in" would describe the tenancy behind it.
    expect(res.status).toBe(404)
    expect(avatarService.stat).not.toHaveBeenCalled()
  })
})

describe('uploading is scoped to the session, not to anything in the request', () => {
  it('presigns without passing any caller-supplied identity', async () => {
    avatarService.presign.mockResolvedValue({ uploadUrl: '/up', method: 'PUT', headers: {} })

    const res = await presign(
      req('/api/v1/me/avatar/presign', {
        method: 'POST',
        // A hopeful client sends someone else's ids. The schema drops them and
        // the service is never given them.
        body: JSON.stringify({
          mimeType: 'image/png',
          sizeBytes: 10,
          userId: 'victim',
          storageKey: 'other-org/avatars/victim',
        }),
      }),
    )

    expect(res.status).toBe(200)
    const [, dto] = avatarService.presign.mock.calls[0]!
    expect(dto).toEqual({ mimeType: 'image/png', sizeBytes: 10 })
    expect(JSON.stringify(dto)).not.toContain('victim')
  })

  it('refuses a type outside the image allow-list', async () => {
    const res = await presign(
      req('/api/v1/me/avatar/presign', {
        method: 'POST',
        body: JSON.stringify({ mimeType: 'application/pdf', sizeBytes: 10 }),
      }),
    )
    expect(res.status).toBe(422)
    expect(avatarService.presign).not.toHaveBeenCalled()
  })

  it('refuses a declared size above the cap', async () => {
    const res = await presign(
      req('/api/v1/me/avatar/presign', {
        method: 'POST',
        body: JSON.stringify({ mimeType: 'image/png', sizeBytes: 50 * 1024 * 1024 }),
      }),
    )
    expect(res.status).toBe(422)
    expect(avatarService.presign).not.toHaveBeenCalled()
  })

  it('confirms and returns the stored app-relative path', async () => {
    avatarService.confirm.mockResolvedValue({ avatarUrl: '/api/v1/users/u1/avatar' })
    const res = await confirm(req('/api/v1/me/avatar', { method: 'PUT', body: '{}' }))
    expect(res.status).toBe(200)
    expect(((await res.json()) as { data: { avatarUrl: string } }).data.avatarUrl).toBe(
      '/api/v1/users/u1/avatar',
    )
  })

  it('removes, and answers with a cleared avatar', async () => {
    avatarService.remove.mockResolvedValue(undefined)
    const res = await removeAvatar(req('/api/v1/me/avatar', { method: 'DELETE' }))
    expect(res.status).toBe(200)
    expect(((await res.json()) as { data: { avatarUrl: null } }).data.avatarUrl).toBeNull()
  })
})

describe('serving an avatar', () => {
  it('returns the bytes with the stored type and a private cache', async () => {
    avatarService.stat.mockResolvedValue({ size: PNG.byteLength, checksum: 'abc123' })
    avatarService.read.mockResolvedValue({ bytes: PNG, contentType: 'image/png' })

    const res = await getAvatar(req('/api/v1/users/u2/avatar'), params('u2'))

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(res.headers.get('etag')).toBe('"abc123"')
    const cache = res.headers.get('cache-control') ?? ''
    expect(cache).toContain('private')
    // A shared cache keyed on this URL alone could hand one organization's
    // photo to another, because the path is identical for every viewer.
    expect(cache).not.toContain('public')
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG)
  })

  it('falls back to sniffing when the store recorded no type', async () => {
    avatarService.stat.mockResolvedValue({ size: PNG.byteLength, checksum: 'abc123' })
    avatarService.read.mockResolvedValue({ bytes: PNG, contentType: null })

    const res = await getAvatar(req('/api/v1/users/u2/avatar'), params('u2'))

    // nosniff is set on every response, so a wrong type would not render.
    expect(res.headers.get('content-type')).toBe('image/png')
  })

  it('refuses to serve bytes it cannot identify as an allowed image', async () => {
    avatarService.stat.mockResolvedValue({ size: 4, checksum: 'x' })
    avatarService.read.mockResolvedValue({ bytes: new Uint8Array([1, 2, 3, 4]), contentType: null })

    const res = await getAvatar(req('/api/v1/users/u2/avatar'), params('u2'))
    expect(res.status).toBe(404)
  })

  it('is a 404 when the user has no photo', async () => {
    avatarService.stat.mockResolvedValue(null)
    const res = await getAvatar(req('/api/v1/users/u2/avatar'), params('u2'))
    expect(res.status).toBe(404)
    expect(avatarService.read).not.toHaveBeenCalled()
  })

  it('answers a revalidating browser with 304 and never reads the bytes', async () => {
    avatarService.stat.mockResolvedValue({ size: 10, checksum: 'abc123' })

    const res = await getAvatar(
      req('/api/v1/users/u2/avatar', { headers: { 'if-none-match': '"abc123"' } }),
      params('u2'),
    )

    expect(res.status).toBe(304)
    expect(avatarService.read).not.toHaveBeenCalled()
  })

  it('passes the caller’s own organization, so the id cannot cross tenants', async () => {
    avatarService.stat.mockResolvedValue({ size: 10, checksum: 'c' })
    avatarService.read.mockResolvedValue({ bytes: PNG, contentType: 'image/png' })
    authState.organizationId = 'org-mine'

    await getAvatar(req('/api/v1/users/someone-elsewhere/avatar'), params('someone-elsewhere'))

    const [ctx, userId] = avatarService.stat.mock.calls[0]!
    expect((ctx as { organizationId: string }).organizationId).toBe('org-mine')
    expect(userId).toBe('someone-elsewhere')
  })
})
