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

/**
 * The two variables the schema requires, so a case that is not about them does
 * not have to restate them. Passing `undefined` for either removes it, which is
 * how the missing-variable cases below are written.
 *
 * Fake values. The connection string points nowhere and is never dialled - the
 * schema only asserts the variable is set.
 */
const REQUIRED = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  AUTH_SECRET: 'test-secret',
}

async function loadEnv(vars: Record<string, string | undefined> = {}) {
  vi.resetModules()
  for (const [key, value] of Object.entries({ ...REQUIRED, ...vars })) {
    vi.stubEnv(key, value as string)
  }
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
    const { env } = await loadEnv({ NODE_ENV: undefined, LOG_LEVEL: 'debug' })
    expect(env.NODE_ENV).toBe('development')
    expect(env.LOG_LEVEL).toBe('debug')
  })
})

describe('the variables the app cannot run without', () => {
  it('accepts a complete configuration', async () => {
    const { env } = await loadEnv({ NODE_ENV: 'production', LOG_LEVEL: 'warn' })
    expect(env.DATABASE_URL).toBe(REQUIRED.DATABASE_URL)
    expect(env.AUTH_SECRET).toBe(REQUIRED.AUTH_SECRET)
  })

  it('refuses a missing DATABASE_URL, and names it', async () => {
    // Prisma reads this from the datasource block rather than process.env, so
    // without this check the first symptom is a query failing at runtime.
    //
    // An ABSENT variable trips zod's own required check, not the `.min(1)`
    // message - so the report reads {"DATABASE_URL":["Required"]}. The variable
    // is named either way, which is the part that matters when a boot fails.
    await expect(loadEnv({ DATABASE_URL: undefined })).rejects.toThrow(
      /Invalid environment variables.*DATABASE_URL.*Required/s,
    )
  })

  it('refuses a missing AUTH_SECRET, and names it', async () => {
    // Auth.js reads this implicitly; it appears nowhere in apps/web/src/auth.
    await expect(loadEnv({ AUTH_SECRET: undefined })).rejects.toThrow(
      /Invalid environment variables.*AUTH_SECRET.*Required/s,
    )
  })

  it('refuses an empty string, with the message the schema carries', async () => {
    // An unset variable and one set to "" are the same amount of configuration.
    // This is the path that surfaces the custom `.min(1)` wording.
    await expect(loadEnv({ DATABASE_URL: '' })).rejects.toThrow(/DATABASE_URL is required\./)
  })

  it('reports both when both are missing, not just the first', async () => {
    // createEnv flattens zod's fieldErrors, so one boot tells you everything
    // that is wrong rather than one variable per restart.
    await expect(loadEnv({ DATABASE_URL: undefined, AUTH_SECRET: undefined })).rejects.toThrow(
      /DATABASE_URL.*AUTH_SECRET/s,
    )
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
