// @vitest-environment node
import { randomUUID } from 'node:crypto'

import { buildAbilityFor, type Role } from '@triyara/auth'
import { prisma } from '@triyara/db'
import { beforeAll, describe, expect, it, vi } from 'vitest'

// Full stack: route -> service -> repository -> real PostgreSQL. Only the auth
// context and email are mocked, so the partial unique index, the atomic role
// grant, optimistic locking and the audit rows are exercised for real.

const SUPER = 'swapnilrahate6598@gmail.com'
const SLUG = `admin-access-it-${randomUUID().slice(0, 8)}`
const uniq = () => randomUUID().slice(0, 8)

const authState = {
  roles: ['EXPORT_MANAGER'] as Role[],
  organizationId: '',
  userId: '',
  email: 'staff@triyara.test',
}

vi.mock('@/auth/context', () => ({
  requireAuth: vi.fn(async () => ({
    user: {
      id: authState.userId,
      organizationId: authState.organizationId,
      email: authState.email,
      name: 'IT Person',
      roles: authState.roles,
    },
    organizationId: authState.organizationId,
    ability: buildAbilityFor(authState.roles),
  })),
}))

vi.mock('@/lib/email', () => ({
  emailService: {
    adminAccessRequested: vi.fn(async () => ({ status: 'sent', id: 'e', attempts: 1 })),
    adminAccessApproved: vi.fn(async () => ({ status: 'sent', id: 'e', attempts: 1 })),
    adminAccessRejected: vi.fn(async () => ({ status: 'sent', id: 'e', attempts: 1 })),
  },
}))

const { GET: listRequests, POST: createRequest } = await import('./admin-access-requests/route')
const { POST: approveRequest } = await import('./admin-access-requests/[id]/approve/route')
const { POST: rejectRequest } = await import('./admin-access-requests/[id]/reject/route')

const req = (url: string, init?: RequestInit) => new Request(`http://t.test${url}`, init)
const params = (id: string) => ({ params: Promise.resolve({ id }) })
const body = async (res: Response) =>
  (await res.json()) as { success: boolean; data: never; meta: Record<string, unknown> }

const REASON = 'I action the supplier review queue every day and need approval rights.'

