import { createHash, randomBytes } from 'node:crypto'

import { beforeAll, describe, expect, it } from 'vitest'

import { prisma } from '../client'
import { loginAttemptRepository } from './login-attempt.repository'
import { scopedRoleRepository } from './scoped-role.repository'
import { sessionRepository } from './session.repository'
import { userSecurityRepository } from './user-security.repository'

// Auth extension repositories (TRY-BNP-AUTH-02) against a real database.
describe.skipIf(!process.env.DATABASE_URL)('auth extension (integration)', () => {
  let organizationId = ''
  let userId = ''
  let otherUserId = ''
  let roleId = ''
  let ctx = { actorId: '', organizationId: '', requestId: 'auth-it' }

  function token() {
    const plain = randomBytes(32).toString('hex')
    return { plain, hash: createHash('sha256').update(plain).digest('hex') }
  }

  beforeAll(async () => {
    const org = await prisma.organization.upsert({
      where: { slug: 'auth-ext-itest' },
      update: {},
      create: { name: 'Auth Ext IT', slug: 'auth-ext-itest' },
    })
    organizationId = org.id

    const user = await prisma.user.upsert({
      where: { email: 'auth-ext@triyara.test' },
      update: {},
      create: { organizationId, email: 'auth-ext@triyara.test', name: 'IT', passwordHash: 'x' },
    })
    userId = user.id

    const other = await prisma.user.upsert({
      where: { email: 'auth-ext-2@triyara.test' },
      update: {},
      create: { organizationId, email: 'auth-ext-2@triyara.test', name: 'IT2', passwordHash: 'x' },
    })
    otherUserId = other.id

    const role = await prisma.role.upsert({
      where: { name: 'VERIFIER' },
      update: {},
      create: { name: 'VERIFIER' },
    })
    roleId = role.id

    ctx = { actorId: userId, organizationId, requestId: 'auth-it' }
  })

  it('creates the security profile on first touch and is idempotent', async () => {
    // A dedicated user, so the assertion holds on a database that previous runs
    // have already written to.
    const fresh = await prisma.user.create({
      data: {
        organizationId,
        email: `fresh-${Date.now()}@triyara.test`,
        name: 'Fresh',
        passwordHash: 'x',
      },
    })

    const first = await userSecurityRepository.ensure(fresh.id, organizationId)
    expect(first.emailVerifiedAt).toBeNull()
    expect(first.failedLoginCount).toBe(0)

    const second = await userSecurityRepository.ensure(fresh.id, organizationId)
    expect(second.id).toBe(first.id)
  })

  it('issues, supersedes and consumes an email verification token', async () => {
    const a = token()
    await userSecurityRepository.issueVerificationToken(ctx, {
      userId,
      email: 'auth-ext@triyara.test',
      tokenHash: a.hash,
      expiresAt: new Date(Date.now() + 60_000),
    })
    expect(await userSecurityRepository.findValidTokenByHash(a.hash)).not.toBeNull()

    // Re-requesting supersedes the outstanding token rather than accumulating.
    const b = token()
    await userSecurityRepository.issueVerificationToken(ctx, {
      userId,
      email: 'auth-ext@triyara.test',
      tokenHash: b.hash,
      expiresAt: new Date(Date.now() + 60_000),
    })
    expect(await userSecurityRepository.findValidTokenByHash(a.hash)).toBeNull()

    const record = await userSecurityRepository.findValidTokenByHash(b.hash)
    expect(record).not.toBeNull()

    const profile = await userSecurityRepository.consumeVerificationToken(ctx, record!.id, userId)
    expect(profile.emailVerifiedAt).not.toBeNull()

    // A consumed token cannot be replayed.
    expect(await userSecurityRepository.findValidTokenByHash(b.hash)).toBeNull()

    const audits = await prisma.auditLog.count({
      where: { organizationId, action: 'email_verification.confirmed' },
    })
    expect(audits).toBeGreaterThanOrEqual(1)
  })

  it('ignores an expired verification token', async () => {
    const t = token()
    await userSecurityRepository.issueVerificationToken(ctx, {
      userId: otherUserId,
      email: 'auth-ext-2@triyara.test',
      tokenHash: t.hash,
      expiresAt: new Date(Date.now() - 1000),
    })
    expect(await userSecurityRepository.findValidTokenByHash(t.hash)).toBeNull()
  })

  it('locks the account after the failure threshold and clears on success', async () => {
    const policy = { threshold: 3, lockForMs: 60_000 }
    await userSecurityRepository.clearFailedLogins(otherUserId, organizationId)

    let profile = await userSecurityRepository.recordFailedLogin(
      otherUserId,
      organizationId,
      policy,
    )
    expect(profile.lockedUntil).toBeNull()
    profile = await userSecurityRepository.recordFailedLogin(otherUserId, organizationId, policy)
    expect(profile.lockedUntil).toBeNull()
    profile = await userSecurityRepository.recordFailedLogin(otherUserId, organizationId, policy)
    expect(profile.lockedUntil).not.toBeNull()

    const cleared = await userSecurityRepository.clearFailedLogins(otherUserId, organizationId)
    expect(cleared.failedLoginCount).toBe(0)
    expect(cleared.lockedUntil).toBeNull()
  })

  it('records, lists and revokes sessions', async () => {
    const tokenId = `jti-${Date.now()}`
    const session = await sessionRepository.record({
      userId,
      organizationId,
      tokenId,
      expiresAt: new Date(Date.now() + 3_600_000),
      ipAddress: '127.0.0.1',
      userAgent: 'vitest',
    })
    expect(await sessionRepository.isActive(tokenId)).toBe(true)

    const listed = await sessionRepository.list({
      organizationId,
      userId,
      activeOnly: true,
      limit: 10,
    })
    expect(listed.items.some((s) => s.id === session.id)).toBe(true)

    const revoked = await sessionRepository.revoke(ctx, session.id, 'REVOKED_BY_ADMIN')
    expect(revoked.endedAt).not.toBeNull()
    expect(await sessionRepository.isActive(tokenId)).toBe(false)
  })

  it('revokes every live session for a user at once', async () => {
    const base = Date.now()
    for (const n of [1, 2, 3]) {
      await sessionRepository.record({
        userId: otherUserId,
        organizationId,
        tokenId: `bulk-${base}-${n}`,
        expiresAt: new Date(Date.now() + 3_600_000),
      })
    }

    const count = await sessionRepository.revokeAllForUser(ctx, otherUserId, 'PASSWORD_CHANGED')
    expect(count).toBeGreaterThanOrEqual(3)
    expect(await sessionRepository.isActive(`bulk-${base}-1`)).toBe(false)
  })

  it('allows one active grant per user/role/scope and permits re-granting after revoke', async () => {
    const scopeId = `acc-${Date.now()}`

    const granted = await scopedRoleRepository.grant(ctx, {
      userId: otherUserId,
      roleId,
      scopeType: 'ACCOUNT',
      scopeId,
    })
    expect(granted.role.name).toBe('VERIFIER')

    // Partial unique index blocks a duplicate live grant.
    await expect(
      scopedRoleRepository.grant(ctx, {
        userId: otherUserId,
        roleId,
        scopeType: 'ACCOUNT',
        scopeId,
      }),
    ).rejects.toThrow()

    const active = await scopedRoleRepository.findActiveForScope(
      organizationId,
      otherUserId,
      'ACCOUNT',
      scopeId,
    )
    expect(active).toHaveLength(1)

    const revoked = await scopedRoleRepository.revoke(ctx, granted.id, 'no longer needed')
    expect(revoked.revokedAt).not.toBeNull()

    // Once revoked, the same grant may legitimately be issued again.
    const regranted = await scopedRoleRepository.grant(ctx, {
      userId: otherUserId,
      roleId,
      scopeType: 'ACCOUNT',
      scopeId,
    })
    expect(regranted.id).not.toBe(granted.id)
    await scopedRoleRepository.revoke(ctx, regranted.id)
  })

  it('treats an expired grant as inactive', async () => {
    const scopeId = `acc-exp-${Date.now()}`
    await prisma.scopedRoleAssignment.create({
      data: {
        organizationId,
        userId: otherUserId,
        roleId,
        scopeType: 'ACCOUNT',
        scopeId,
        grantedById: userId,
        expiresAt: new Date(Date.now() - 1000),
      },
    })

    const active = await scopedRoleRepository.findActiveForScope(
      organizationId,
      otherUserId,
      'ACCOUNT',
      scopeId,
    )
    expect(active).toHaveLength(0)
  })

  it('records login attempts and counts recent failures', async () => {
    const email = `probe-${Date.now()}@triyara.test`
    await loginAttemptRepository.record({ email, outcome: 'INVALID_CREDENTIALS', organizationId })
    await loginAttemptRepository.record({ email, outcome: 'INVALID_CREDENTIALS', organizationId })
    await loginAttemptRepository.record({ email, outcome: 'SUCCESS', organizationId, userId })

    const failures = await loginAttemptRepository.countRecentFailures(
      email,
      new Date(Date.now() - 60_000),
    )
    expect(failures).toBe(2)

    const listed = await loginAttemptRepository.list({ organizationId, email, limit: 10 })
    expect(listed.items).toHaveLength(3)
  })

  it('never throws when recording an attempt fails', async () => {
    // 'email' is NOT NULL; an undefined value would blow up an unguarded insert.
    await expect(
      loginAttemptRepository.record({
        email: undefined as unknown as string,
        outcome: 'INVALID_CREDENTIALS',
      }),
    ).resolves.toBeUndefined()
  })
})
