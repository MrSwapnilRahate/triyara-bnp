import { buildAbilityFor, type Role } from '@triyara/auth'
import type { UserRepository } from '@triyara/db'
import type { DomainEvent, EventBus } from '@triyara/events'
import { describe, expect, it, vi } from 'vitest'

import { type AdminUsersServiceCtx, createAdminUsersService } from './admin-users.service'

function ctxFor(roles: Role[]): AdminUsersServiceCtx {
  const user = { id: 'u1', organizationId: 'org1', email: 'a@b.com', name: 'A', roles }
  return { user, organizationId: 'org1', ability: buildAbilityFor(roles), requestId: 'r1' }
}

const events = (sink: DomainEvent[] = []): EventBus =>
  ({
    emit: async (e: DomainEvent) => {
      sink.push(e)
    },
  }) as unknown as EventBus

// Typed parameters so the recorded call is inspectable: an untyped vi.fn()
// records an empty tuple and `calls[0][1]` will not compile.
type InviteArgs = {
  passwordHash: string
  tokenHash: string
  tokenExpiresAt: Date
  roleName: string
}

function deps(over: Partial<UserRepository> = {}, sink: DomainEvent[] = []) {
  const createWithInvite = vi.fn(async (_ctx: unknown, _data: InviteArgs) => ({
    id: 'new1',
    email: 'colleague@triyara.test',
    name: 'New Colleague',
  }))
  const users = { createWithInvite, ...over } as unknown as UserRepository
  return {
    users,
    createWithInvite,
    service: createAdminUsersService({
      users,
      events: events(sink),
      hashPassword: async (plain: string) => `hashed:${plain}`,
    }),
  }
}

const DTO = { name: 'New Colleague', email: 'colleague@triyara.test', role: 'VERIFIER' } as const

describe('admin users - invite authorization', () => {
  it('lets an ADMIN invite', async () => {
    const { service } = deps()
    await expect(service.invite(ctxFor(['ADMIN']), DTO)).resolves.toMatchObject({
      email: 'colleague@triyara.test',
    })
  })

  it.each([['EXPORT_MANAGER'], ['VERIFIER'], ['READ_ONLY']] as const)(
    'refuses a %s',
    async (role) => {
      // `manage User` is ADMIN alone. Anyone who can invite can grant ADMIN,
      // so this gate is the whole privilege boundary.
      const { service, createWithInvite } = deps()
      await expect(service.invite(ctxFor([role as Role]), DTO)).rejects.toThrow()
      expect(createWithInvite).not.toHaveBeenCalled()
    },
  )
})

describe('admin users - invite behaviour', () => {
  it('never persists a password the admin chose or saw', async () => {
    const { service, createWithInvite } = deps()
    await service.invite(ctxFor(['ADMIN']), DTO)

    const passed = createWithInvite.mock.calls[0]![1]
    // The secret is random and hashed; nothing in the request influenced it.
    expect(passed.passwordHash).toMatch(/^hashed:[0-9a-f]{96}$/)
  })

  it('stores only the hash of the invitation token', async () => {
    const { service, createWithInvite } = deps()
    const result = await service.invite(ctxFor(['ADMIN']), DTO)

    const passed = createWithInvite.mock.calls[0]![1]
    expect(passed.tokenHash).toMatch(/^[0-9a-f]{64}$/)
    // The plaintext is returned to the caller and never equals what is stored.
    expect(passed.tokenHash).not.toBe(result.token)
    expect(result.token).toMatch(/^[0-9a-f]{64}$/)
  })

  it('issues a token that expires', async () => {
    const { service, createWithInvite } = deps()
    const before = Date.now()
    const result = await service.invite(ctxFor(['ADMIN']), DTO)

    const passed = createWithInvite.mock.calls[0]![1]
    expect(passed.tokenExpiresAt.getTime()).toBeGreaterThan(before)
    expect(result.expiresAt).toEqual(passed.tokenExpiresAt)
  })

  it('passes the chosen role through', async () => {
    const { service, createWithInvite } = deps()
    await service.invite(ctxFor(['ADMIN']), { ...DTO, role: 'ADMIN' })
    expect(createWithInvite.mock.calls[0]![1]).toMatchObject({ roleName: 'ADMIN' })
  })

  it('emits user.invited without the token in the payload', async () => {
    // This payload reaches activity, notifications and the logs.
    const sink: DomainEvent[] = []
    const { service } = deps({}, sink)
    const result = await service.invite(ctxFor(['ADMIN']), DTO)

    const event = sink.find((e) => e.type === 'user.invited')
    expect(event).toBeDefined()
    expect(event?.data).toMatchObject({ userId: 'new1', role: 'VERIFIER' })
    expect(JSON.stringify(event?.data)).not.toContain(result.token)
  })

  it('does not emit when the repository refuses', async () => {
    const sink: DomainEvent[] = []
    const { service } = deps(
      {
        createWithInvite: vi.fn(async (_ctx: unknown, _data: InviteArgs) => {
          throw new Error('duplicate email')
        }),
      } as unknown as Partial<UserRepository>,
      sink,
    )
    await expect(service.invite(ctxFor(['ADMIN']), DTO)).rejects.toThrow()
    expect(sink).toHaveLength(0)
  })

  it('generates a different token every time', async () => {
    const { service } = deps()
    const a = await service.invite(ctxFor(['ADMIN']), DTO)
    const b = await service.invite(ctxFor(['ADMIN']), DTO)
    expect(a.token).not.toBe(b.token)
  })
})
