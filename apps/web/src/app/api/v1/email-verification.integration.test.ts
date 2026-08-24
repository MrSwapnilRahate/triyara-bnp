// @vitest-environment node
import { randomUUID } from 'node:crypto'

import { buildAbilityFor, type Role } from '@triyara/auth'
import { prisma } from '@triyara/db'
import { createEmailService, type EmailMessage, type EmailTransport } from '@triyara/email'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The whole verification chain, end to end, with nothing about it faked.
 *
 * Route -> service -> repository -> real PostgreSQL for the token, and the real
 * email service and real template for the delivery. Only two things are
 * substituted: the auth context, because there is no browser session here, and
 * the transport, which captures the message instead of posting it to Resend.
 *
 * That substitution is the point rather than a shortcut - the token is pulled
 * back out of the rendered email body, exactly as a user reads it out of their
 * inbox, and fed to the confirm route. Nothing in the test knows the token; if
 * the template stopped putting it in the link, every case below would fail.
 */

const sent: EmailMessage[] = []
const capturing: EmailTransport = {
  name: 'capture',
  send(message) {
    sent.push(message)
    return Promise.resolve({ status: 'sent', id: `cap_${sent.length}`, attempts: 1 })
  },
}

const APP_URL = 'https://bnp.test'
const quiet = { info: () => undefined, warn: () => undefined, error: () => undefined }

// The real service, the real templates, the real URL building.
const emailService = createEmailService({
  transport: capturing,
  logger: quiet,
  appUrl: APP_URL,
  staffRecipients: [],
  superAdminRecipients: [],
})

vi.mock('@/lib/email', () => ({ emailService }))

const authState = {
  roles: ['READ_ONLY'] as Role[],
  organizationId: '',
  userId: '',
  email: '',
}

vi.mock('@/auth/context', () => ({
  requireAuth: vi.fn(async () => ({
    user: {
      id: authState.userId,
      organizationId: authState.organizationId,
      email: authState.email,
      name: 'Verification IT',
      roles: authState.roles,
    },
    organizationId: authState.organizationId,
    ability: buildAbilityFor(authState.roles),
  })),
}))

const { POST: requestVerification, GET: verificationStatus } =
  await import('./auth/email-verification/route')
const { POST: confirmVerification } = await import('./auth/email-verification/confirm/route')

const URL_BASE = 'http://t.test/api/v1/auth/email-verification'

