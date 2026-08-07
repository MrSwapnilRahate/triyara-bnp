import { afterEach, describe, expect, it, vi } from 'vitest'

import { createEmailTransportFromEnv } from './factory'

// The production guard. It exists because the failure it prevents is invisible:
// with no key configured the app runs perfectly and nobody outside the team
// ever hears back.

const KEYS = ['NODE_ENV', 'NEXT_PHASE', 'RESEND_API_KEY', 'EMAIL_FROM'] as const

const original = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]))

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }

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

describe('createEmailTransportFromEnv', () => {
  it('logs instead of sending in development, with no key', () => {
    env({ NODE_ENV: 'development' })
    expect(createEmailTransportFromEnv(logger).name).toBe('log')
  })

  it('logs instead of sending in test, so suites need no key', () => {
    env({ NODE_ENV: 'test' })
    expect(createEmailTransportFromEnv(logger).name).toBe('log')
  })

  it('refuses to start unconfigured in production', () => {
    env({ NODE_ENV: 'production' })
    expect(() => createEmailTransportFromEnv(logger)).toThrow(/silently never arrive/i)
  })

  it('names both missing variables', () => {
    env({ NODE_ENV: 'production' })
    expect(() => createEmailTransportFromEnv(logger)).toThrow(/RESEND_API_KEY/)
    expect(() => createEmailTransportFromEnv(logger)).toThrow(/EMAIL_FROM/)
  })

  it('names only the one that is missing', () => {
    env({ NODE_ENV: 'production', RESEND_API_KEY: 're_key' })
    expect(() => createEmailTransportFromEnv(logger)).toThrow(/EMAIL_FROM is not set/)
  })

  it('still allows the log transport during a production BUILD', () => {
    // `next build` runs with NODE_ENV=production and evaluates route modules.
    // Guarding on NODE_ENV alone would fail every build, including CI's.
    env({ NODE_ENV: 'production', NEXT_PHASE: 'phase-production-build' })
    expect(createEmailTransportFromEnv(logger).name).toBe('log')
  })

  it('uses Resend when fully configured', () => {
    env({ NODE_ENV: 'production', RESEND_API_KEY: 're_key', EMAIL_FROM: 'TRIYARA <a@b.com>' })
    expect(createEmailTransportFromEnv(logger).name).toBe('resend')
  })

  it('uses Resend in development too when a key is present', () => {
    // Someone testing real delivery locally should get real delivery.
    env({ NODE_ENV: 'development', RESEND_API_KEY: 're_key', EMAIL_FROM: 'TRIYARA <a@b.com>' })
    expect(createEmailTransportFromEnv(logger).name).toBe('resend')
  })
})
