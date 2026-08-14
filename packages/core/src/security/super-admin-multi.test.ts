import { buildAbilityFor, type Role } from '@triyara/auth'
import type { UserRoleRepository } from '@triyara/db'
import type { DomainEvent, EventBus } from '@triyara/events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Type-only: the value is loaded dynamically below, after the env is stubbed.
import type { createUserRoleService as createUserRoleServiceType } from '../auth/user-role.service'

/**
 * The hierarchy with more than one Super Admin configured.
 *
 * `SUPER_ADMIN_EMAILS` is read once when the module loads, so these cases set
 * the variable and then import through `vi.resetModules()` - reading it per
 * call would let a mid-process change alter the answer between a check and the
 * write it guards, which is a property worth keeping.
 *
 * Fake identities only. The addresses here exist nowhere but this file.
 */

const SUPER_1 = 'super1@example.test'
const SUPER_2 = 'super2@example.test'
const PLAIN_ADMIN = 'admin@example.test'

/** Loads the service with two Super Admins configured. */
async function loadWithTwoSuperAdmins() {
  vi.resetModules()
  vi.stubEnv('SUPER_ADMIN_EMAILS', `${SUPER_1}, ${SUPER_2}`)
  const security = await import('./super-admin')
  const { createUserRoleService } = await import('../auth/user-role.service')
  return { security, createUserRoleService }
}

const events = (): EventBus =>
  ({ emit: async (_e: DomainEvent) => undefined }) as unknown as EventBus

function ctxFor(email: string, id = 'actor') {
  const roles: Role[] = ['ADMIN']
  const user = { id, organizationId: 'org1', email, name: 'A', roles }
  return { user, organizationId: 'org1', ability: buildAbilityFor(roles), requestId: 'r1' }
}

type CreateUserRoleService = typeof createUserRoleServiceType

function makeService(
  createUserRoleService: CreateUserRoleService,
  targetEmail: string,
  otherAdminEmails: string[] = [],
) {
  const revoke = vi.fn(async () => ({ roles: [], lastAdmin: false }))
  const repo = {
    listForUser: async () => [],
    listAdminEmails: async () => otherAdminEmails,
    assign: vi.fn(),
    revoke,
  } as unknown as UserRoleRepository

  const service = createUserRoleService({
    repo,
    roles: { findByName: async (name: string) => ({ id: `role_${name}`, name }) } as never,
    users: {
      findById: async (id: string) => ({ id, organizationId: 'org1', email: targetEmail }),
    },
    events: events(),
  })
  return { service, revoke }
}

beforeEach(() => {
  vi.unstubAllEnvs()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('both configured super admins are recognised', () => {
  it('reads every address from the variable', async () => {
    const { security } = await loadWithTwoSuperAdmins()
    expect(security.isSuperAdmin(SUPER_1)).toBe(true)
    expect(security.isSuperAdmin(SUPER_2)).toBe(true)
    expect(security.isSuperAdmin(PLAIN_ADMIN)).toBe(false)
  })
})

describe('an ordinary administrator cannot demote either super admin', () => {
  it('refuses removing the first one’s ADMIN role', async () => {
    const { createUserRoleService } = await loadWithTwoSuperAdmins()
    // The other Super Admin still holds ADMIN, so the old "last holder" guard
    // would have permitted this. The rule is now about who is acting.
    const { service, revoke } = makeService(createUserRoleService, SUPER_1, [SUPER_2])

    await expect(service.revoke(ctxFor(PLAIN_ADMIN), 'target', 'ADMIN')).rejects.toThrow(
      /only a super administrator/i,
    )
    expect(revoke).not.toHaveBeenCalled()
  })

  it('refuses removing the second one’s ADMIN role', async () => {
    const { createUserRoleService } = await loadWithTwoSuperAdmins()
    const { service, revoke } = makeService(createUserRoleService, SUPER_2, [SUPER_1])

    await expect(service.revoke(ctxFor(PLAIN_ADMIN), 'target', 'ADMIN')).rejects.toThrow(
      /only a super administrator/i,
    )
    expect(revoke).not.toHaveBeenCalled()
  })
})

describe('super admins keep the authority they are meant to have', () => {
  it('lets the first end an ordinary administrator’s role', async () => {
    const { createUserRoleService } = await loadWithTwoSuperAdmins()
    const { service, revoke } = makeService(createUserRoleService, PLAIN_ADMIN)

    await expect(service.revoke(ctxFor(SUPER_1), 'target', 'ADMIN')).resolves.toBeDefined()
    expect(revoke).toHaveBeenCalled()
  })

  it('lets the second end an ordinary administrator’s role', async () => {
    const { createUserRoleService } = await loadWithTwoSuperAdmins()
    const { service, revoke } = makeService(createUserRoleService, PLAIN_ADMIN)

    await expect(service.revoke(ctxFor(SUPER_2), 'target', 'ADMIN')).resolves.toBeDefined()
    expect(revoke).toHaveBeenCalled()
  })

  it('lets one super admin demote the other while a second remains', async () => {
    const { createUserRoleService } = await loadWithTwoSuperAdmins()
    // super2 is being demoted by super1, and super1 still holds ADMIN, so the
    // platform is not left without an approver.
    const { service, revoke } = makeService(createUserRoleService, SUPER_2, [SUPER_1])

    await expect(service.revoke(ctxFor(SUPER_1), 'target', 'ADMIN')).resolves.toBeDefined()
    expect(revoke).toHaveBeenCalled()
  })

  it('still refuses to leave the platform with no super administrator', async () => {
    const { createUserRoleService } = await loadWithTwoSuperAdmins()
    // Nobody else configured holds ADMIN: the existing last-holder guard has
    // to survive the new rule rather than be replaced by it.
    const { service } = makeService(createUserRoleService, SUPER_2, [PLAIN_ADMIN])

    await expect(service.revoke(ctxFor(SUPER_1), 'target', 'ADMIN')).rejects.toThrow(
      /only super administrator/i,
    )
  })
})

describe('nothing in the request can widen the allowlist', () => {
  it('is decided by configuration, not by anything a caller sends', async () => {
    const { security } = await loadWithTwoSuperAdmins()
    // There is no setter and no API surface: the exported reader hands back a
    // copy, so a caller cannot append to it.
    const emails = security.getSuperAdminEmails()
    emails.push('attacker@example.test')
    expect(security.getSuperAdminEmails()).not.toContain('attacker@example.test')
    expect(security.isSuperAdmin('attacker@example.test')).toBe(false)
  })
})
