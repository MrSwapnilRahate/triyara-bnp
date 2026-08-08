// @vitest-environment node
import { logger } from '@triyara/lib'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const queryRaw = vi.fn()
vi.mock('@triyara/db', () => ({ prisma: { $queryRaw: queryRaw } }))
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))

const { GET } = await import('../route')

beforeEach(() => {
  queryRaw.mockReset()
  vi.spyOn(logger, 'error').mockImplementation((() => undefined) as never)
})

afterEach(() => vi.restoreAllMocks())

const call = () => GET(new Request('https://portal.triyaraexports.com/api/health'))

describe('a health check that does not check anything is worse than none', () => {
  it('returns 503 when the database is unreachable', async () => {
    // This is the defect: the endpoint returned a static 200, so an uptime
    // monitor pointed at it reported healthy with Postgres completely gone.
    queryRaw.mockRejectedValue(new Error("Can't reach database server"))

    const res = await call()

    expect(res.status).toBe(503)
  })

  it('says which dependency is down', async () => {
    queryRaw.mockRejectedValue(new Error("Can't reach database server"))

    const body = (await (await call()).json()) as {
      success: boolean
      data: { status: string; database: string }
      errors: { code: string }[]
    }

    expect(body.success).toBe(false)
    expect(body.data.database).toBe('unreachable')
    expect(body.errors[0]!.code).toBe('DEPENDENCY_UNAVAILABLE')
  })

  it('returns 200 when the database answers', async () => {
    queryRaw.mockResolvedValue([{ '?column?': 1 }])

    const res = await call()
    const body = (await res.json()) as { success: boolean; data: { database: string } }

    expect(res.status).toBe(200)
    expect(body.data.database).toBe('ok')
  })

  it('actually asks the database', async () => {
    // Without this the endpoint could go back to being static and every other
    // assertion here would still pass.
    queryRaw.mockResolvedValue([{ '?column?': 1 }])

    await call()

    expect(queryRaw).toHaveBeenCalledOnce()
  })

  it('reports how long the database took', async () => {
    // Rising latency is the earliest warning of a pool running out.
    queryRaw.mockResolvedValue([{ '?column?': 1 }])

    const body = (await (await call()).json()) as { data: { databaseLatencyMs: number } }

    expect(typeof body.data.databaseLatencyMs).toBe('number')
  })

  it('is never cached', async () => {
    // A readiness check answered from a cache is a check of the cache.
    queryRaw.mockResolvedValue([{ '?column?': 1 }])

    expect((await call()).headers.get('cache-control')).toBe('no-store')
  })

  it('is never cached when degraded either', async () => {
    queryRaw.mockRejectedValue(new Error('down'))

    expect((await call()).headers.get('cache-control')).toBe('no-store')
  })

  it('records the outage rather than only reporting it', async () => {
    const written = vi.spyOn(logger, 'error').mockImplementation((() => undefined) as never)
    queryRaw.mockRejectedValue(new Error("Can't reach database server"))

    await call()

    expect(written).toHaveBeenCalledOnce()
  })
})
