import { buildAbilityFor } from '@triyara/auth'
import type { ObjectStat, StorageProvider } from '@triyara/storage'
import { updateProfileSchema } from '@triyara/validation'
import { describe, expect, it, vi } from 'vitest'

import { avatarPath, avatarStorageKey, createAvatarService } from './avatar.service'

/**
 * The avatar object key is the authorization, so most of what is worth asserting
 * here is about the key: who can address which one, and what happens to the
 * object when a photo is replaced or removed.
 */

const ORG = 'org-1'
const USER = 'user-1'

function ctx(organizationId = ORG, userId = USER) {
  return {
    user: {
      id: userId,
      organizationId,
      email: 'a@b.test',
      name: 'A',
      roles: ['ADMIN' as const],
      accountId: null,
    },
    organizationId,
    accountId: null,
    ability: buildAbilityFor(['ADMIN']),
  } as never
}

function storageDouble(stat: ObjectStat | null = { size: 1024, checksum: 'abc' }) {
  const calls: Record<string, string[]> = { upload: [], stat: [], read: [], delete: [] }
  const provider: StorageProvider = {
    createUploadUrl: async ({ storageKey }) => {
      calls.upload!.push(storageKey)
      return { uploadUrl: '/up', method: 'PUT', headers: {}, storageKey, expiresAt: 'x' }
    },
    createDownloadUrl: async () => '/dl',
    stat: async (key) => {
      calls.stat!.push(key)
      return stat
    },
    readObject: async (key) => {
      calls.read!.push(key)
      return stat ? { bytes: new Uint8Array([1, 2, 3]), contentType: 'image/png' } : null
    },
    delete: async (key) => {
      calls.delete!.push(key)
    },
  }
  return { provider, calls }
}

function service(storage: StorageProvider) {
  const updateProfile = vi.fn(async () => undefined)
  return { svc: createAvatarService({ users: { updateProfile }, storage }), updateProfile }
}

describe('the avatar object key', () => {
  it('is derived from the organization and the user, with no uuid', () => {
    expect(avatarStorageKey(ORG, USER)).toBe('org-1/avatars/user-1')
  })

  it('is the same key for the same user, so a replacement overwrites', () => {
    expect(avatarStorageKey(ORG, USER)).toBe(avatarStorageKey(ORG, USER))
  })

  it('is namespaced per organization, so two tenants cannot collide', () => {
    expect(avatarStorageKey('org-2', USER)).not.toBe(avatarStorageKey(ORG, USER))
  })
})

describe('uploading my own photo', () => {
  it('presigns the key belonging to the session, never one from a request', async () => {
    const { provider, calls } = storageDouble()
    const { svc } = service(provider)

    await svc.presign(ctx(), { mimeType: 'image/png', sizeBytes: 1024 })

    expect(calls.upload).toEqual(['org-1/avatars/user-1'])
  })

  it('cannot be aimed at another user: the key comes from the session alone', async () => {
    const { provider, calls } = storageDouble()
    const { svc } = service(provider)

    // A second signed-in user presigning gets THEIR key. There is no parameter
    // on this call through which the first user's key could be requested.
    await svc.presign(ctx(ORG, 'attacker'), { mimeType: 'image/png', sizeBytes: 10 })

    expect(calls.upload).toEqual(['org-1/avatars/attacker'])
    expect(calls.upload).not.toContain('org-1/avatars/user-1')
  })

  it('stores the app-relative path, never a presigned or absolute URL', async () => {
    const { provider } = storageDouble()
    const { svc, updateProfile } = service(provider)

    const result = await svc.confirm(ctx())

    expect(result.avatarUrl).toMatch(/^\/api\/v1\/users\/user-1\/avatar\?v=/)
    expect(result.avatarUrl).not.toMatch(/^https?:/)
    expect(updateProfile).toHaveBeenCalledWith(USER, { avatarUrl: result.avatarUrl })
  })

  it('refuses to confirm when nothing was actually uploaded', async () => {
    const { provider } = storageDouble(null)
    const { svc, updateProfile } = service(provider)

    await expect(svc.confirm(ctx())).rejects.toThrow(/upload before confirming/i)
    expect(updateProfile).not.toHaveBeenCalled()
  })
})

/**
 * A replaced photo has to become visible, and the object key deliberately does
 * not change - so the URL is the only thing that can carry the difference.
 * Without this the browser kept serving the previous image from its own cache
 * for the whole `max-age`, and a reload did not help because the client-side
 * cache-bust reset on remount.
 */
