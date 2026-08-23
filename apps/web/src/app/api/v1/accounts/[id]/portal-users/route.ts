import { provisionAccountLoginSchema } from '@triyara/validation'

import { requireAuth } from '@/auth/context'
import { enforceWriteLimit, ok, parseBody, route } from '@/lib/api'
import { emailService } from '@/lib/email'
import { externalProvisioningService } from '@/lib/external-provisioning-service'

type Params = { params: Promise<{ id: string }> }

// POST /api/v1/accounts/[id]/portal-users - gives an approved account a login.
//
// Under /accounts rather than /admin/users, because the subject is the account:
// it is only meaningful for one, it is refused unless that account is APPROVED,
// and the resulting user belongs to it. Putting it beside the staff invite would
// have made "invite a colleague" and "give a customer portal access" neighbours,
// and they must not be confused for one another.
//
// Requires `manage User` and `manage Account`, both of which are ADMIN alone.
export function POST(req: Request, { params }: Params) {
  return route(req, async (requestId) => {
    const auth = await requireAuth()
    enforceWriteLimit(auth.user.id)
    const { id } = await params
    const dto = await parseBody(req, provisionAccountLoginSchema)

    const result = await externalProvisioningService.provision({ ...auth, requestId }, id, dto)

    if (result.status === 'already_linked') {
      // The safe repeat. 200 rather than 201: nothing was created, and no new
      // invitation was issued - re-sending one on every press would leave a
      // trail of live credentials for the same person.
      return ok(
        { id: result.user.id, name: result.user.name, email: result.user.email, accountId: id },
        { requestId, meta: { provisioned: false } },
      )
    }

    // Best-effort, exactly as every other send is: the user and their invitation
    // are already committed, and failing the request here would leave a login
    // that exists with no way to tell anyone so. The delivery outcome is
    // reported back rather than swallowed.
    //
    // `staffInvite` is reused deliberately. Its copy names no audience - "You
    // have been invited to TRIYARA... set your password and sign in" - and it
    // already carries the transport, retry, logging and the /reset-password link
    // that consumes a PasswordResetToken. A second template would be a second
    // thing to keep correct for one word.
    const delivery = await emailService.staffInvite({
      email: result.user.email,
      inviterName: auth.user.name ?? 'A TRIYARA administrator',
      token: result.token,
      expiresInHours: Math.round((result.expiresAt.getTime() - Date.now()) / 3_600_000),
    })

    // The token is never returned to the browser. An admin who could read it
    // could set the account holder's password.
    return ok(
      {
        id: result.user.id,
        name: result.user.name,
        email: result.user.email,
        accountId: id,
        expiresAt: result.expiresAt,
      },
      { requestId, status: 201, meta: { provisioned: true, invitationEmail: delivery.status } },
    )
  })
}
