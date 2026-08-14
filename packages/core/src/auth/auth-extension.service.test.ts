import { ACTIONS, buildAbilityFor, type Role, ROLES, SUBJECTS } from '@triyara/auth'
import type {
  ScopedRoleRecord,
  ScopedRoleRepository,
  SessionRecord,
  SessionRepository,
} from '@triyara/db'
import type { DomainEvent, EventBus } from '@triyara/events'
import { describe, expect, it } from 'vitest'

import { createEmailVerificationService } from './email-verification.service'
import { createPermissionService } from './permission.service'
import { createScopedRoleService, type ScopedRoleCtx } from './scoped-role.service'
import { createSessionService } from './session.service'

function ctxFor(roles: Role[], userId = 'u1'): ScopedRoleCtx {
  const user = { id: userId, organizationId: 'org1', email: 'a@b.com', name: 'A', roles }
  return { user, organizationId: 'org1', ability: buildAbilityFor(roles), requestId: 'r1' }
}

function makeAssignment(over: Partial<ScopedRoleRecord> = {}): ScopedRoleRecord {
  return {
    id: 'sra1',
    organizationId: 'org1',
    userId: 'u2',
    roleId: 'role-verifier',
    scopeType: 'ACCOUNT',
    scopeId: 'acc1',
    grantedById: 'u1',
    grantedAt: new Date(),
    expiresAt: null,
    revokedAt: null,
    revokedById: null,
    reason: null,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    role: { id: 'role-verifier', name: 'VERIFIER' },
    ...over,
  }
}

function makeSession(over: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: 's1',
    userId: 'u1',
    organizationId: 'org1',
    tokenId: 'jti-1',
    ipAddress: null,
    userAgent: null,
    createdAt: new Date(),
    lastSeenAt: new Date(),
    expiresAt: new Date(Date.now() + 3_600_000),
    endedAt: null,
    endReason: null,
    ...over,
  }
}

function fakeEvents(sink: DomainEvent[] = []): EventBus {
  return {
    emit: async (e: DomainEvent) => {
      sink.push(e)
    },
    subscribe: () => undefined,
  } as unknown as EventBus
}

function fakeScopedRepo(over: Partial<ScopedRoleRepository> = {}): ScopedRoleRepository {
  return {
    grant: async () => makeAssignment(),
    findById: async () => makeAssignment(),
    list: async () => ({ items: [makeAssignment()], nextCursor: null }),
    findActiveForUser: async () => [makeAssignment()],
    findActiveForScope: async () => [makeAssignment()],
    revoke: async () => makeAssignment({ revokedAt: new Date(), version: 2 }),
    ...over,
  } as ScopedRoleRepository
}

function fakeSessionRepo(over: Partial<SessionRepository> = {}): SessionRepository {
  return {
    record: async () => makeSession(),
    findByTokenId: async () => makeSession(),
    findById: async () => makeSession(),
    isActive: async () => true,
    touch: async () => undefined,
    list: async () => ({ items: [makeSession()], nextCursor: null }),
    revoke: async () => makeSession({ endedAt: new Date(), endReason: 'REVOKED_BY_ADMIN' }),
    revokeAllForUser: async () => 2,
    ...over,
  } as SessionRepository
}

/**
 * Session owners for these cases are ordinary staff, so the Super Admin guard
 * in the service never fires and the behaviour under test is unchanged.
 */
function fakeSessionUsers(email = 'someone@triyara.test') {
  return {
    findById: async (id: string) => ({ id, organizationId: 'org1', email }),
  }
}

const roles = { findByName: async (name: 'VERIFIER' | never) => ({ id: 'role-verifier', name }) }
const users = {
  findById: async (id: string) => ({
    id,
    organizationId: 'org1',
    email: `${id}@triyara.test`,
  }),
}

