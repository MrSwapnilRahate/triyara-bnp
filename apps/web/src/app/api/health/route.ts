import { prisma } from '@triyara/db'
import { NextResponse } from 'next/server'

import { logServerError, pathOf } from '@/lib/error-log'

// Never cached. A readiness check answered from a cache is a check of the
// cache, and it would keep reporting healthy for as long as the entry lives.
export const dynamic = 'force-dynamic'

/**
 * GET /api/health - readiness, not liveness.
 *
 * This used to return a static object, so it answered 200 with the database
 * completely unreachable: an uptime monitor pointed at it was measuring
 * whether Node was running and nothing else, which is the one thing that is
 * almost never the problem.
 *
 * `SELECT 1` is the cheapest question that still proves the pool can hand out
 * a working connection. It does not touch a table, so it stays honest as the
 * schema changes and costs nothing to run on a schedule.
 */
export async function GET(req: Request) {
  const startedAt = Date.now()

  try {
    await prisma.$queryRaw`SELECT 1`
  } catch (error) {
    // 503, not 500: this is the status a load balancer and an uptime monitor
    // both already understand as "do not send traffic here".
    logServerError(error, {
      requestId: req.headers.get('x-request-id') ?? 'health',
      method: req.method,
      path: pathOf(req.url),
    })

    return NextResponse.json(
      {
        success: false,
        data: { status: 'degraded', service: 'triyara-bnp-web', database: 'unreachable' },
        meta: { ts: new Date().toISOString() },
        errors: [{ code: 'DEPENDENCY_UNAVAILABLE', message: 'Database is unreachable.' }],
      },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    )
  }

  return NextResponse.json(
    {
      success: true,
      data: {
        status: 'ok',
        service: 'triyara-bnp-web',
        database: 'ok',
        // Rising latency here is the earliest warning of a pool that is
        // running out, and it costs nothing to report.
        databaseLatencyMs: Date.now() - startedAt,
      },
      meta: { ts: new Date().toISOString() },
      errors: null,
    },
    { headers: { 'cache-control': 'no-store' } },
  )
}
