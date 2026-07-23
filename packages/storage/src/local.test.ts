import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { LocalStorageProvider } from './local'
import { assertSafeKey } from './types'

describe('LocalStorageProvider', () => {
  let dir = ''
  let store: LocalStorageProvider
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'triyara-store-'))
    store = new LocalStorageProvider(dir, 'test-secret')
  })
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('signs upload urls and verifies them; rejects tampering', async () => {
    const up = await store.createUploadUrl({
      storageKey: 'org1/a/f.pdf',
      mimeType: 'application/pdf',
      maxBytes: 100,
    })
    const q = new URLSearchParams(up.uploadUrl.split('?')[1])
    expect(
      store.verifyUpload({
        key: q.get('key')!,
        exp: q.get('exp')!,
        mime: q.get('mime')!,
        max: q.get('max')!,
        sig: q.get('sig')!,
      }),
    ).toBe(true)
    expect(
      store.verifyUpload({
        key: q.get('key')!,
        exp: q.get('exp')!,
        mime: q.get('mime')!,
        max: q.get('max')!,
        sig: 'deadbeef',
      }),
    ).toBe(false)
  })

  it('writes, stats (sha256 + size), and deletes', async () => {
    await store.write('org1/a/f.pdf', Buffer.from('hello'))
    const st = await store.stat('org1/a/f.pdf')
    expect(st?.size).toBe(5)
    expect(st?.checksum).toHaveLength(64)
    expect(await readFile(join(dir, 'org1/a/f.pdf'), 'utf8')).toBe('hello')
    await store.delete('org1/a/f.pdf')
    expect(await store.stat('org1/a/f.pdf')).toBeNull()
  })

  it('rejects path traversal keys', () => {
    expect(() => assertSafeKey('../etc/passwd')).toThrow()
    expect(() => assertSafeKey('org1/../../x')).toThrow()
  })
})