describe('scoped role service', () => {
  it('lets an ADMIN grant a scoped role', async () => {
    const sink: DomainEvent[] = []
    const svc = createScopedRoleService({
      repo: fakeScopedRepo(),
      roles: roles as never,
      users,
      events: fakeEvents(sink),
    })

    const result = await svc.grant(ctxFor(['ADMIN']), {
      userId: 'u2',
      role: 'VERIFIER',
      scopeType: 'ACCOUNT',
      scopeId: 'acc1',
    })

    expect(result.role.name).toBe('VERIFIER')
    expect(sink.map((e) => e.type)).toContain('role.granted')
  })

  it('refuses a grant from a non-admin', async () => {
    const svc = createScopedRoleService({
      repo: fakeScopedRepo(),
      roles: roles as never,
      users,
      events: fakeEvents(),
    })

    await expect(
      svc.grant(ctxFor(['EXPORT_MANAGER']), {
        userId: 'u2',
        role: 'VERIFIER',
        scopeType: 'ACCOUNT',
        scopeId: 'acc1',
      }),
    ).rejects.toThrow(/not permitted/i)
  })

  it('rejects an expiry in the past', async () => {
    const svc = createScopedRoleService({
      repo: fakeScopedRepo(),
      roles: roles as never,
      users,
      events: fakeEvents(),
    })

    await expect(
      svc.grant(ctxFor(['ADMIN']), {
        userId: 'u2',
        role: 'VERIFIER',
        scopeType: 'ACCOUNT',
        scopeId: 'acc1',
        expiresAt: new Date(Date.now() - 1000),
      }),
    ).rejects.toThrow(/future/i)
  })

  it('will not revoke an already-revoked assignment', async () => {
    const svc = createScopedRoleService({
      repo: fakeScopedRepo({ findById: async () => makeAssignment({ revokedAt: new Date() }) }),
      roles: roles as never,
      users,
      events: fakeEvents(),
    })

    await expect(svc.revoke(ctxFor(['ADMIN']), 'sra1')).rejects.toThrow(/already revoked/i)
  })

  it('widens who holds a role without changing what the role means', async () => {
    const svc = createScopedRoleService({
      repo: fakeScopedRepo(),
      roles: roles as never,
      users,
      events: fakeEvents(),
    })

    // READ_ONLY globally, but granted VERIFIER on this one account.
    const access = await svc.effectiveAccess(ctxFor(['READ_ONLY']), {
      scopeType: 'ACCOUNT',
      scopeId: 'acc1',
    })

    expect(access.globalRoles).toEqual(['READ_ONLY'])
    expect(access.scopedRoles).toEqual(['VERIFIER'])
    expect(access.effectiveRoles).toEqual(['READ_ONLY', 'VERIFIER'])
  })
})

describe('permission service', () => {
  it('derives the matrix from CASL rather than storing it', () => {
    const svc = createPermissionService({ scopedRoles: fakeScopedRepo() })

    const admin = svc.mine(ctxFor(['ADMIN']))
    expect(admin.permissions.all).toContain('manage')

    const readOnly = svc.mine(ctxFor(['READ_ONLY']))
    expect(readOnly.permissions.all).toEqual(['read'])
    expect(readOnly.permissions.Account ?? []).not.toContain('update')
  })

  it('describes every role using the same function the guards call', () => {
    const svc = createPermissionService({ scopedRoles: fakeScopedRepo() })
    const matrix = svc.roleMatrix()

    expect(matrix.roles.map((r) => r.role).sort()).toEqual([...ROLES].sort())

    // Not a restatement: every cell must agree with buildAbilityFor, which is
    // what actually decides the answer at request time.
    for (const { role, permissions } of matrix.roles) {
      const ability = buildAbilityFor([role])
      for (const subject of matrix.subjects) {
        for (const action of matrix.actions) {
          const claimed = (permissions[subject] ?? []).includes(action)
          expect(claimed).toBe(ability.can(action, subject))
        }
      }
    }
  })

  it('ships the vocabulary so a client never keeps its own copy', () => {
    const svc = createPermissionService({ scopedRoles: fakeScopedRepo() })
    const matrix = svc.roleMatrix()

    // Identity, not equality: these are the arrays @triyara/auth exports, which
    // is the whole point - there is one list and everything reads it.
    expect(matrix.actions).toBe(ACTIONS)
    expect(matrix.subjects).toBe(SUBJECTS)
  })

  it('reflects a scoped grant in the effective matrix', async () => {
    const svc = createPermissionService({ scopedRoles: fakeScopedRepo() })
    const matrix = await svc.forScope(ctxFor(['READ_ONLY']), {
      scopeType: 'ACCOUNT',
      scopeId: 'acc1',
    })

    expect(matrix.scopedRoles).toEqual(['VERIFIER'])
    // VERIFIER may verify a Verification; READ_ONLY alone may not.
    expect(matrix.permissions.Verification).toContain('verify')
  })
})

