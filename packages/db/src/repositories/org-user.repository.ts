import type { RoleName } from '@prisma/client'

import { prisma } from '../client'

/**
 * Roles that must never be handed an internal domain-event notification.
 *
 * EXTERNAL_PARTY is an authenticated Buyer or Supplier. They are `User` rows in
 * the SAME organization as staff - `externalProvisioningService.provision`
 * creates them with `organizationId: ctx.organizationId` - so a lookup that asks
 * only for active users in a tenant returns them alongside every employee.
 *
 * That is the whole defect this list exists to close. `eventBus.emit` fans every
 * domain event through `generateNotifications`, so without this filter a buyer
 * accrued a notification row for every RFQ raised, every quotation priced, every
 * supplier onboarded and every verification decided in the tenant - each row
 * carrying a title, a body and an `entityId`. The rows were then readable:
 * `notificationService.list` scopes correctly to the caller's own recipient rows
 * and calls no `assertAbility`, and the middleware matcher excludes `/api`, so
 * `GET /api/v1/notifications` answered them.
 *
 * A list rather than a bare equality check, because the question this asks is
 * "which principals are not internal staff", and a second external role would be
 * one more entry here rather than a new shape at the call site.
 */
export const NON_INTERNAL_NOTIFICATION_ROLES: RoleName[] = ['EXTERNAL_PARTY']

// Read-only lookup used by the notification subscriber to resolve recipients.
export const orgUserRepository = {
  /**
   * The internal staff of one organization, as notification recipients.
   *
   * `none` rather than a positive `some` over the internal roles, which is the
   * narrower change and the safer one in the case the two differ: somebody
   * holding EXTERNAL_PARTY *and* an internal role. The ability builder already
   * contemplates that pairing - `buildAbilityFor(['READ_ONLY','EXTERNAL_PARTY'])`
   * is asserted to equal `buildAbilityFor(['READ_ONLY'])` - and such a person can
   * sign into the portal. Excluding them costs an internal notification;
   * including them would push internal events at a portal session. Between a
   * missed notification and a leak, this fails towards the missed notification.
   *
   * A user holding no role at all is still included, deliberately. That is
   * unchanged behaviour and not a leak: `authorized()` refuses every namespace
   * to a role-less session, so nothing is being widened here, and narrowing it
   * would be a second change riding along with a security fix.
   *
   * The filter lives in the query rather than in the caller. `undefined` in a
   * Prisma `where` omits the clause, so a scope applied afterwards in JavaScript
   * fails open the moment somebody forgets it; a clause written here cannot be
   * dropped without editing this line.
   */
  async listActiveUserIds(orgId: string): Promise<string[]> {
    const users = await prisma.user.findMany({
      where: {
        organizationId: orgId,
        status: 'ACTIVE',
        roles: { none: { role: { name: { in: NON_INTERNAL_NOTIFICATION_ROLES } } } },
      },
      select: { id: true },
    })
    return users.map((u) => u.id)
  },
}
