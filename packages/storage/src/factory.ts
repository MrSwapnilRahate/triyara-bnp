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

// Selects the provider from env. Default is local (zero-config, browser-demonstrable).
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
    return provider === 'r2' ? createR2Storage(cfg) : createS3Storage(cfg)
  }
  return getLocalStorage()
}
