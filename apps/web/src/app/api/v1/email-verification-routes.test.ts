import { buildAbilityFor, type Role } from '@triyara/auth'
import type * as TriyaraLib from '@triyara/lib'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Email verification delivery.
 *
 * The token is the whole credential: possession of it verifies an address. It
 * is hashed at rest, so the only places it can leak are the response body and
 * the logs - and until delivery existed, the route logged the full link,
 * meaning anyone with log access could confirm any address. These pin both
 * exits closed and prove the email is actually the one path it takes.
 */

const authState = { roles: ['READ_ONLY'] as Role[], organizationId: 'org1', userId: 'me' }

vi.mock('@/auth/context', () => ({
  requireAuth: vi.fn(async () => ({
    user: {
      id: authState.userId,
      organizationId: authState.organizationId,
      email: 'me@triyara.test',
      name: 'Me',
      roles: authState.roles,
    },
    organizationId: authState.organizationId,
    ability: buildAbilityFor(authState.roles),
  })),
}))

const emailVerificationService = { request: vi.fn(), confirm: vi.fn(), status: vi.fn() }
vi.mock('@/lib/auth-extension-service', () => ({ emailVerificationService }))

/** Typed with the input it actually receives, so the assertions can read it. */
type VerificationEmail = { email: string; token: string; expiresInMinutes: number }
const emailService = {
  emailVerification: vi.fn(async (_input: VerificationEmail) => ({ status: 'sent' as const })),
}
vi.mock('@/lib/email', () => ({ emailService }))

const logged: unknown[] = []
vi.mock('@triyara/lib', async (importOriginal) => {
  const actual = await importOriginal<typeof TriyaraLib>()
  return {
    ...actual,
    logger: {
      info: (...a: unknown[]) => logged.push(a),
      warn: (...a: unknown[]) => logged.push(a),
      error: (...a: unknown[]) => logged.push(a),
      debug: (...a: unknown[]) => logged.push(a),
    },
  }
})

const { POST: requestVerification, GET: getStatus } =
  await import('./auth/email-verification/route')

const req = (body: unknown = {}) =>
  new Request('http://t.test/api/v1/auth/email-verification', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

const TOKEN = 'a'.repeat(64)

beforeEach(() => {
  logged.length = 0
  vi.clearAllMocks()
  authState.roles = ['READ_ONLY']
  emailVerificationService.request.mockResolvedValue({
    email: 'me@triyara.test',
    token: TOKEN,
    expiresAt: new Date(Date.now() + 30 * 60_000),
  })
})

describe('requesting verification sends the email', () => {
  it('hands the token to the mail service, and only there', async () => {
    const res = await requestVerification(req({}))

    expect(res.status).toBe(202)
    expect(emailService.emailVerification).toHaveBeenCalledTimes(1)
    expect(emailService.emailVerification.mock.calls[0]?.[0].token).toBe(TOKEN)
  })

  it('never puts the token in the response body', async () => {
    const res = await requestVerification(req({}))
    const body = JSON.stringify(await res.json())

    expect(body).not.toContain(TOKEN)
    // The address and expiry are safe to return; the credential is not.
    expect(body).toContain('me@triyara.test')
  })

  it('never writes the token to the log', async () => {
    // The regression this exists for: the route used to log
    // `/verify-email?token=...` in full.
    await requestVerification(req({}))

    expect(JSON.stringify(logged)).not.toContain(TOKEN)
  })

  it('passes the remaining lifetime to the template, not a hard-coded figure', async () => {
    emailVerificationService.request.mockResolvedValue({
      email: 'me@triyara.test',
      token: TOKEN,
      expiresAt: new Date(Date.now() + 45 * 60_000),
    })
    await requestVerification(req({}))

    expect(emailService.emailVerification.mock.calls[0]?.[0].expiresInMinutes).toBe(45)
  })

  it('still succeeds when delivery fails, and logs no token', async () => {
    // The token is already issued and valid; a bounced send must not fail the
    // request or the user could never retry.
    emailService.emailVerification.mockRejectedValueOnce(new Error('smtp down'))
    const res = await requestVerification(req({}))

    expect(res.status).toBe(202)
    expect(JSON.stringify(logged)).not.toContain(TOKEN)
    expect(JSON.stringify(logged)).toContain('email_verification.email_failed')
  })
})

describe('verification is the account holder’s own act', () => {
  it('lets any signed-in role verify their own address', async () => {
    // READ_ONLY by default in this file - deliberately the least privileged.
    // Confirming your own email must not need an administrative permission.
    const res = await requestVerification(req({}))
    expect(res.status).toBe(202)
    expect(emailVerificationService.request).toHaveBeenCalled()
  })

  it('reads its own status without administrative permission', async () => {
    emailVerificationService.status.mockResolvedValue({
      userId: 'me',
      emailVerifiedAt: null,
    })
    const res = await getStatus(new Request('http://t.test/api/v1/auth/email-verification'))

    expect(res.status).toBe(200)
    expect(emailVerificationService.status).toHaveBeenCalledWith(expect.anything(), undefined)
  })

  it('forwards a targeted userId so the service can refuse it', async () => {
    // The route does not decide this. `userId` reaches the service, which
    // demands `update User` for anyone but yourself - the boundary lives in one
    // place rather than being re-implemented here.
    await requestVerification(
      new Request('http://t.test/api/v1/auth/email-verification?userId=someone-else', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      }),
    )

    expect(emailVerificationService.request).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      {
        userId: 'someone-else',
      },
    )
  })
})
