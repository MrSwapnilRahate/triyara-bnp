import {
  type Action,
  type AppAbility,
  buildAbilityFor,
  type Role,
  type Subject,
} from '@triyara/auth'
import { describe, expect, it, vi } from 'vitest'

import { createLoginAuditService } from '../auth/login-audit.service'
import { createAdminService } from './admin.service'

/**
 * The audit and login-attempt trails decided on their own subject.
 *
 * They were authorized as `manage Organization`, which was picked for its
 * effect rather than its meaning: it happens to resolve to ADMIN only. The
 * cost was that "may rename the tenant" and "may read every before/after
 * payload recorded in it" were one permission, so a future policy could not
 * separate tenant administration from reading the trail.
 *
 * The level stays at `manage`, and that is the load-bearing part. Every role
 * holds `read all`, so `read AuditLog` would have quietly handed both trails
 * to EXPORTER, VERIFIER and READ_ONLY. The tests below pin the level as
 * firmly as the subject.
 */

const ROLES: Role[] = ['ADMIN', 'EXPORTER', 'VERIFIER', 'READ_ONLY']
const BELOW_ADMIN: Role[] = ['EXPORTER', 'VERIFIER', 'READ_ONLY']

describe('the AuditLog subject grants exactly what Organization used to', () => {
  it.each(ROLES)('gives %s the same answer on manage as `manage Organization` did', (role) => {
    // The migration is behaviour-preserving. If these ever diverge it has to be
    // a decision somebody made, not something that leaked out of this refactor.
    const a = buildAbilityFor([role])
    expect(a.can('manage', 'AuditLog'), `${role} manage AuditLog`).toBe(
      a.can('manage', 'Organization'),
    )
  })

  it('lets ADMIN manage the trail', () => {
    // Through `manage all`, not through a rule naming AuditLog: nothing was
    // added to buildAbilityFor, which is why no other role could pick it up.
    expect(buildAbilityFor(['ADMIN']).can('manage', 'AuditLog')).toBe(true)
  })

  it.each(BELOW_ADMIN)('refuses %s the trail', (role) => {
    expect(buildAbilityFor([role]).can('manage', 'AuditLog')).toBe(false)
  })

  it('would have leaked the trail to every role at `read`', () => {
    // Why the subject is guarded at `manage`. This is the widening that using
    // `read AuditLog` would have caused, stated as an executable fact rather
    // than a comment - `read all` covers a new subject the moment it exists.
    for (const role of BELOW_ADMIN) {
      expect(buildAbilityFor([role]).can('read', 'AuditLog'), `${role} read`).toBe(true)
      expect(buildAbilityFor([role]).can('manage', 'AuditLog'), `${role} manage`).toBe(false)
    }
  })

  it('carries AuditLog in the subject vocabulary', () => {
    // The permission-matrix endpoint enumerates SUBJECTS, so an absent subject
    // would report nothing rather than fail.
    expect(buildAbilityFor(['ADMIN']).can('manage', 'AuditLog')).toBe(true)
  })
})

