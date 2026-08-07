import { inviteUserSchema, listAdminUsersQuerySchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { adminUsersService } from '@/lib/admin-users-service'
import { enforceWriteLimit, ok, parseBody, parseQuery, route } from '@/lib/api'
import { emailService } from '@/lib/email'

// GET /api/v1/admin/users - the tenant's people, for administering them.
//
// Distinct from GET /api/v1/users, which is unchanged. That one is a directory
// lookup behind global search: active users only, four fields, no paging, open
// to any signed-in role. This one carries status, roles and last sign-in, pages
// with a keyset cursor, and requires `manage User` - which, given ADMIN holds
// `manage all` and every other role holds only `read all`, is ADMIN alone.
//
// Changing what an existing person may do still belongs to
// /api/v1/auth/role-assignments and is not duplicated here; POST below only
// brings a new colleague into the tenant.
export function GET(req: Request) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    const query = parseQuery(new URL(req.url).searchParams, listAdminUsersQuerySchema)
    const result = await adminUsersService.list({ ...auth, requestId }, query)
    return ok(result.items, {
      requestId,
      meta: {
        pagination: { limit: query.limit, nextCursor: result.nextCursor },
        filters: {
          q: query.q ?? null,
          status: query.status ?? null,
          role: query.role ?? null,
        },
        sort: query.sort ?? '-createdAt',
      },
    })
  })
}

// POST /api/v1/admin/users - invites a colleague.
//
// Creates the account with a secret nobody sees and emails an invitation, so
// the invitee sets their own password before their first sign-in. Requires
// `manage User`, which is ADMIN alone.
export function POST(req: Request) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const dto = await parseBody(req, inviteUserSchema)
    const invited = await adminUsersService.invite({ ...auth, requestId }, dto)

    // Best-effort, exactly as every other send is: the account and its
    // invitation are already committed, and failing the request here would
    // leave a colleague who exists with no way to tell them so. The delivery
    // outcome is reported back rather than swallowed.
    const delivery = await emailService.staffInvite({
      email: invited.email,
      inviterName: auth.user.name ?? 'A TRIYARA administrator',
      token: invited.token,
      expiresInHours: Math.round((invited.expiresAt.getTime() - Date.now()) / 3_600_000),
    })

    // The token is never returned to the browser. An admin who could read it
    // could set a colleague's password.
    return ok(
      {
        id: invited.id,
        name: invited.name,
        email: invited.email,
        role: invited.role,
        expiresAt: invited.expiresAt,
      },
      { requestId, status: 201, meta: { invitationEmail: delivery.status } },
    )
  })
}
