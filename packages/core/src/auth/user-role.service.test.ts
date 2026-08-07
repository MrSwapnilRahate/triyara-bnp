import { buildAbilityFor, type Role } from '@triyara/auth'
import type { UserRoleRepository } from '@triyara/db'
import type { DomainEvent, EventBus } from '@triyara/events'
import { describe, expect, it, vi } from 'vitest'

import { createUserRoleService, type UserRoleCtx } from './user-role.service'

const SUPER = 'swapnilrahate6598@gmail.com'

function ctxFor(roles: Role[], email = 'admin@triyara.test', id = 'u1'): UserRoleCtx {
  const user = { id, organizationId: 'org1', email, name: 'A', roles }
  return { user, organizationId: 'org1', ability: buildAbilityFor(roles), requestId: 'r1' }
}

const events = (sink: DomainEvent[] = []): EventBus =>
  ({
    emit: async (e: DomainEvent) => {
      sink.push(e)
    },
  }) as unknown as EventBus

const roles = { findByName: async (name: string) => ({ id: `role_${name}`, name }) }

function deps(
  over: {
    repo?: Partial<UserRoleRepository>
    targetEmail?: string
    sink?: DomainEvent[]
  } = {},
) {
  const assign = vi.fn(async () => [{ name: 'EXPORT_MANAGER' }])
  const revoke = vi.fn(async () => ({ roles: [], lastAdmin: false }))
  const repo = {
    listForUser: async () => [],
    listAdminEmails: async () => [],
    assign,
    revoke,
    ...over.repo,
  } as unknown as UserRoleRepository

  const users = {
    findById: async (id: string) => ({
      id,
      organizationId: 'org1',
      email: over.targetEmail ?? `${id}@triyara.test`,
    }),
  }

  return {
    assign,
    revoke,
    service: createUserRoleService({
      repo,
      roles: roles as never,
      users,
      events: events(over.sink ?? []),
    }),
  }
}

describe('direct ADMIN assignment is blocked', () => {
  it('refuses ADMIN even for an administrator', async () => {
    // `manage User` is what lets someone assign roles at all. Without this
    // refusal an administrator could appoint another - or themselves under a
    // second address - and the access-request workflow would be optional.
    const { service, assign } = deps()
    await expect(service.assign(ctxFor(['ADMIN']), 'u2', 'ADMIN')).rejects.toThrow(
      /cannot be assigned directly/i,
    )
    expect(assign).not.toHaveBeenCalled()
  })

  it('refuses ADMIN even for the super administrator', async () => {
    // The Super Admin approves requests; they do not bypass the workflow.
    const { service, assign } = deps()
    await expect(service.assign(ctxFor(['ADMIN'], SUPER), 'u2', 'ADMIN')).rejects.toThrow(
      /cannot be assigned directly/i,
    )
    expect(assign).not.toHaveBeenCalled()
  })

  it('refuses before looking the user up, so nothing leaks', async () => {
    const { service } = deps()
    await expect(service.assign(ctxFor(['ADMIN']), 'nonexistent', 'ADMIN')).rejects.toThrow(
      /cannot be assigned directly/i,
    )
  })

  it.each([['EXPORT_MANAGER'], ['VERIFIER'], ['READ_ONLY']])(
    'still assigns %s normally',
    async (role) => {
      const { service, assign } = deps()
      await service.assign(ctxFor(['ADMIN']), 'u2', role as 'VERIFIER')
      expect(assign).toHaveBeenCalled()
    },
  )

  it('emits nothing when ADMIN is refused', async () => {
    const sink: DomainEvent[] = []
    const { service } = deps({ sink })
    await expect(service.assign(ctxFor(['ADMIN']), 'u2', 'ADMIN')).rejects.toThrow()
    expect(sink).toHaveLength(0)
  })
})

describe('super admin protection', () => {
  it('refuses to remove ADMIN from the only super administrator', async () => {
    // Strip it and nobody can ever approve an access request again - the
    // workflow would have an approver who cannot reach it.
    const { service, revoke } = deps({
      targetEmail: SUPER,
      repo: { listAdminEmails: async () => ['other-admin@triyara.test'] } as never,
    })
    await expect(service.revoke(ctxFor(['ADMIN']), 'u2', 'ADMIN')).rejects.toThrow(
      /only super administrator/i,
    )
    expect(revoke).not.toHaveBeenCalled()
  })

  it('permits removal once another super administrator holds ADMIN', async () => {
    // Stage-2 behaviour, reached by configuration rather than a code change.
    const { service, revoke } = deps({
      targetEmail: SUPER,
      repo: { listAdminEmails: async () => [SUPER] } as never,
    })
    await service.revoke(ctxFor(['ADMIN']), 'u2', 'ADMIN')
    expect(revoke).toHaveBeenCalled()
  })

  it('leaves an ordinary administrator removable', async () => {
    const { service, revoke } = deps({ targetEmail: 'ordinary@triyara.test' })
    await service.revoke(ctxFor(['ADMIN']), 'u2', 'ADMIN')
    expect(revoke).toHaveBeenCalled()
  })

  it('does not interfere with revoking a non-admin role from the super admin', async () => {
    const { service, revoke } = deps({ targetEmail: SUPER })
    await service.revoke(ctxFor(['ADMIN']), 'u2', 'VERIFIER')
    expect(revoke).toHaveBeenCalled()
  })
})