describe('the stored URL is versioned by the object itself', () => {
  it('carries the checksum of the bytes that were stored', async () => {
    const { provider } = storageDouble({ size: 10, checksum: 'abcdef0123456789beyond' })
    const { svc } = service(provider)

    const { avatarUrl } = await svc.confirm(ctx())

    expect(avatarUrl).toBe('/api/v1/users/user-1/avatar?v=abcdef0123456789')
  })

  it('changes when the image changes, which is what makes a replacement visible', async () => {
    const first = await service(
      storageDouble({ size: 10, checksum: 'aaaa1111' }).provider,
    ).svc.confirm(ctx())
    const second = await service(
      storageDouble({ size: 10, checksum: 'bbbb2222' }).provider,
    ).svc.confirm(ctx())

    expect(first.avatarUrl).not.toBe(second.avatarUrl)
  })

  it('stays the same for identical bytes, so an unchanged photo stays cached', async () => {
    const a = await service(storageDouble({ size: 10, checksum: 'same9999' }).provider).svc.confirm(
      ctx(),
    )
    const b = await service(storageDouble({ size: 10, checksum: 'same9999' }).provider).svc.confirm(
      ctx(),
    )

    expect(a.avatarUrl).toBe(b.avatarUrl)
  })

  it('survives an S3 multipart ETag, which is not plain hex', async () => {
    const { provider } = storageDouble({ size: 10, checksum: 'd41d8cd98f00b204e9800998ecf8427e-3' })
    const { svc } = service(provider)

    const { avatarUrl } = await svc.confirm(ctx())

    expect(avatarUrl).toBe('/api/v1/users/user-1/avatar?v=d41d8cd98f00b204')
  })

  it('is cleared entirely on removal, so the fallback is initials', async () => {
    const { provider } = storageDouble()
    const { svc, updateProfile } = service(provider)

    await svc.remove(ctx())

    expect(updateProfile).toHaveBeenCalledWith(USER, { avatarUrl: null })
  })
})

describe('the size limit is enforced against the stored object', () => {
  // The presigned PUT carries no length condition on S3 or R2, so the only
  // measurement that cannot be talked around is the one taken afterwards.
  it('rejects an oversized image even though presign accepted the declared size', async () => {
    const { provider, calls } = storageDouble({ size: 5 * 1024 * 1024, checksum: 'big' })
    const { svc, updateProfile } = service(provider)

    await expect(svc.confirm(ctx())).rejects.toThrow(/2 MB or smaller/i)
    expect(updateProfile).not.toHaveBeenCalled()
    // and it does not leave the oversized object sitting in the bucket
    expect(calls.delete).toEqual(['org-1/avatars/user-1'])
  })
})

describe('removing my photo', () => {
  it('deletes the deterministic object and clears the column', async () => {
    const { provider, calls } = storageDouble()
    const { svc, updateProfile } = service(provider)

    await svc.remove(ctx())

    expect(calls.delete).toEqual(['org-1/avatars/user-1'])
    expect(updateProfile).toHaveBeenCalledWith(USER, { avatarUrl: null })
  })
})

describe('reading somebody else’s photo', () => {
  it('reads within the caller’s own organization', async () => {
    const { provider, calls } = storageDouble()
    const { svc } = service(provider)

    await svc.read(ctx(), 'colleague')

    expect(calls.read).toEqual(['org-1/avatars/colleague'])
  })

  it('cannot reach another tenant: the key is built from the CALLER’s org', async () => {
    const { provider, calls } = storageDouble()
    const { svc } = service(provider)

    // A caller in org-2 asking for a user who lives in org-1 addresses
    // org-2/avatars/<id>, which is not where that user's photo is.
    await svc.read(ctx('org-2', 'someone'), USER)

    expect(calls.read).toEqual(['org-2/avatars/user-1'])
    expect(calls.read).not.toContain('org-1/avatars/user-1')
  })
})

describe('the avatarUrl contract stays backward compatible', () => {
  it('still accepts the absolute URLs written before uploads existed', () => {
    expect(
      updateProfileSchema.safeParse({ avatarUrl: 'https://cdn.example.com/a.png' }).success,
    ).toBe(true)
  })

  it('accepts the app-relative avatar path the upload flow writes', () => {
    expect(updateProfileSchema.safeParse({ avatarUrl: avatarPath('user-1') }).success).toBe(true)
  })

  it('accepts the versioned path, which is what confirm now stores', () => {
    expect(
      updateProfileSchema.safeParse({ avatarUrl: avatarPath('user-1', 'abc123') }).success,
    ).toBe(true)
  })

  it('refuses a query that is not the version token', () => {
    expect(
      updateProfileSchema.safeParse({ avatarUrl: '/api/v1/users/user-1/avatar?next=/admin' })
        .success,
    ).toBe(false)
  })

  it('accepts null, which is how a photo is cleared', () => {
    expect(updateProfileSchema.safeParse({ avatarUrl: null }).success).toBe(true)
  })

  it('still rejects a value that is neither', () => {
    expect(updateProfileSchema.safeParse({ avatarUrl: 'not-a-url' }).success).toBe(false)
  })

  it('refuses an arbitrary app path, so this cannot point at another endpoint', () => {
    // Otherwise a profile could aim an <img> at any route on this API, which
    // the browser would then request with the viewer's cookies attached.
    expect(
      updateProfileSchema.safeParse({ avatarUrl: '/api/v1/documents/abc/download' }).success,
    ).toBe(false)
  })
})
