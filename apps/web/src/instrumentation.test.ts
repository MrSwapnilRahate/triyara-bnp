import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * Which runtime gets what at startup.
 *
 * Two properties worth pinning, because both are invisible until they break in
 * production: Sentry starts in every server runtime, and the environment schema
 * runs in the Node one only.
 *
 * These assert on BEHAVIOUR - whether an invalid value actually stops the boot -
 * rather than on whether a mocked module was imported. An earlier version of
 * this file counted evaluations of a `vi.mock` factory instead, and a mutation
 * proved it worthless: vitest does not re-run a mock factory after
 * `resetModules`, so the edge cases passed whether or not the guard existed. A
 * real `@/env` with a deliberately malformed variable cannot be faked that way.
 */

const sentryInit = vi.fn()
vi.mock('@sentry/nextjs', () => ({ init: sentryInit }))
vi.mock('@/lib/sentry-options', () => ({ sentryOptions: () => ({ dsn: undefined }) }))

/**
 * The variables `@/env` requires, supplied by default so a case about runtime
 * gating does not fail over unrelated configuration. A case may override either,
 * or pass `undefined` to unset it.
 *
 * Fake values. The connection string points nowhere and is never dialled - the
 * schema only asserts the variable is set.
 */
const REQUIRED = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  AUTH_SECRET: 'test-secret',
}

/** Fresh module registry, so `@/env` re-runs its schema for every case. */
async function registerIn(runtime: string, vars: Record<string, string | undefined> = {}) {
  vi.resetModules()
  sentryInit.mockClear()
  vi.stubEnv('NEXT_RUNTIME', runtime)
  for (const [key, value] of Object.entries({ ...REQUIRED, ...vars })) {
    vi.stubEnv(key, value as string)
  }
  const { register } = await import('./instrumentation')
  return register()
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('the node runtime', () => {
  it('starts Sentry', async () => {
    await registerIn('nodejs')
    expect(sentryInit).toHaveBeenCalledOnce()
  })

  it('validates the environment, so a malformed value stops the boot', async () => {
    // The proof that validation genuinely runs here: nothing else in this
    // process would reject on LOG_LEVEL.
    await expect(registerIn('nodejs', { LOG_LEVEL: 'verbose' })).rejects.toThrow(
      /Invalid environment variables/,
    )
  })

  it('accepts a valid environment', async () => {
    await expect(
      registerIn('nodejs', { NODE_ENV: 'production', LOG_LEVEL: 'warn' }),
    ).resolves.toBeUndefined()
  })

  it('accepts an environment that sets neither NODE_ENV nor LOG_LEVEL', async () => {
    // Those two have defaults, which is why they cannot break a deployment that
    // configures neither - and production configures neither today. The two the
    // schema does require come from `REQUIRED`, because they are present in
    // every environment this runs in: local, CI, preview and production.
    await expect(
      registerIn('nodejs', { NODE_ENV: undefined, LOG_LEVEL: undefined }),
    ).resolves.toBeUndefined()
  })

  it('refuses to start when a required variable is missing', async () => {
    // The reason the schema is loaded here at all: a server about to take
    // traffic without a database URL should not take traffic.
    await expect(registerIn('nodejs', { DATABASE_URL: undefined })).rejects.toThrow(
      /Invalid environment variables.*DATABASE_URL/s,
    )
  })
})

describe('the edge runtime', () => {
  it('starts Sentry', async () => {
    await registerIn('edge')
    expect(sentryInit).toHaveBeenCalledOnce()
  })

  it('does not load the environment module', async () => {
    // Same malformed value that rejects under Node. Resolving here can only
    // mean `@/env` was never evaluated - which is what the runtime guard is
    // for, and what a static import at the top of the file would break.
    await expect(registerIn('edge', { LOG_LEVEL: 'verbose' })).resolves.toBeUndefined()
  })
})

describe('outside a Next server runtime', () => {
  it('does nothing at all', async () => {
    // NEXT_RUNTIME is set by the framework. Absent means this is not a server
    // boot, and neither side effect belongs here.
    await expect(registerIn('', { LOG_LEVEL: 'verbose' })).resolves.toBeUndefined()
    expect(sentryInit).not.toHaveBeenCalled()
  })
})
