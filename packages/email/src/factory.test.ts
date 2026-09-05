import { afterEach, describe, expect, it, vi } from 'vitest'

import { createEmailTransportFromEnv } from './factory'

// The production guard. It exists because the failure it prevents is invisible:
// with no key configured the app runs perfectly and nobody outside the team
// ever hears back.

const KEYS = ['NODE_ENV', 'NEXT_PHASE', 'RESEND_API_KEY', 'EMAIL_FROM', 'VERCEL_ENV'] as const

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

// A preview deployment is a branch build the team alone reaches. Requiring real
// credentials there did not protect anyone: the transport is built at module
// scope, so an unconfigured preview threw during import and took sign-in,
// password reset and the session endpoint down with it - the whole of auth
// answering 500. What matters below is that relaxing this did not follow the
// guard into the production deployment.
describe('preview deployments', () => {
  it('logs instead of sending when no key is configured', () => {
    env({ NODE_ENV: 'production', VERCEL_ENV: 'preview' })
    expect(createEmailTransportFromEnv(logger).name).toBe('log')
  })

  it('still uses Resend when the preview IS configured', () => {
    // Giving one preview real credentials stays possible; it just is not the
    // price of the branch booting.
    env({
      NODE_ENV: 'production',
      VERCEL_ENV: 'preview',
      RESEND_API_KEY: 're_key',
      EMAIL_FROM: 'TRIYARA <a@b.com>',
    })
    expect(createEmailTransportFromEnv(logger).name).toBe('resend')
  })

  it('does NOT relax the production deployment', () => {
    env({ NODE_ENV: 'production', VERCEL_ENV: 'production' })
    expect(() => createEmailTransportFromEnv(logger)).toThrow(/silently never arrive/i)
  })

  it('does not relax a deployment whose VERCEL_ENV is absent', () => {
    // System variables can be switched off. Reading that as "preview" would
    // disable the guard on production, so the guard has to win by default.
    env({ NODE_ENV: 'production' })
    expect(() => createEmailTransportFromEnv(logger)).toThrow(/silently never arrive/i)
  })

  it('matches only the exact value, not anything preview-ish', () => {
    for (const value of ['Preview', 'PREVIEW', 'previews', 'development', 'staging', '1']) {
      env({ NODE_ENV: 'production', VERCEL_ENV: value })
      expect(() => createEmailTransportFromEnv(logger)).toThrow(/silently never arrive/i)
    }
  })

  it('still names the missing variables on production', () => {
    env({ NODE_ENV: 'production', VERCEL_ENV: 'production' })
    expect(() => createEmailTransportFromEnv(logger)).toThrow(/RESEND_API_KEY/)
    expect(() => createEmailTransportFromEnv(logger)).toThrow(/EMAIL_FROM/)
  })
})
