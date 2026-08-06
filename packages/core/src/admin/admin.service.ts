import { assertAbility, type AuthContext, hashPassword, verifyPassword } from '@triyara/auth'
import type {
  AnalyticsRepository,
  AuditListResult,
  AuditRepository,
  DashboardRepository,
  DashboardSummary,
  DashboardTrends,
  OrganizationRepository,
  UserRepository,
} from '@triyara/db'
import { ForbiddenError, NotFoundError, ValidationError } from '@triyara/lib'
import type {
  ChangePasswordDto,
  ListAuditQuery,
  ListUsersQuery,
  TrendsQuery,
  UpdateOrganizationDto,
  UpdateProfileDto,
} from '@triyara/validation'

// Administration services (TRY-BNP-ADMIN-01).
//
// Authorization reuses the frozen CASL subjects; no new subject is introduced.
//
//   Audit trail        -> `manage Organization`, i.e. ADMIN only. The trail
//                         carries before/after payloads for every entity in the
//                         tenant, so it is strictly more revealing than any
//                         single module's read permission.
//   Organization read  -> `read Organization` (every role)
//   Organization write -> `manage Organization` (ADMIN only)
//   Profile            -> authentication only. A user reads and renames their
//                         OWN record; there is no id parameter to point
//                         elsewhere, so there is nothing for an ability to gate.
//   Dashboard summary  -> `read Account`. These are counts of records the
//                         caller can already list; withholding the count while
//                         serving the rows would protect nothing.

export type AdminServiceCtx = AuthContext & { requestId?: string }

export interface AdminServiceDeps {
  analytics: AnalyticsRepository
  audit: AuditRepository
  organizations: OrganizationRepository
  users: UserRepository
  dashboard: DashboardRepository
}

export interface ProfileRecord {
  id: string
  email: string
  name: string | null
  avatarUrl: string | null
  preferences: Record<string, unknown> | null
  roles: string[]
  organizationId: string
  lastLoginAt: Date | null
}

const TREND_MONTHS: Record<string, number> = { '3m': 3, '6m': 6, '12m': 12 }

export function createAdminService({
  analytics,
  audit,
  organizations,
  users,
  dashboard,
}: AdminServiceDeps) {
  /** Shared by getProfile and updateProfile; `this` is unavailable in the
   *  object literal below, so the read lives here rather than on the service. */
  async function readProfile(userId: string): Promise<ProfileRecord> {
    const user = await users.findById(userId)
    if (!user) throw new NotFoundError('User not found.')
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      preferences: (user.preferences ?? null) as Record<string, unknown> | null,
      roles: user.roles.map((r) => r.role.name),
      organizationId: user.organizationId,
      lastLoginAt: user.lastLoginAt,
    }
  }

  return {
    /** The audit trail, newest first. Read-only: nothing writes through here. */
    async listAudit(ctx: AdminServiceCtx, query: ListAuditQuery): Promise<AuditListResult> {
      assertAbility(ctx, 'manage', 'Organization')
      return audit.list(ctx.organizationId, {
        limit: query.limit,
        ...(query.cursor ? { cursor: query.cursor } : {}),
        ...(query.entityType ? { entityType: query.entityType } : {}),
        ...(query.entityId ? { entityId: query.entityId } : {}),
        ...(query.actorId ? { actorId: query.actorId } : {}),
        ...(query.action ? { action: query.action } : {}),
        ...(query.q ? { q: query.q } : {}),
        ...(query.requestId ? { requestId: query.requestId } : {}),
        ...(query.before ? { before: query.before } : {}),
        ...(query.after ? { after: query.after } : {}),
      })
    },

    /** Everything that ever happened to one record, oldest first. */
    async auditForEntity(ctx: AdminServiceCtx, entityType: string, entityId: string) {
      assertAbility(ctx, 'manage', 'Organization')
      return audit.forEntity(ctx.organizationId, entityType, entityId)
    },

    async getOrganization(ctx: AdminServiceCtx) {
      assertAbility(ctx, 'read', 'Organization')
      const organization = await organizations.findById(ctx.organizationId)
      if (!organization) throw new NotFoundError('Organization not found.')
      return organization
    },

    async updateOrganization(ctx: AdminServiceCtx, dto: UpdateOrganizationDto) {
      assertAbility(ctx, 'manage', 'Organization')
      // Confirms the tenant exists before writing, so a stale session cannot
      // rename a record that has gone.
      const current = await organizations.findById(ctx.organizationId)
      if (!current) throw new NotFoundError('Organization not found.')
      return organizations.update(ctx.organizationId, dto)
    },

    /**
     * The caller's own profile. Reads by ctx.user.id, never by a supplied id -
     * which is why this needs no ability check: there is no way to aim it at
     * somebody else's record.
     */
    async getProfile(ctx: AdminServiceCtx): Promise<ProfileRecord> {
      return readProfile(ctx.user.id)
    },

    async updateProfile(ctx: AdminServiceCtx, dto: UpdateProfileDto): Promise<ProfileRecord> {
      // Reads first so a missing user is a 404 rather than a Prisma error.
      await readProfile(ctx.user.id)
      await users.updateProfile(ctx.user.id, dto)
      return readProfile(ctx.user.id)
    },

    async summary(ctx: AdminServiceCtx): Promise<DashboardSummary> {
      assertAbility(ctx, 'read', 'Account')
      return dashboard.summary(ctx.organizationId)
    },

    /** Live aggregates for the dashboard charts. */
    async trends(ctx: AdminServiceCtx, query: TrendsQuery): Promise<DashboardTrends> {
      assertAbility(ctx, 'read', 'Account')
      return analytics.trends(ctx.organizationId, TREND_MONTHS[query.window] ?? 6)
    },

    /**
     * Changes the caller's own password. The current one must be supplied and
     * verified: a hijacked session must not be able to lock the real owner out.
     */
    async changePassword(ctx: AdminServiceCtx, dto: ChangePasswordDto): Promise<void> {
      const hash = await users.findPasswordHash(ctx.user.id)
      if (!hash) throw new NotFoundError('User not found.')
      if (!(await verifyPassword(dto.currentPassword, hash))) {
        throw new ForbiddenError('Current password is incorrect.')
      }
      if (await verifyPassword(dto.newPassword, hash)) {
        throw new ValidationError('The new password must differ from the current one.')
      }
      await users.updatePassword(ctx.user.id, await hashPassword(dto.newPassword))
    },

    /**
     * Colleague lookup for global search. Read-only and deliberately narrow:
     * name, email and avatar, never anything else about a colleague.
     */
    async searchUsers(ctx: AdminServiceCtx, query: ListUsersQuery) {
      assertAbility(ctx, 'read', 'User')
      return users.searchDirectory(ctx.organizationId, query.q, query.limit)
    },
  }
}

export type AdminService = ReturnType<typeof createAdminService>