describe.skipIf(!process.env.DATABASE_URL)('admin access requests (integration)', () => {
  let adminRoleId = ''
  let requesterId = ''
  let superId = ''

  async function makeUser(email: string, role?: string) {
    const user = await prisma.user.create({
      data: {
        organizationId: authState.organizationId,
        email,
        name: `User ${uniq()}`,
        passwordHash: 'x',
      },
    })
    if (role) {
      const r = await prisma.role.findFirstOrThrow({ where: { name: role as 'ADMIN' } })
      await prisma.userRole.create({ data: { userId: user.id, roleId: r.id } })
    }
    return user
  }

  async function submitAs(userId: string, email: string, roles: Role[] = ['EXPORT_MANAGER']) {
    authState.userId = userId
    authState.email = email
    authState.roles = roles
    return createRequest(
      req('/api/v1/admin-access-requests', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: REASON }),
      }),
    )
  }

  function asSuper() {
    authState.userId = superId
    authState.email = SUPER
    authState.roles = ['ADMIN']
  }

  beforeAll(async () => {
    const org = await prisma.organization.upsert({
      where: { slug: SLUG },
      update: {},
      create: { name: 'Admin Access IT', slug: SLUG },
    })
    authState.organizationId = org.id

    for (const name of ['ADMIN', 'EXPORT_MANAGER', 'VERIFIER', 'READ_ONLY'] as const) {
      await prisma.role.upsert({ where: { name }, update: {}, create: { name } })
    }
    adminRoleId = (await prisma.role.findFirstOrThrow({ where: { name: 'ADMIN' } })).id

    requesterId = (await makeUser(`requester-${uniq()}@triyara.test`, 'EXPORT_MANAGER')).id
    superId = (await makeUser(SUPER.replace('@', `+${uniq()}@`), 'ADMIN')).id
  })

  it('records a request and writes an audit row', async () => {
    const user = await makeUser(`r-${uniq()}@triyara.test`, 'VERIFIER')
    const res = await submitAs(user.id, user.email, ['VERIFIER'])
    expect(res.status).toBe(201)

    const created = (await body(res)).data as unknown as { id: string }
    const row = await prisma.adminAccessRequest.findUniqueOrThrow({ where: { id: created.id } })
    expect(row.status).toBe('PENDING')
    expect(row.currentRole).toBe('VERIFIER')
    expect(row.requesterEmail).toBe(user.email)

    const audit = await prisma.auditLog.findFirst({
      where: {
        entityType: 'AdminAccessRequest',
        entityId: created.id,
        action: 'admin_access_request.submitted',
      },
    })
    expect(audit).not.toBeNull()
  })

  it('refuses a second pending request from the same person', async () => {
    // The partial unique index is the arbiter, not a read-then-write.
    const user = await makeUser(`dup-${uniq()}@triyara.test`, 'VERIFIER')
    expect((await submitAs(user.id, user.email, ['VERIFIER'])).status).toBe(201)
    expect((await submitAs(user.id, user.email, ['VERIFIER'])).status).toBe(409)

    const rows = await prisma.adminAccessRequest.findMany({ where: { userId: user.id } })
    expect(rows).toHaveLength(1)
  })

  it('refuses a requester who already holds ADMIN', async () => {
    const user = await makeUser(`already-${uniq()}@triyara.test`, 'ADMIN')
    const res = await submitAs(user.id, user.email, ['ADMIN'])
    expect(res.status).toBe(409)
    expect(await prisma.adminAccessRequest.findFirst({ where: { userId: user.id } })).toBeNull()
  })

  it('grants ADMIN and marks the request approved in one transaction', async () => {
    const user = await makeUser(`ok-${uniq()}@triyara.test`, 'VERIFIER')
    const created = (await body(await submitAs(user.id, user.email, ['VERIFIER'])))
      .data as unknown as { id: string; version: number }

    asSuper()
    const res = await approveRequest(
      req(`/api/v1/admin-access-requests/${created.id}/approve`, {
        method: 'POST',
        headers: { 'if-match': `W/"v${created.version}"` },
      }),
      params(created.id),
    )
    expect(res.status).toBe(200)

    const row = await prisma.adminAccessRequest.findUniqueOrThrow({ where: { id: created.id } })
    expect(row.status).toBe('APPROVED')
    expect(row.decidedById).toBe(superId)
    expect(row.decidedAt).not.toBeNull()

    // The role grant is the point of the whole workflow.
    const held = await prisma.userRole.findFirst({
      where: { userId: user.id, roleId: adminRoleId },
    })
    expect(held).not.toBeNull()

    const audit = await prisma.auditLog.findFirst({
      where: { entityId: created.id, action: 'admin_access_request.approved' },
    })
    expect(audit).not.toBeNull()
  })

  it('refuses a stale version with 412 and grants nothing', async () => {
    const user = await makeUser(`stale-${uniq()}@triyara.test`, 'VERIFIER')
    const created = (await body(await submitAs(user.id, user.email, ['VERIFIER'])))
      .data as unknown as { id: string; version: number }

    asSuper()
    const res = await approveRequest(
      req(`/api/v1/admin-access-requests/${created.id}/approve`, {
        method: 'POST',
        headers: { 'if-match': `W/"v${created.version + 5}"` },
      }),
      params(created.id),
    )
    expect(res.status).toBe(412)

    const row = await prisma.adminAccessRequest.findUniqueOrThrow({ where: { id: created.id } })
    expect(row.status).toBe('PENDING')
    expect(
      await prisma.userRole.findFirst({ where: { userId: user.id, roleId: adminRoleId } }),
    ).toBeNull()
  })

  it('refuses a second decision on the same request', async () => {
    const user = await makeUser(`twice-${uniq()}@triyara.test`, 'VERIFIER')
    const created = (await body(await submitAs(user.id, user.email, ['VERIFIER'])))
      .data as unknown as { id: string; version: number }

    asSuper()
    const first = await approveRequest(
      req(`/api/v1/admin-access-requests/${created.id}/approve`, {
        method: 'POST',
        headers: { 'if-match': `W/"v${created.version}"` },
      }),
      params(created.id),
    )
    expect(first.status).toBe(200)
    const after = (await body(first)).data as unknown as { version: number }

    const second = await rejectRequest(
      req(`/api/v1/admin-access-requests/${created.id}/reject`, {
        method: 'POST',
        headers: { 'if-match': `W/"v${after.version}"`, 'content-type': 'application/json' },
        body: JSON.stringify({ reason: 'Changed my mind about this.' }),
      }),
      params(created.id),
    )
    expect(second.status).toBe(409)
  })

  it('refuses an ordinary ADMIN and changes nothing', async () => {
    const user = await makeUser(`nope-${uniq()}@triyara.test`, 'VERIFIER')
    const created = (await body(await submitAs(user.id, user.email, ['VERIFIER'])))
      .data as unknown as { id: string; version: number }

    const other = await makeUser(`otheradmin-${uniq()}@triyara.test`, 'ADMIN')
    authState.userId = other.id
    authState.email = other.email
    authState.roles = ['ADMIN']

    const res = await approveRequest(
      req(`/api/v1/admin-access-requests/${created.id}/approve`, {
        method: 'POST',
        headers: { 'if-match': `W/"v${created.version}"` },
      }),
      params(created.id),
    )
    expect(res.status).toBe(403)

    const row = await prisma.adminAccessRequest.findUniqueOrThrow({ where: { id: created.id } })
    expect(row.status).toBe('PENDING')
    expect(
      await prisma.userRole.findFirst({ where: { userId: user.id, roleId: adminRoleId } }),
    ).toBeNull()
  })

  it('stores the rejection reason and grants nothing', async () => {
    const user = await makeUser(`rej-${uniq()}@triyara.test`, 'VERIFIER')
    const created = (await body(await submitAs(user.id, user.email, ['VERIFIER'])))
      .data as unknown as { id: string; version: number }

    asSuper()
    const res = await rejectRequest(
      req(`/api/v1/admin-access-requests/${created.id}/reject`, {
        method: 'POST',
        headers: { 'if-match': `W/"v${created.version}"`, 'content-type': 'application/json' },
        body: JSON.stringify({ reason: 'This role does not need approval rights.' }),
      }),
      params(created.id),
    )
    expect(res.status).toBe(200)

    const row = await prisma.adminAccessRequest.findUniqueOrThrow({ where: { id: created.id } })
    expect(row.status).toBe('REJECTED')
    expect(row.decisionReason).toBe('This role does not need approval rights.')
    expect(
      await prisma.userRole.findFirst({ where: { userId: user.id, roleId: adminRoleId } }),
    ).toBeNull()
  })

  it('lets the same person ask again after a rejection', async () => {
    // The partial index only covers PENDING, so a decided request does not
    // block a fresh one.
    const user = await makeUser(`again-${uniq()}@triyara.test`, 'VERIFIER')
    const created = (await body(await submitAs(user.id, user.email, ['VERIFIER'])))
      .data as unknown as { id: string; version: number }

    asSuper()
    await rejectRequest(
      req(`/api/v1/admin-access-requests/${created.id}/reject`, {
        method: 'POST',
        headers: { 'if-match': `W/"v${created.version}"`, 'content-type': 'application/json' },
        body: JSON.stringify({ reason: 'Not right now, ask again next quarter.' }),
      }),
      params(created.id),
    )

    expect((await submitAs(user.id, user.email, ['VERIFIER'])).status).toBe(201)
    expect(await prisma.adminAccessRequest.count({ where: { userId: user.id } })).toBe(2)
  })

  it('shows the queue only to the super administrator', async () => {
    asSuper()
    expect((await listRequests(req('/api/v1/admin-access-requests?status=PENDING'))).status).toBe(
      200,
    )

    const other = await makeUser(`viewer-${uniq()}@triyara.test`, 'ADMIN')
    authState.userId = other.id
    authState.email = other.email
    authState.roles = ['ADMIN']
    expect((await listRequests(req('/api/v1/admin-access-requests'))).status).toBe(403)
  })
})