describe('the two subjects are genuinely separate', () => {
  /**
   * An actor built by hand rather than from a role, holding one subject and not
   * the other. Nobody is configured this way today - which is why every
   * assertion above still matches Organization - but the vocabulary now allows
   * it, and these are the shapes that were impossible before.
   */
  const only = (...held: Subject[]): AppAbility =>
    ({ can: (_a: Action, s: Subject) => held.includes(s) }) as unknown as AppAbility

  it('does not let AuditLog permission manage the organization', () => {
    const auditor = only('AuditLog')
    expect(auditor.can('manage', 'AuditLog')).toBe(true)
    expect(auditor.can('manage', 'Organization')).toBe(false)
  })

  it('does not let Organization permission read the trails', () => {
    const tenantAdmin = only('Organization')
    expect(tenantAdmin.can('manage', 'Organization')).toBe(true)
    expect(tenantAdmin.can('manage', 'AuditLog')).toBe(false)
  })

  it('leaves the subjects the other work established alone', () => {
    // G5.2 (RFQ/Quotation), G5.3 (Product/Category), G5.4 (supplier history)
    // and G4 (security metadata) must all be unaffected.
    const em = buildAbilityFor(['EXPORTER'])
    expect(em.can('create', 'RFQ')).toBe(true)
    expect(em.can('create', 'Quotation')).toBe(true)
    expect(em.can('create', 'Product')).toBe(false)
    expect(em.can('create', 'Category')).toBe(false)
    expect(em.can('read', 'SupplierProfile')).toBe(true)
    expect(em.can('manage', 'User')).toBe(false)
    expect(buildAbilityFor(['READ_ONLY']).can('manage', 'User')).toBe(false)
  })

  it('leaves organization settings exactly as they were', () => {
    // Readable by every role, writable by ADMIN. Untouched by this change, and
    // the reason not every `Organization` guard was rewritten.
    for (const role of ROLES) {
      expect(buildAbilityFor([role]).can('read', 'Organization'), role).toBe(true)
    }
    expect(buildAbilityFor(['ADMIN']).can('manage', 'Organization')).toBe(true)
    for (const role of BELOW_ADMIN) {
      expect(buildAbilityFor([role]).can('manage', 'Organization'), role).toBe(false)
    }
  })
})

/**
 * The part an ability-only test cannot reach.
 *
 * While Organization and AuditLog grant the same thing to every configured
 * role, no behavioural test can tell which subject a service consults -
 * swapping one for the other changes no answer. So these build actors whose
 * permissions deliberately differ between the two, which is the only way to
 * observe the choice. Restore the old proxy and they fail.
 */
