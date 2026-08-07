import { afterEach, describe, expect, it } from 'vitest'

import { createStorageFromEnv } from './factory'

// The production guard. These tests exist because the failure they prevent is
// silent: local storage in production does not throw on upload, it accepts the
// bytes and loses them.

const KEYS = [
  'NODE_ENV',
  'NEXT_PHASE',
  'STORAGE_PROVIDER',
  'STORAGE_BUCKET',
  'STORAGE_ACCESS_KEY_ID',
  'STORAGE_SECRET_ACCESS_KEY',
  'STORAGE_REGION',
  'STORAGE_ENDPOINT',
] as const

const original = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]))

function env(values: Partial<Record<(typeof KEYS)[number], string | undefined>>) {
  for (const key of KEYS) {
    const value = values[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

afterEach(() => {
  for (const key of KEYS) {
    const value = original[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

describe('createStorageFromEnv', () => {
  it('uses local storage in development, unconfigured', () => {
    env({ NODE_ENV: 'development' })
    expect(() => createStorageFromEnv()).not.toThrow()
  })

  it('uses local storage in test, so suites need no cloud credentials', () => {
    env({ NODE_ENV: 'test' })
    expect(() => createStorageFromEnv()).not.toThrow()
  })

  it('refuses to start with local storage in production', () => {
    env({ NODE_ENV: 'production' })
    // The whole point of the guard: a deployment that will not boot is
    // recoverable; documents that were never really stored are not.
    expect(() => createStorageFromEnv()).toThrow(/loses them in production/i)
  })

  it('names the variables that would fix it', () => {
    env({ NODE_ENV: 'production' })
    expect(() => createStorageFromEnv()).toThrow(/STORAGE_BUCKET/)
    expect(() => createStorageFromEnv()).toThrow(/docs\/07-deployment/)
  })

  it('still allows local during a production BUILD', () => {
    // `next build` runs with NODE_ENV=production and evaluates route modules.
    // Guarding on NODE_ENV alone would fail every build, including CI's.
    env({ NODE_ENV: 'production', NEXT_PHASE: 'phase-production-build' })
    expect(() => createStorageFromEnv()).not.toThrow()
  })

  it('accepts a fully configured s3 provider in production', () => {
    env({
      NODE_ENV: 'production',
      STORAGE_PROVIDER: 's3',
      STORAGE_BUCKET: 'triyara-docs',
      STORAGE_ACCESS_KEY_ID: 'key',
      STORAGE_SECRET_ACCESS_KEY: 'secret',
      STORAGE_REGION: 'ap-south-1',
    })
    expect(() => createStorageFromEnv()).not.toThrow()
  })

  it('accepts r2, which needs an endpoint rather than a region', () => {
    env({
      NODE_ENV: 'production',
      STORAGE_PROVIDER: 'r2',
      STORAGE_BUCKET: 'triyara-docs',
      STORAGE_ACCESS_KEY_ID: 'key',
      STORAGE_SECRET_ACCESS_KEY: 'secret',
      STORAGE_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
    })
    expect(() => createStorageFromEnv()).not.toThrow()
  })

  it('refuses a half-configured s3 provider rather than failing on first upload', () => {
    env({
      NODE_ENV: 'production',
      STORAGE_PROVIDER: 's3',
      STORAGE_BUCKET: 'triyara-docs',
      // No credentials. Without this check the app boots and every upload
      // fails with an opaque AWS error, one request at a time.
    })
    expect(() => createStorageFromEnv()).toThrow(/STORAGE_ACCESS_KEY_ID/)
    expect(() => createStorageFromEnv()).toThrow(/STORAGE_SECRET_ACCESS_KEY/)
  })

  it('checks s3 config in development too', () => {
    // A developer pointing at a real bucket with half the credentials should
    // hear about it immediately, not at the first upload.
    env({ NODE_ENV: 'development', STORAGE_PROVIDER: 's3', STORAGE_BUCKET: 'b' })
    expect(() => createStorageFromEnv()).toThrow(/STORAGE_ACCESS_KEY_ID/)
  })

  it('treats an unrecognised provider as local, and still refuses it in production', () => {
    env({ NODE_ENV: 'production', STORAGE_PROVIDER: 'gcs' })
    expect(() => createStorageFromEnv()).toThrow(/'gcs'/)
  })
})
