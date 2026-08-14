import { buildAbilityFor, type Role } from '@triyara/auth'
import type { SessionRepository } from '@triyara/db'
import type { DomainEvent, EventBus } from '@triyara/events'
import { describe, expect, it, vi } from 'vitest'

import { createSessionService, type SessionServiceCtx } from './session.service'

/**
 * Who may end whose session.
 *
 * `manage all` lets an administrator end anybody's, which is right for staff
 * and wrong for the account above them: signing the Super Admin out repeatedly
 * is the nearest an administrator can get to removing the authority that
 * approves their own role.
 */

const SUPER = 'swapnilrahate6598@gmail.com'
const ADMIN_EMAIL = 'admin@triyara.test'

function ctxFor(roles: Role[], email: string, id = 'actor'): SessionServiceCtx {
  const user = { id, organizationId: 'org1', email, name: 'A', roles }
  return { user, organizationId: 'org1', ability: buildAbilityFor(roles), requestId: 'r1' }
}

const events = (): EventBus =>
  ({ emit: async (_e: DomainEvent) => undefined }) as unknown as EventBus

/** `targetEmail` is whoever owns the session being ended. */
function service(targetEmail: string, targetId = 'victim') {
  const revoke = vi.fn(async () => ({ id: 's1', userId: targetId }))
  const revokeAllForUser = vi.fn(async () => 3)
  const repo = {
    findById: async () => ({ id: 's1', userId: targetId, organizationId: 'org1' }),
    revoke,
    revokeAllForUser,
  } as unknown as SessionRepository

  const users = {
    findById: async (id: string) => ({ id, organizationId: 'org1', email: targetEmail }),
  }

  return { revoke, revokeAllForUser, svc: createSessionService({ repo, users, events: events() }) }
}

describe('an administrator cannot end a super administrator’s session', () => {
  it('refuses revoking one session', async () => {
    const { svc, revoke } = service(SUPER)
    await expect(svc.revoke(ctxFor(['ADMIN'], ADMIN_EMAIL), 's1')).rejects.toThrow(
      /super administrator/i,
    )
    expect(revoke).not.toHaveBeenCalled()
  })

  it('refuses revoking all of their sessions', async () => {
    const { svc, revokeAllForUser } = service(SUPER)
    await expect(
      svc.revokeAllForUser(ctxFor(['ADMIN'], ADMIN_EMAIL), 'victim', 'REVOKED_BY_ADMIN'),
    ).rejects.toThrow(/super administrator/i)
    expect(revokeAllForUser).not.toHaveBeenCalled()
  })
})

describe('the super administrator keeps the authority above them', () => {
  it('may end an ordinary administrator’s session', async () => {
    const { svc, revoke } = service(ADMIN_EMAIL)
    await expect(svc.revoke(ctxFor(['ADMIN'], SUPER), 's1')).resolves.toBeDefined()
    expect(revoke).toHaveBeenCalled()
  })

  it('may end all of an ordinary administrator’s sessions', async () => {
    const { svc, revokeAllForUser } = service(ADMIN_EMAIL)
    await expect(
      svc.revokeAllForUser(ctxFor(['ADMIN'], SUPER), 'victim', 'REVOKED_BY_ADMIN'),
    ).resolves.toEqual({ revoked: 3 })
    expect(revokeAllForUser).toHaveBeenCalled()
  })
})

describe('nothing about ending your own session changes', () => {
  it('lets an administrator end their own', async () => {
    const { svc } = service(ADMIN_EMAIL, 'actor')
    await expect(svc.revoke(ctxFor(['ADMIN'], ADMIN_EMAIL, 'actor'), 's1')).resolves.toBeDefined()
  })

  it('lets the super administrator end their own', async () => {
    // The guard must not lock the Super Admin out of their own sessions.
    const { svc } = service(SUPER, 'actor')
    await expect(svc.revoke(ctxFor(['ADMIN'], SUPER, 'actor'), 's1')).resolves.toBeDefined()
  })

  it('lets an ordinary user end their own', async () => {
    const { svc } = service('reader@triyara.test', 'actor')
    await expect(
      svc.revoke(ctxFor(['READ_ONLY'], 'reader@triyara.test', 'actor'), 's1'),
    ).resolves.toBeDefined()
  })
})