describe('the services consult AuditLog, not Organization', () => {
  const auditRow = { id: 'a1', entityType: 'RFQ', entityId: 'r1', action: 'rfq.created' }
  const attemptRow = { id: 'l1', email: 'a@b.com', outcome: 'SUCCESS' }

  /** A context whose answer depends on which subject is asked about. */
  function ctx(...held: Subject[]) {
    const ability = {
      can: (_action: Action, subject: Subject) => held.includes(subject),
    } as unknown as AppAbility
    const user = { id: 'u1', organizationId: 'org1', email: 'a@b.com', name: 'A', roles: [] }
    return { user, organizationId: 'org1', ability, requestId: 'r1' }
  }

  /** May read the trails, but is not a tenant administrator. */
  const auditor = () => ctx('AuditLog')
  /** The mirror image: administers the tenant, but holds no trail permission. */
  const tenantAdmin = () => ctx('Organization')

  function admin() {
    type ListParams = { limit: number; entityType?: string; cursor?: string }
    const list = vi.fn(async (_org: string, _p: ListParams) => ({
      items: [auditRow],
      nextCursor: 'cur1',
    }))
    const forEntity = vi.fn(async (_org: string, _t: string, _i: string) => [auditRow])
    const organizations = { findById: async () => ({ id: 'org1', name: 'T', slug: 't' }) }
    const svc = createAdminService({
      analytics: {} as never,
      audit: { list, forEntity } as never,
      organizations: organizations as never,
      users: {} as never,
      dashboard: {} as never,
    })
    return { svc, list, forEntity }
  }

  function loginAudit() {
    type ListParams = { organizationId: string; limit: number; email?: string }
    const list = vi.fn(async (_p: ListParams) => ({ items: [attemptRow], nextCursor: null }))
    const svc = createLoginAuditService({
      attempts: { list } as never,
      security: {} as never,
    })
    return { svc, list }
  }

  const auditQuery = { limit: 25 } as never
  const loginQuery = { limit: 25 } as never

  describe('listAudit', () => {
    it('serves an actor holding AuditLog', async () => {
      const { svc, list } = admin()
      await expect(svc.listAudit(auditor(), auditQuery)).resolves.toBeDefined()
      expect(list).toHaveBeenCalled()
    })

    it('refuses a tenant administrator who holds only Organization', async () => {
      // The regression this guards: `manage Organization` used to be the key.
      const { svc, list } = admin()
      await expect(svc.listAudit(tenantAdmin(), auditQuery)).rejects.toThrow(/not permitted/i)
      expect(list).not.toHaveBeenCalled()
    })
  })

  describe('auditForEntity', () => {
    it('serves an actor holding AuditLog', async () => {
      const { svc, forEntity } = admin()
      await expect(svc.auditForEntity(auditor(), 'RFQ', 'r1')).resolves.toBeDefined()
      expect(forEntity).toHaveBeenCalled()
    })

    it('refuses a tenant administrator who holds only Organization', async () => {
      const { svc, forEntity } = admin()
      await expect(svc.auditForEntity(tenantAdmin(), 'RFQ', 'r1')).rejects.toThrow(/not permitted/i)
      expect(forEntity).not.toHaveBeenCalled()
    })
  })

  describe('loginAudit.list', () => {
    it('serves an actor holding AuditLog', async () => {
      const { svc, list } = loginAudit()
      await expect(svc.list(auditor(), loginQuery)).resolves.toBeDefined()
      expect(list).toHaveBeenCalled()
    })

    it('refuses a tenant administrator who holds only Organization', async () => {
      const { svc, list } = loginAudit()
      await expect(svc.list(tenantAdmin(), loginQuery)).rejects.toThrow(/not permitted/i)
      expect(list).not.toHaveBeenCalled()
    })
  })

  describe('organization settings still consult Organization', () => {
    // The other half of the sweep: these guards were deliberately left alone,
    // so an over-eager find-and-replace across `manage Organization` fails here.
    it('refuses the organization read to an actor holding only AuditLog', async () => {
      const { svc } = admin()
      await expect(svc.getOrganization(auditor())).rejects.toThrow(/not permitted/i)
    })

    it('refuses the organization write to an actor holding only AuditLog', async () => {
      const { svc } = admin()
      await expect(svc.updateOrganization(auditor(), { name: 'Nope' } as never)).rejects.toThrow(
        /not permitted/i,
      )
    })

    it('still serves the organization read to a tenant administrator', async () => {
      const { svc } = admin()
      await expect(svc.getOrganization(tenantAdmin())).resolves.toBeDefined()
    })
  })

  /**
   * The doubles above prove WHICH subject is consulted; they cannot prove at
   * what LEVEL, because an actor holding `AuditLog` answers true for every
   * action on it. So these drive the same services with real abilities, where
   * `read all` makes the difference between `read` and `manage` visible: drop
   * either guard to `read AuditLog` and the three denials below start passing.
   */
  describe('every configured role keeps exactly the access it had', () => {
    const roleCtx = (role: Role) => ({
      user: { id: 'u1', organizationId: 'org1', email: 'a@b.com', name: 'A', roles: [role] },
      organizationId: 'org1',
      ability: buildAbilityFor([role]),
      requestId: 'r1',
    })

    it('lets ADMIN read both trails', async () => {
      const { svc } = admin()
      const { svc: login } = loginAudit()
      await expect(svc.listAudit(roleCtx('ADMIN'), auditQuery)).resolves.toBeDefined()
      await expect(svc.auditForEntity(roleCtx('ADMIN'), 'RFQ', 'r1')).resolves.toBeDefined()
      await expect(login.list(roleCtx('ADMIN'), loginQuery)).resolves.toBeDefined()
    })

    it.each(BELOW_ADMIN)('refuses %s the audit trail', async (role) => {
      const { svc, list } = admin()
      await expect(svc.listAudit(roleCtx(role), auditQuery)).rejects.toThrow(/not permitted/i)
      expect(list).not.toHaveBeenCalled()
    })

    it.each(BELOW_ADMIN)('refuses %s one record’s history', async (role) => {
      const { svc, forEntity } = admin()
      await expect(svc.auditForEntity(roleCtx(role), 'RFQ', 'r1')).rejects.toThrow(/not permitted/i)
      expect(forEntity).not.toHaveBeenCalled()
    })

    it.each(BELOW_ADMIN)('refuses %s the login-attempt trail', async (role) => {
      const { svc, list } = loginAudit()
      await expect(svc.list(roleCtx(role), loginQuery)).rejects.toThrow(/not permitted/i)
      expect(list).not.toHaveBeenCalled()
    })
  })

  describe('a super admin reaches the trails the same way ADMIN does', () => {
    // SUPER_ADMIN is an email allowlist, not a role and not an ability rule -
    // `assertAbility` never consults it. A super admin reads the trails because
    // they hold ADMIN, so their row in the matrix is ADMIN's row by
    // construction. This change neither adds nor removes that path.
    const superAdminCtx = (roles: Role[]) => ({
      user: {
        id: 'u1',
        organizationId: 'org1',
        email: 'swapnilrahate6598@gmail.com',
        name: 'Super',
        roles,
      },
      organizationId: 'org1',
      ability: buildAbilityFor(roles),
      requestId: 'r1',
    })

    it('serves a super admin who holds ADMIN', async () => {
      const { svc } = admin()
      const { svc: login } = loginAudit()
      await expect(svc.listAudit(superAdminCtx(['ADMIN']), auditQuery)).resolves.toBeDefined()
      await expect(login.list(superAdminCtx(['ADMIN']), loginQuery)).resolves.toBeDefined()
    })

    it('is not an ability bypass on its own', async () => {
      // Being on the allowlist grants nothing here. Worth pinning: it is the
      // difference between "Super Admin is a role" and what the code does.
      const { svc } = admin()
      await expect(svc.listAudit(superAdminCtx(['READ_ONLY']), auditQuery)).rejects.toThrow(
        /not permitted/i,
      )
    })
  })

  describe('everything downstream of the guard is unchanged', () => {
    it('scopes the trail to the caller’s organization', async () => {
      // Tenant isolation never lived in the ability check, and still does not.
      const { svc, list, forEntity } = admin()
      await svc.listAudit(auditor(), auditQuery)
      await svc.auditForEntity(auditor(), 'RFQ', 'r1')
      expect(list.mock.calls[0]?.[0]).toBe('org1')
      expect(forEntity.mock.calls[0]?.[0]).toBe('org1')
    })

    it('scopes login attempts to the caller’s organization', async () => {
      const { svc, list } = loginAudit()
      await svc.list(auditor(), loginQuery)
      expect(list.mock.calls[0]?.[0]?.organizationId).toBe('org1')
    })

    it('passes the audit filters through untouched', async () => {
      const { svc, list } = admin()
      const query = {
        limit: 10,
        cursor: 'c1',
        entityType: 'RFQ',
        entityId: 'r1',
        actorId: 'u9',
        action: 'rfq.created',
        q: 'created',
        requestId: 'req-1',
      } as never
      await svc.listAudit(auditor(), query)
      expect(list.mock.calls[0]?.[1]).toMatchObject({
        limit: 10,
        cursor: 'c1',
        entityType: 'RFQ',
        entityId: 'r1',
        actorId: 'u9',
        action: 'rfq.created',
        q: 'created',
        requestId: 'req-1',
      })
    })

    it('passes the login-audit filters through untouched', async () => {
      const { svc, list } = loginAudit()
      const query = {
        limit: 5,
        cursor: 'c9',
        email: 'a@b.com',
        userId: 'u1',
        outcome: 'FAILED',
      } as never
      await svc.list(auditor(), query)
      expect(list.mock.calls[0]?.[0]).toMatchObject({
        limit: 5,
        cursor: 'c9',
        email: 'a@b.com',
        userId: 'u1',
        outcome: 'FAILED',
      })
    })

    it('returns the repository’s pagination cursor unchanged', async () => {
      const { svc } = admin()
      await expect(svc.listAudit(auditor(), auditQuery)).resolves.toMatchObject({
        nextCursor: 'cur1',
      })
    })
  })
})
