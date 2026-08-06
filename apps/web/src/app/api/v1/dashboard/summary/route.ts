import { requireAuth } from '@/auth/context'
import { adminService } from '@/lib/admin-service'
import { ok, route } from '@/lib/api'

// GET /api/v1/dashboard/summary - counts for the dashboard KPI strip.
//
// This exists because the list endpoints deliberately cannot answer it. Cursor
// pagination returns a page and a forward cursor, never a total - which is what
// keeps paging cheap as a table grows - so "how many RFQs are open" has no
// answer in the list API, and a client could only get one by walking every page.
//
// Counts only. The dashboard's lists come from the real list endpoints, so a
// row shown on the dashboard and the same row on its module screen cannot
// disagree about its own contents.
export function GET(req: Request) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const summary = await adminService.summary({ ...auth, requestId })
    return ok(summary, { requestId })
  })
}
