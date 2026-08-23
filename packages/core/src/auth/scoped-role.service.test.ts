import { buildAbilityFor, type Role } from '@triyara/auth'
import type { ScopedRoleRepository } from '@triyara/db'
import type { DomainEvent, EventBus } from '@triyara/events'
import type { GrantScopedRoleDto } from '@triyara/validation'
import { describe, expect, it } from 'vitest'

import { createScopedRoleService, type ScopedRoleCtx } from './scoped-role.service'

/**
 * The third way to attach ADMIN to a person.
 *
 * Invite and assign both refuse it; this path did not, and the validation
 * schema accepts 'ADMIN' as a role name, so nothing upstream stopped it either.
 */

const SUPER = 'swapnilrahate6598@gmail.com'

function ctxFor(roles: Role[], email = 'admin@triyara.test'): ScopedRoleCtx {
  const user = { id: 'u1', organizationId: 'org1', email, name: 'A', roles }
  return { user, organizationId: 'org1', ability: buildAbilityFor(roles), requestId: 'r1' }
}

const events = (sink: DomainEvent[] = []): EventBus =>
  ({
    emit: async (e: DomainEvent) => {
      sink.push(e)
    },
  }) as unknown as EventBus

function service() {
  const repo = {
    grant: async () => ({ id: 'sra1' }),
    findActiveForScope: async () => [],
  } as unknown as ScopedRoleRepository

  return createScopedRoleService({
    repo,
    roles: { findByName: async (name: string) => ({ id: `role_${name}`, name }) } as never,
    users: {
      findById: async (id: string) => ({ id, organizationId: 'org1', email: `${id}@triyara.test` }),
    },
    events: events(),
  })
}

// Narrowed to the roles a scoped assignment may actually carry. EXTERNAL_PARTY
// is in `Role` but absent from ASSIGNABLE_ROLES, so the compiler refuses it
// here - which is the intended contract, not an obstacle to work around.
const grant = (role: GrantScopedRoleDto['role']) => ({
  userId: 'u2',
  role,
  scopeType: 'ACCOUNT' as const,
  scopeId: 'acc1',
})

describe('ADMIN cannot be granted through a scoped assignment', () => {
  it('refuses an administrator granting scoped ADMIN', async () => {
    await expect(service().grant(ctxFor(['ADMIN']), grant('ADMIN'))).rejects.toThrow(
      /cannot be assigned directly/i,
    )
  })

  it('refuses even a super administrator, because the request flow is the only route', async () => {
    // Not an oversight: ADMIN is granted by approving an access request, so a
    // scoped grant would produce a role with no decision behind it.
    await expect(service().grant(ctxFor(['ADMIN'], SUPER), grant('ADMIN'))).rejects.toThrow(
      /cannot be assigned directly/i,
    )
  })

  it('still grants every other role', async () => {
    for (const role of ['EXPORT_MANAGER', 'VERIFIER', 'READ_ONLY'] as const) {
      await expect(service().grant(ctxFor(['ADMIN']), grant(role))).resolves.toBeDefined()
    }
  })

  it('refuses a non-administrator outright, as before', async () => {
    await expect(
      service().grant(ctxFor(['EXPORT_MANAGER']), grant('EXPORT_MANAGER')),
    ).rejects.toThrow()
  })
})

describe('a scoped grant never becomes session authority', () => {
  it('builds the session ability from base roles alone', () => {
    // The assumption the block above rests on: a scoped grant is recorded, not
    // conferred. If this ever stops holding, a scoped role would silently widen
    // what a session may do, and the refusal above becomes load-bearing rather
    // than precautionary.
    const base = buildAbilityFor(['READ_ONLY'])
    expect(base.can('manage', 'all')).toBe(false)
    expect(base.can('read', 'all')).toBe(true)

    // buildAbilityFor takes a role list and nothing else - there is no seam
    // through which a ScopedRoleAssignment could reach it.
    expect(buildAbilityFor(['ADMIN']).can('manage', 'all')).toBe(true)
    expect(buildAbilityFor([]).can('read', 'all')).toBe(false)
  })
})
