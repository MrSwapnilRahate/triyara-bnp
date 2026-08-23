import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * The app's environment schema.
 *
 * `env.ts` calls `createEnv` at module scope, so the schema runs once when the
 * module loads. Each case therefore sets the variables first and imports
 * through `vi.resetModules()` - the same approach `super-admin-multi.test.ts`
 * uses for `SUPER_ADMIN_EMAILS`, and for the same reason: a value read at load
 * cannot be re-read by calling something afterwards.
 *
 * `vi.stubEnv` is scoped rather than a direct `process.env` assignment, and
 * `vi.unstubAllEnvs` in `afterEach` puts the real environment back - including
 * when a case throws, which is most of them.
 */

async function loadEnv(vars: Record<string, string>) {
  vi.resetModules()
  for (const [key, value] of Object.entries(vars)) vi.stubEnv(key, value)
  return import('./env')
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('a valid environment', () => {
  it('accepts both variables and returns what was set', async () => {
    const { env } = await loadEnv({ NODE_ENV: 'production', LOG_LEVEL: 'warn' })
    expect(env.NODE_ENV).toBe('production')
    expect(env.LOG_LEVEL).toBe('warn')
  })

  it.each(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])(
    'accepts %s as a log level',
    async (level) => {
      const { env } = await loadEnv({ NODE_ENV: 'test', LOG_LEVEL: level })
      expect(env.LOG_LEVEL).toBe(level)
    },
  )
})

describe('absent variables fall back to the defaults', () => {
  it('defaults LOG_LEVEL to info when it is not set', async () => {
    // Neither variable is required, which is why wiring this schema in cannot
    // break a deployment that simply does not configure them - and neither of
    // them is set on the production project today.
    const { env } = await loadEnv({ NODE_ENV: 'production' })
    expect(env.LOG_LEVEL).toBe('info')
  })

  it('defaults NODE_ENV to development when it is not set', async () => {
    vi.resetModules()
    vi.stubEnv('NODE_ENV', undefined as unknown as string)
    vi.stubEnv('LOG_LEVEL', 'debug')
    const { env } = await import('./env')
    expect(env.NODE_ENV).toBe('development')
    expect(env.LOG_LEVEL).toBe('debug')
  })
})

describe('an invalid value is refused at load', () => {
  it('rejects a NODE_ENV outside the enum', async () => {
    // "prod" is the plausible typo, and the one worth failing on: it would
    // otherwise silently disable every `NODE_ENV === 'production'` branch,
    // including secure cookies in auth/config.ts.
    await expect(loadEnv({ NODE_ENV: 'prod', LOG_LEVEL: 'info' })).rejects.toThrow(
      /Invalid environment variables/,
    )
  })

  it('rejects a LOG_LEVEL outside the enum', async () => {
    await expect(loadEnv({ NODE_ENV: 'production', LOG_LEVEL: 'verbose' })).rejects.toThrow(
      /Invalid environment variables/,
    )
  })

  it('names the offending variable and what it expected', async () => {
    // The message is the whole value of failing fast: a boot that stops without
    // saying which variable is wrong costs more than one that never checked.
    await expect(loadEnv({ NODE_ENV: 'staging', LOG_LEVEL: 'info' })).rejects.toThrow(
      /NODE_ENV.*Expected 'development' \| 'test' \| 'production', received 'staging'/s,
    )
  })
})
