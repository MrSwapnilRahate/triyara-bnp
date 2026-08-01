import { ACTIONS, buildAbilityFor, type Role, ROLES, SUBJECTS } from '@triyara/auth'
import type {
  ScopedRoleRecord,
  ScopedRoleRepository,
  SessionRecord,
  SessionRepository,
} from '@triyara/db'
import type { DomainEvent, EventBus } from '@triyara/events'
import { describe, expect, it } from 'vitest'

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

const roles = { findByName: async (name: 'VERIFIER' | never) => ({ id: 'role-verifier', name }) }
const users = { findById: async (id: string) => ({ id, organizationId: 'org1' }) }

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
    const svc = createSessionService({ repo: fakeSessionRepo(), events: fakeEvents(sink) })

    const session = await svc.revoke(ctxFor(['READ_ONLY']), 's1', 'LOGOUT')

    expect(session.endedAt).not.toBeNull()
    expect(sink.map((e) => e.type)).toContain('session.revoked')
  })

  it("refuses to revoke another user's session without update:User", async () => {
    const svc = createSessionService({
      repo: fakeSessionRepo({ findById: async () => makeSession({ userId: 'someone-else' }) }),
      events: fakeEvents(),
    })

    await expect(svc.revoke(ctxFor(['READ_ONLY']), 's1')).rejects.toThrow(/not permitted/i)
  })

  it('rejects a session that is no longer active', async () => {
    const svc = createSessionService({
      repo: fakeSessionRepo({ isActive: async () => false }),
      events: fakeEvents(),
    })

    await expect(svc.assertActive('jti-gone')).rejects.toThrow(/no longer valid/i)
  })
})
