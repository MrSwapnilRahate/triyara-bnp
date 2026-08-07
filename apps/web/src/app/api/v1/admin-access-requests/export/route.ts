import type { AdminAccessRequestView } from '@triyara/core'

import { requireAuth } from '@/auth/context'
import { adminAccessRequestService } from '@/lib/admin-access-request-service'
import { errorResponse } from '@/lib/api'

/**
 * One CSV cell.
 *
 * Everything is quoted and inner quotes doubled, per RFC 4180 — reasons are
 * free text and will contain commas, quotes and newlines. A leading `=`, `+`,
 * `-` or `@` is prefixed with a quote so a spreadsheet treats it as text
 * rather than a formula: reasons are written by users, and a cell that
 * executes on open is a real hazard.
 */
function cell(value: unknown): string {
  if (value === null || value === undefined) return '""'
  const raw = value instanceof Date ? value.toISOString() : String(value)
  const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw
  return `"${safe.replace(/"/g, '""')}"`
}

const COLUMNS = [
  'Request ID',
  'Status',
  'Requested By',
  'Requester Email',
  'Organization',
  'Role At Request',
  'Reason',
  'Requested At',
  'Decided By',
  'Approved At',
  'Rejected At',
  'Rejection Reason',
  'Revoked By',
  'Revoked At',
  'Revocation Reason',
]

function row(r: AdminAccessRequestView): string {
  // Approved and rejected share `decidedAt`; the status says which it was, so
  // the column that does not apply is left empty rather than repeated.
  const approvedAt = r.status === 'APPROVED' || r.status === 'REVOKED' ? r.decidedAt : null
  const rejectedAt = r.status === 'REJECTED' ? r.decidedAt : null
  return [
    r.id,
    r.status,
    r.requesterName,
    r.requesterEmail,
    r.organizationName,
    r.currentRole,
    r.reason,
    r.createdAt,
    r.decidedByName ?? r.decidedById,
    approvedAt,
    rejectedAt,
    r.status === 'REJECTED' ? r.decisionReason : null,
    r.revokedByName ?? r.revokedById,
    r.revokedAt,
    r.revocationReason,
  ]
    .map(cell)
    .join(',')
}

// GET /api/v1/admin-access-requests/export - the full history as CSV.
//
// Super Admin only, enforced in the service. Returns a file rather than the
// usual envelope, so it is not wrapped in `ok()`.
export async function GET(): Promise<Response> {
  const requestId = crypto.randomUUID()
  try {
    const auth = await requireAuth()
    const rows = await adminAccessRequestService.exportAll({ ...auth, requestId })

    // A BOM so Excel opens UTF-8 correctly; without it accented names arrive
    // mangled, which is exactly the audit record nobody can trust.
    // \uFEFF as an escape, not a literal BOM: the character itself trips
    // the irregular-whitespace lint and is invisible to anyone reading this.
    const csv = `\uFEFF${[COLUMNS.join(','), ...rows.map(row)].join('\r\n')}\r\n`
    const stamp = new Date().toISOString().slice(0, 10)

    return new Response(csv, {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="admin-access-requests-${stamp}.csv"`,
        'cache-control': 'no-store',
      },
    })
  } catch (error) {
    return errorResponse(error, requestId)
  }
}