describe('session service', () => {
  it('lets a user revoke their own session without elevated rights', async () => {
    const sink: DomainEvent[] = []
    const svc = createSessionService({
      repo: fakeSessionRepo(),
      users: fakeSessionUsers(),
      events: fakeEvents(sink),
    })

    const session = await svc.revoke(ctxFor(['READ_ONLY']), 's1', 'LOGOUT')

    expect(session.endedAt).not.toBeNull()
    expect(sink.map((e) => e.type)).toContain('session.revoked')
  })

  it("refuses to revoke another user's session without update:User", async () => {
    const svc = createSessionService({
      repo: fakeSessionRepo({ findById: async () => makeSession({ userId: 'someone-else' }) }),
      users: fakeSessionUsers(),
      events: fakeEvents(),
    })

    await expect(svc.revoke(ctxFor(['READ_ONLY']), 's1')).rejects.toThrow(/not permitted/i)
  })

  it('rejects a session that is no longer active', async () => {
    const svc = createSessionService({
      repo: fakeSessionRepo({ isActive: async () => false }),
      users: fakeSessionUsers(),
      events: fakeEvents(),
    })

    await expect(svc.assertActive('jti-gone')).rejects.toThrow(/no longer valid/i)
  })
})

/**
 * The line between business data and security metadata.
 *
 * Every role carries `read all`, so a check written as `read User` was
 * satisfied by READ_ONLY. That made a session row - IP address, user agent,
 * last seen - and the shape of everyone's privilege readable by anyone who
 * could sign in. These cross-user reads are administration, and are gated on
 * `manage User`, which only ADMIN resolves.
 *
 * Asserted against the services, not the screens: the UI hiding a panel is not
 * authorization, and a client can call the route directly.
 */