const postRequest = (query = '') =>
  requestVerification(
    new Request(`${URL_BASE}${query}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    }),
  )

const postConfirm = (token: string) =>
  confirmVerification(
    new Request(`${URL_BASE}/confirm`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
    }),
  )

const body = async (res: Response) =>
  (await res.json()) as { success: boolean; data: Record<string, unknown> }

/**
 * Reads the token out of the delivered email the way a person does: find the
 * link, take its query parameter. Nothing else in this file knows the value.
 */
function tokenFromLastEmail(): string {
  const message = sent.at(-1)
  if (!message) throw new Error('no email was delivered')
  const match = /\/verify-email\?token=([A-Za-z0-9%._~-]+)/.exec(message.text ?? '')
  if (!match?.[1]) throw new Error(`no verification link in the email body`)
  return decodeURIComponent(match[1])
}

describe.skipIf(!process.env.DATABASE_URL)('email verification (integration)', () => {
  const SLUG = `email-verify-it-${randomUUID().slice(0, 8)}`
  let otherUserId = ''
  let otherOrgUserId = ''

  async function makeUser(organizationId: string, email: string) {
    const user = await prisma.user.create({
      data: { organizationId, email, name: 'IT', passwordHash: 'x' },
    })
    return user.id
  }

  beforeAll(async () => {
    const org = await prisma.organization.create({ data: { name: 'Verify IT', slug: SLUG } })
    authState.organizationId = org.id
    authState.email = `me-${randomUUID().slice(0, 8)}@triyara.test`
    authState.userId = await makeUser(org.id, authState.email)
    otherUserId = await makeUser(org.id, `other-${randomUUID().slice(0, 8)}@triyara.test`)

    const otherOrg = await prisma.organization.create({
      data: { name: 'Other Org', slug: `${SLUG}-other` },
    })
    otherOrgUserId = await makeUser(otherOrg.id, `far-${randomUUID().slice(0, 8)}@triyara.test`)
  })

  beforeEach(async () => {
    sent.length = 0
    authState.roles = ['READ_ONLY']
    // Each case starts unverified with no live token, so one case cannot leave
    // a usable token lying around for the next.
    await prisma.emailVerificationToken.deleteMany({ where: { userId: authState.userId } })
    await prisma.userSecurityProfile.updateMany({
      where: { userId: authState.userId },
      data: { emailVerifiedAt: null },
    })
  })

  it('carries a user from unverified to verified through the emailed link', async () => {
    const before = await verificationStatus(new Request(URL_BASE))
    expect((await body(before)).data.verified).toBe(false)

    const requested = await postRequest()
    expect(requested.status).toBe(202)

    // Delivered through the real email service and the real template.
    expect(sent).toHaveLength(1)
    expect(sent[0]?.to).toEqual([authState.email])
    expect(sent[0]?.text).toContain(`${APP_URL}/verify-email?token=`)

    // Only the hash is stored: the emailed token must not be in the database.
    const token = tokenFromLastEmail()
    const stored = await prisma.emailVerificationToken.findFirst({
      where: { userId: authState.userId },
    })
    expect(stored?.tokenHash).not.toBe(token)

    const confirmed = await postConfirm(token)
    expect(confirmed.status).toBe(200)
    expect((await body(confirmed)).data.verified).toBe(true)

    const after = await verificationStatus(new Request(URL_BASE))
    const state = (await body(after)).data
    expect(state.verified).toBe(true)
    expect(state.emailVerifiedAt).not.toBeNull()
  })

  it('resends through the same request, and the newest link is the one that works', async () => {
    await postRequest()
    const first = tokenFromLastEmail()

    await postRequest()
    const second = tokenFromLastEmail()

    expect(sent).toHaveLength(2)
    expect(second).not.toBe(first)

    // Issuing supersedes: the earlier link stops working the moment a new one
    // is sent, so a forwarded old email cannot be used later.
    expect((await postConfirm(first)).status).toBe(404)
    expect((await postConfirm(second)).status).toBe(200)
  })

  it('spends a token exactly once', async () => {
    await postRequest()
    const token = tokenFromLastEmail()

    expect((await postConfirm(token)).status).toBe(200)
    expect((await postConfirm(token)).status).toBe(404)
  })

  it('refuses an expired token', async () => {
    await postRequest()
    const token = tokenFromLastEmail()
    await prisma.emailVerificationToken.updateMany({
      where: { userId: authState.userId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    })

    expect((await postConfirm(token)).status).toBe(404)
    const after = await verificationStatus(new Request(URL_BASE))
    expect((await body(after)).data.verified).toBe(false)
  })

  it('refuses a token that was never issued', async () => {
    expect((await postConfirm('f'.repeat(64))).status).toBe(404)
  })

  it('refuses another user’s token', async () => {
    // Issued for somebody else in the same organization, then presented by this
    // signed-in READ_ONLY user. Possession alone must not be enough.
    authState.roles = ['ADMIN']
    await postRequest(`?userId=${otherUserId}`)
    const theirToken = tokenFromLastEmail()
    authState.roles = ['READ_ONLY']

    expect((await postConfirm(theirToken)).status).toBe(403)

    const theirProfile = await prisma.userSecurityProfile.findFirst({
      where: { userId: otherUserId },
    })
    expect(theirProfile?.emailVerifiedAt ?? null).toBeNull()
  })

  it('refuses to issue for a user in another organization', async () => {
    authState.roles = ['ADMIN']
    expect((await postRequest(`?userId=${otherOrgUserId}`)).status).toBe(404)
    expect(sent).toHaveLength(0)
  })

  it('refuses to issue for another user without update User', async () => {
    // READ_ONLY holds nothing over other people, and the refusal happens before
    // any token is written or any mail is sent.
    expect((await postRequest(`?userId=${otherUserId}`)).status).toBe(403)
    expect(sent).toHaveLength(0)
  })

  it('refuses a second request once the address is verified', async () => {
    await postRequest()
    await postConfirm(tokenFromLastEmail())
    sent.length = 0

    // 422: the request is well-formed, the state refuses it.
    expect((await postRequest()).status).toBe(422)
    expect(sent).toHaveLength(0)
  })

  it.each(['ADMIN', 'EXPORTER', 'VERIFIER', 'READ_ONLY'] as Role[])(
    'lets %s verify their own address',
    async (role) => {
      authState.roles = [role]
      expect((await postRequest()).status).toBe(202)
      expect((await postConfirm(tokenFromLastEmail())).status).toBe(200)
    },
  )
})
