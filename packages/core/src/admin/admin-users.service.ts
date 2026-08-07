import { createHash, randomBytes } from 'node:crypto'

import { assertAbility, type AuthContext } from '@triyara/auth'
import type { AdminUserRecord, UserRepository } from '@triyara/db'
import { type EventBus, makeEvent } from '@triyara/events'
import type { InviteUserDto, ListAdminUsersQuery } from '@triyara/validation'

/**
 * User administration (TRY-BNP-ADMIN-02).
 *
 * A service of its own rather than another method on AdminService. That one
 * answers "what happened and how is this tenant configured" - audit, settings,
 * dashboard, the caller's own profile. This one answers "who are the people in
 * this tenant", which is a different subject with a stricter gate, and mixing
 * them would put the tenant's roster behind the same door as its date format.
 *
 * Authorization is `manage User`. That reuses the frozen CASL subject and
 * introduces nothing new: ADMIN holds `manage all`, and every other role holds
 * only `read all`, so `manage User` is ADMIN and no one else. Gating on
 * `read User` would have opened the roster - with status and last sign-in - to
 * every signed-in role, which is precisely what the narrow directory endpoint
 * exists to avoid.
 */

export type AdminUsersServiceCtx = AuthContext & { requestId?: string }

export interface AdminUsersServiceDeps {
  users: UserRepository
  events: EventBus
  /** Injected so the service never imports bcrypt directly. */
  hashPassword: (plain: string) => Promise<string>
  /** Invitation lifetime. Defaults to 48 hours. */
  inviteTtlMs?: number
}

/** What the caller needs to deliver the invitation, returned exactly once. */
export interface InvitedUser {
  id: string
  name: string
  email: string
  role: string
  /** Plaintext invitation token. Never stored, never retrievable again. */
  token: string
  expiresAt: Date
}

const DEFAULT_INVITE_TTL_MS = 48 * 60 * 60 * 1000

export interface AdminUserListItem {
  id: string
  name: string
  email: string
  avatarUrl: string | null
  status: string
  roles: string[]
  lastLoginAt: Date | null
  createdAt: Date
}

export interface AdminUserListResponse {
  items: AdminUserListItem[]
  nextCursor: string | null
}

/**
 * Flattens the role join into the array the API promises. Done here rather than
 * in the repository so the repository keeps returning what Prisma gave it, and
 * done here rather than in the route so the route keeps returning what the
 * service gave it.
 */
function toListItem(row: AdminUserRecord): AdminUserListItem {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    avatarUrl: row.avatarUrl,
    status: row.status,
    roles: row.roles.map((r) => r.role.name),
    lastLoginAt: row.lastLoginAt,
    createdAt: row.createdAt,
  }
}

export function createAdminUsersService({
  users,
  events,
  hashPassword,
  inviteTtlMs = DEFAULT_INVITE_TTL_MS,
}: AdminUsersServiceDeps) {
  return {
    /**
     * The tenant's people, newest first by default.
     *
     * Scoped to `ctx.organizationId` in the repository query itself, not
     * filtered afterwards: a caller cannot widen it by any combination of
     * parameters, because the organization is never one of them.
     */
    async list(
      ctx: AdminUsersServiceCtx,
      query: ListAdminUsersQuery,
    ): Promise<AdminUserListResponse> {
      assertAbility(ctx, 'manage', 'User')

      const result = await users.listForAdmin(ctx.organizationId, {
        limit: query.limit,
        ...(query.cursor ? { cursor: query.cursor } : {}),
        ...(query.q ? { q: query.q } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.role ? { role: query.role } : {}),
        ...(query.sort ? { sort: query.sort } : {}),
      })

      return { items: result.items.map(toListItem), nextCursor: result.nextCursor }
    },

    /**
     * Invites a colleague.
     *
     * The account is created with a random secret nobody ever sees, so it
     * cannot be signed into. The only way in is the invitation link, which
     * means the invitee chooses their own password before their first sign-in
     * rather than being handed one and asked to change it later. There is no
     * window in which a working password exists that someone else has seen.
     *
     * The plaintext token is returned once, to the caller, so it can be
     * emailed. Only its SHA-256 hash is persisted - the same shape the
     * password-reset flow already uses, and the same page consumes it.
     */
    async invite(ctx: AdminUsersServiceCtx, dto: InviteUserDto): Promise<InvitedUser> {
      assertAbility(ctx, 'manage', 'User')

      // 48 random bytes: this is never typed by a human and never displayed,
      // so it is sized to be unguessable rather than memorable.
      const unusableSecret = randomBytes(48).toString('hex')
      const token = randomBytes(32).toString('hex')
      const expiresAt = new Date(Date.now() + inviteTtlMs)

      const user = await users.createWithInvite(
        { actorId: ctx.user.id, organizationId: ctx.organizationId, requestId: ctx.requestId },
        {
          email: dto.email,
          name: dto.name,
          passwordHash: await hashPassword(unusableSecret),
          roleName: dto.role,
          tokenHash: createHash('sha256').update(token).digest('hex'),
          tokenExpiresAt: expiresAt,
        },
      )

      await events.emit(
        makeEvent({
          type: 'user.invited',
          organizationId: ctx.organizationId,
          actorId: ctx.user.id,
          // No token and no hash: this payload reaches the activity feed, the
          // notification generator and the logs.
          data: { userId: user.id, email: user.email, name: user.name, role: dto.role },
        }),
      )

      return { ...user, role: dto.role, token, expiresAt }
    },
  }
}

export type AdminUsersService = ReturnType<typeof createAdminUsersService>
