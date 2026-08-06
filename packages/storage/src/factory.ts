import { resolve } from 'node:path'

import { LocalStorageProvider } from './local'
import { createR2Storage, createS3Storage } from './s3'
import type { StorageProvider } from './types'

let localSingleton: LocalStorageProvider | undefined

export function getLocalStorage(): LocalStorageProvider {
  if (!localSingleton) {
    const dir = process.env.STORAGE_LOCAL_DIR ?? resolve(process.cwd(), '.storage')
    const secret = process.env.STORAGE_SECRET ?? process.env.AUTH_SECRET ?? 'dev-storage-secret'
    localSingleton = new LocalStorageProvider(dir, secret)
  }
  return localSingleton
}

/**
 * Whether this process is serving traffic, as opposed to building.
 *
 * `next build` runs with NODE_ENV=production and evaluates route modules, so
 * NODE_ENV alone cannot tell a real deployment from a build step. Guarding on
 * NODE_ENV alone would fail every production build, including CI's.
 */
function isServingProduction(): boolean {
  return (
    process.env.NODE_ENV === 'production' && process.env.NEXT_PHASE !== 'phase-production-build'
  )
}

/** Config `s3`/`r2` cannot work without. Missing any of them is unrecoverable. */
function assertS3Config(cfg: { bucket: string; accessKeyId: string; secretAccessKey: string }) {
  const missing = [
    ['STORAGE_BUCKET', cfg.bucket],
    ['STORAGE_ACCESS_KEY_ID', cfg.accessKeyId],
    ['STORAGE_SECRET_ACCESS_KEY', cfg.secretAccessKey],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name)

  if (missing.length > 0) {
    throw new Error(
      `Storage is set to '${process.env.STORAGE_PROVIDER}' but ${missing.join(', ')} ` +
        `${missing.length === 1 ? 'is' : 'are'} not set. Uploads would fail on the first ` +
        `request. See docs/07-deployment/README.md.`,
    )
  }
}

/**
 * Selects the provider from env. Default is local (zero-config for development).
 *
 * Local storage writes to the container filesystem, which on a serverless host
 * is read-only outside /tmp and is discarded between invocations either way.
 * Running it in production does not error — the upload appears to succeed and
 * the document is gone — so this refuses to start instead. A deployment that
 * will not boot is recoverable in minutes; supplier documents that were never
 * really stored are not.
 */
export function createStorageFromEnv(): StorageProvider {
  const provider = process.env.STORAGE_PROVIDER ?? 'local'

  if (provider === 's3' || provider === 'r2') {
    const cfg = {
      region: process.env.STORAGE_REGION ?? 'auto',
      bucket: process.env.STORAGE_BUCKET ?? '',
      accessKeyId: process.env.STORAGE_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY ?? '',
      endpoint: process.env.STORAGE_ENDPOINT,
    }
    // Checked whatever the environment: a developer pointing at S3 with half
    // the credentials should hear about it immediately too.
    assertS3Config(cfg)
    return provider === 'r2' ? createR2Storage(cfg) : createS3Storage(cfg)
  }

  if (isServingProduction()) {
    throw new Error(
      `STORAGE_PROVIDER is '${provider}', which stores files on the local filesystem and ` +
        `loses them in production. Set STORAGE_PROVIDER=s3 or r2 with STORAGE_BUCKET, ` +
        `STORAGE_ACCESS_KEY_ID and STORAGE_SECRET_ACCESS_KEY. ` +
        `See docs/07-deployment/README.md.`,
    )
  }

  return getLocalStorage()
}