describe('security metadata is administration, not a read', () => {
  const OPERATIONAL: Role[][] = [['EXPORT_MANAGER'], ['VERIFIER'], ['READ_ONLY']]

  const sessions = () =>
    createSessionService({
      repo: fakeSessionRepo({ list: async () => ({ items: [makeSession()], nextCursor: null }) }),
      // Ordinary staff own these sessions, so the Super Admin guard added in
      // the same service never fires and the read boundary is what is measured.
      users: fakeSessionUsers(),
      events: fakeEvents(),
    })

  const scoped = () =>
    createScopedRoleService({
      repo: fakeScopedRepo(),
      roles: roles as never,
      users,
      events: fakeEvents(),
    })

  const permissions = () => createPermissionService({ scopedRoles: fakeScopedRepo() })

  describe.each(OPERATIONAL)('%s is refused', (role) => {
    it("another user's sessions", async () => {
      await expect(
        sessions().list(ctxFor([role]), { userId: 'someone-else', limit: 25 }),
      ).rejects.toThrow(/not permitted/i)
    })

    it('the scoped role assignment list', async () => {
      await expect(scoped().list(ctxFor([role]), { limit: 25 })).rejects.toThrow(/not permitted/i)
    })

    it("another user's effective access", async () => {
      await expect(
        scoped().effectiveAccess(ctxFor([role]), {
          userId: 'someone-else',
          scopeType: 'ACCOUNT',
          scopeId: 'acc1',
        }),
      ).rejects.toThrow(/not permitted/i)
    })

    it("another user's permission matrix", async () => {
      await expect(
        permissions().forScope(ctxFor([role]), {
          userId: 'someone-else',
          scopeType: 'ACCOUNT',
          scopeId: 'acc1',
        }),
      ).rejects.toThrow(/not permitted/i)
    })
  })

  describe.each(OPERATIONAL)('%s keeps what it legitimately needs', (role) => {
    it('its own sessions', async () => {
      await expect(sessions().list(ctxFor([role]), { limit: 25 })).resolves.toBeDefined()
    })

    it('its own effective access', async () => {
      const access = await scoped().effectiveAccess(ctxFor([role]), {
        scopeType: 'ACCOUNT',
        scopeId: 'acc1',
      })
      expect(access.globalRoles).toEqual([role])
    })

    it('its own permissions', () => {
      expect(permissions().mine(ctxFor([role])).permissions.all).toContain('read')
    })

    it('business reads across the tenant', () => {
      // The point of the change: `read all` still means all business data.
      const ability = buildAbilityFor([role])
      for (const subject of ['Account', 'SupplierProfile', 'BuyerProfile', 'Document'] as const) {
        expect(ability.can('read', subject), `${role} must still read ${subject}`).toBe(true)
      }
    })
  })

  describe('an administrator still sees everything they administer', () => {
    it("reads another user's sessions", async () => {
      await expect(
        sessions().list(ctxFor(['ADMIN']), { userId: 'someone-else', limit: 25 }),
      ).resolves.toBeDefined()
    })

    it('reads the scoped role assignment list', async () => {
      await expect(scoped().list(ctxFor(['ADMIN']), { limit: 25 })).resolves.toBeDefined()
    })

    it("reads another user's effective access", async () => {
      await expect(
        scoped().effectiveAccess(ctxFor(['ADMIN']), {
          userId: 'someone-else',
          scopeType: 'ACCOUNT',
          scopeId: 'acc1',
        }),
      ).resolves.toBeDefined()
    })

    it("reads another user's permission matrix", async () => {
      await expect(
        permissions().forScope(ctxFor(['ADMIN']), {
          userId: 'someone-else',
          scopeType: 'ACCOUNT',
          scopeId: 'acc1',
        }),
      ).resolves.toBeDefined()
    })
  })

  it('closes the boundary at the ability, so no subject restores it', () => {
    // A role that cannot `manage User` has no other action that satisfies the
    // guard - the refusal cannot be walked around through a different subject.
    for (const role of ['EXPORT_MANAGER', 'VERIFIER', 'READ_ONLY'] as const) {
      const ability = buildAbilityFor([role])
      expect(ability.can('manage', 'User')).toBe(false)
      expect(ability.can('manage', 'all')).toBe(false)
    }
    expect(buildAbilityFor(['ADMIN']).can('manage', 'User')).toBe(true)
  })
})

describe('a security profile is administration too', () => {
  const svc = () =>
    createEmailVerificationService({
      repo: {
        ensure: async (userId: string) => ({ userId, emailVerifiedAt: null }),
      } as never,
      users,
      events: fakeEvents(),
    })

  it.each([['EXPORT_MANAGER'], ['VERIFIER'], ['READ_ONLY']] as const)(
    "refuses %s another user's verification status",
    async (role) => {
      await expect(svc().status(ctxFor([role]), 'someone-else')).rejects.toThrow(/not permitted/i)
    },
  )

  it.each([['EXPORT_MANAGER'], ['VERIFIER'], ['READ_ONLY']] as const)(
    'still lets %s read its own',
    async (role) => {
      await expect(svc().status(ctxFor([role]))).resolves.toBeDefined()
    },
  )

  it("lets an administrator read another user's", async () => {
    await expect(svc().status(ctxFor(['ADMIN']), 'someone-else')).resolves.toBeDefined()
  })
})
