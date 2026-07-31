import { assertAbility, type AuthContext } from '@triyara/auth'
import type {
  AuditListResult,
  AuditRepository,
  DashboardRepository,
  DashboardSummary,
  OrganizationRepository,
  UserRepository,
} from '@triyara/db'
import { NotFoundError } from '@triyara/lib'
import type { ListAuditQuery, UpdateOrganizationDto, UpdateProfileDto } from '@triyara/validation'

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
  audit: AuditRepository
  organizations: OrganizationRepository
  users: UserRepository
  dashboard: DashboardRepository
}

export interface ProfileRecord {
  id: string
  email: string
  name: string | null
  roles: string[]
  organizationId: string
  lastLoginAt: Date | null
}

export function createAdminService({ audit, organizations, users, dashboard }: AdminServiceDeps) {
  /** Shared by getProfile and updateProfile; `this` is unavailable in the
   *  object literal below, so the read lives here rather than on the service. */
  async function readProfile(userId: string): Promise<ProfileRecord> {
    const user = await users.findById(userId)
    if (!user) throw new NotFoundError('User not found.')
    return {
      id: user.id,
      email: user.email,
      name: user.name,
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
  }
}

export type AdminService = ReturnType<typeof createAdminService>
