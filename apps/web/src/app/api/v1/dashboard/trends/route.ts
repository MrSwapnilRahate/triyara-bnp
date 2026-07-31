import { trendsQuerySchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { adminService } from '@/lib/admin-service'
import { ok, parseQuery, route } from '@/lib/api'

// GET /api/v1/dashboard/trends - grouped counts for the dashboard charts.
//
// Live aggregates over the source tables, not materialised summaries: a chart
// cannot disagree with the records it describes, because there is no refresh
// path to fall behind and nothing to backfill.
//
// Months with no rows are returned as zeroes rather than omitted - a gap in a
// time series should read as "nothing happened", not as a missing month.
export function GET(req: Request) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const query = parseQuery(new URL(req.url).searchParams, trendsQuerySchema)
    const trends = await adminService.trends({ ...auth, requestId }, query)
    return ok(trends, { requestId, meta: { window: query.window } })
  })
}
