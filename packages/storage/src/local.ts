import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { createReadStream, existsSync } from 'node:fs'
import { mkdir, readFile, stat as fsStat, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { Readable } from 'node:stream'

import { assertSafeKey, type ObjectStat, type PresignedUpload, type StorageProvider } from './types'

// Local filesystem provider that faithfully mirrors presigned-upload semantics using
// short-lived HMAC-signed URLs (no session needed for the direct PUT/GET). This makes
// the whole upload/download flow demonstrable in the browser with zero external infra.
export class LocalStorageProvider implements StorageProvider {
  constructor(
    private readonly baseDir: string,
    private readonly secret: string,
  ) {}

  private full(key: string): string {
    assertSafeKey(key)
    return join(this.baseDir, key)
  }

  private sign(parts: string[]): string {
    return createHmac('sha256', this.secret).update(parts.join(':')).digest('hex')
  }

  private valid(sig: string, parts: string[]): boolean {
    const expected = this.sign(parts)
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    return a.length === b.length && timingSafeEqual(a, b)
  }

  createUploadUrl({
    storageKey,
    mimeType,
    maxBytes,
  }: {
    storageKey: string
    mimeType: string
    maxBytes: number
  }): Promise<PresignedUpload> {
    assertSafeKey(storageKey)
    const exp = Date.now() + 15 * 60 * 1000
    const sig = this.sign(['PUT', storageKey, String(exp), mimeType, String(maxBytes)])
    const q = new URLSearchParams({
      key: storageKey,
      exp: String(exp),
      mime: mimeType,
      max: String(maxBytes),
      sig,
    })
    return Promise.resolve({
      uploadUrl: `/api/v1/storage/upload?${q.toString()}`,
      method: 'PUT',
      headers: { 'content-type': mimeType },
      storageKey,
      expiresAt: new Date(exp).toISOString(),
    })
  }

  verifyUpload(p: { key: string; exp: string; mime: string; max: string; sig: string }): boolean {
    if (Date.now() > Number(p.exp)) return false
    return this.valid(p.sig, ['PUT', p.key, p.exp, p.mime, p.max])
  }

  async write(key: string, data: Buffer): Promise<void> {
    const path = this.full(key)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, data)
  }

  async stat(key: string): Promise<ObjectStat | null> {
    const path = this.full(key)
    if (!existsSync(path)) return null
    const st = await fsStat(path)
    const buf = await readFile(path)
    return { size: st.size, checksum: createHash('sha256').update(buf).digest('hex') }
  }

  createDownloadUrl({
    storageKey,
    downloadName,
    contentType,
    disposition = 'attachment',
    expiresInSeconds = 300,
  }: {
    storageKey: string
    downloadName?: string
    contentType?: string
    disposition?: 'inline' | 'attachment'
    expiresInSeconds?: number
  }): Promise<string> {
    assertSafeKey(storageKey)
    // Only the key + expiry are signed; response-header params (name/type/disposition)
    // cannot select a different file, so they are safe as plain query params.
    const exp = Date.now() + expiresInSeconds * 1000
    const sig = this.sign(['GET', storageKey, String(exp)])
    const q = new URLSearchParams({ key: storageKey, exp: String(exp), sig, disp: disposition })
    if (downloadName) q.set('name', downloadName)
    if (contentType) q.set('ct', contentType)
    return Promise.resolve(`/api/v1/storage/download?${q.toString()}`)
  }

  verifyDownload(p: { key: string; exp: string; sig: string }): boolean {
    if (Date.now() > Number(p.exp)) return false
    return this.valid(p.sig, ['GET', p.key, p.exp])
  }

  readStream(key: string): Readable {
    return createReadStream(this.full(key))
  }

  async delete(key: string): Promise<void> {
    const path = this.full(key)
    if (existsSync(path)) await unlink(path)
  }
}
