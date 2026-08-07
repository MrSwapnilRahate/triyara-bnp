// @vitest-environment node
import { randomUUID } from 'node:crypto'

import { buildAbilityFor, type Role } from '@triyara/auth'
import { prisma } from '@triyara/db'
import { beforeAll, describe, expect, it, vi } from 'vitest'

// Full stack: route handler -> service -> repository -> real PostgreSQL. Only
// the auth context is mocked, so authorization, organization isolation, keyset
// pagination and the filters are exercised against the real database.

const authState = { roles: ['ADMIN'] as Role[], organizationId: '', userId: '' }

vi.mock('@/auth/context', () => ({
  requireAuth: vi.fn(async () => ({
    user: {
      id: authState.userId,
      organizationId: authState.organizationId,
      email: 'admin-users-it@triyara.test',
      name: 'Admin Users IT',
      roles: authState.roles,
    },
    organizationId: authState.organizationId,
    ability: buildAbilityFor(authState.roles),
  })),
}))

const { GET: listUsers, POST: inviteUser } = await import('./admin/users/route')

const req = (url: string, init?: RequestInit) => new Request(`http://t.test${url}`, init)
const body = async (res: Response) =>
  (await res.json()) as {
    success: boolean
    data: never
    meta: {
      requestId: string
      pagination?: { limit: number; nextCursor: string | null }
      [k: string]: unknown
    }
    errors: Array<{ code: string; message: string }> | null
  }

type Row = {
  id: string
  name: string
  email: string
  status: string
  roles: string[]
  lastLoginAt: string | null
  createdAt: string
}

const rows = async (res: Response) => (await body(res)).data as unknown as Row[]

// Fixtures are namespaced to this file. Vitest runs test files in parallel and
// `upsert` is a select-then-insert, so two files seeding the same slug race on
// an empty database.
const uniq = () => randomUUID().replace(/-/g, '').slice(0, 10)
const SLUG = 'admin-users-itest'

describe.skipIf(!process.env.DATABASE_URL)('admin users API (integration, real PostgreSQL)', () => {
  let otherOrgId = ''
  const roleIds: Partial<Record<'ADMIN' | 'EXPORT_MANAGER' | 'VERIFIER' | 'READ_ONLY', string>> = {}

  async function makeUser(
    over: {
      name?: string
      status?: 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED'
      role?: 'ADMIN' | 'EXPORT_MANAGER' | 'VERIFIER' | 'READ_ONLY'
      organizationId?: string
      lastLoginAt?: Date
    } = {},
  ) {
    const id = uniq()
    const user = await prisma.user.create({
      data: {
        organizationId: over.organizationId ?? authState.organizationId,
        email: `au-${id}@triyara.test`,
        name: over.name ?? `User ${id}`,
        passwordHash: 'x',
        ...(over.status ? { status: over.status } : {}),
        ...(over.lastLoginAt ? { lastLoginAt: over.lastLoginAt } : {}),
      },
    })
    if (over.role) {
      // The role rows are created once, sequentially, in beforeAll. Upserting
      // them here instead would put concurrent select-then-insert calls on a
      // globally unique name whenever this file creates users in parallel.
      await prisma.userRole.create({ data: { userId: user.id, roleId: roleIds[over.role]! } })
    }
    return user
  }

  beforeAll(async () => {
    const org = await prisma.organization.upsert({
      where: { slug: SLUG },
      update: {},
      create: { name: 'Admin Users IT', slug: SLUG },
    })
    authState.organizationId = org.id

    const me = await prisma.user.upsert({
      where: { email: 'admin-users-it@triyara.test' },
      update: {},
      create: {
        organizationId: org.id,
        email: 'admin-users-it@triyara.test',
        name: 'Admin Users IT',
        passwordHash: 'x',
      },
    })
    authState.userId = me.id

    const other = await prisma.organization.upsert({
      where: { slug: `${SLUG}-other` },
      update: {},
      create: { name: 'Other Tenant', slug: `${SLUG}-other` },
    })
    otherOrgId = other.id

    // Sequential, not Promise.all: `Role.name` is globally unique, so
    // concurrent upserts of the same name race on an empty database.
    for (const name of ['ADMIN', 'EXPORT_MANAGER', 'VERIFIER', 'READ_ONLY'] as const) {
      const role = await prisma.role.upsert({ where: { name }, update: {}, create: { name } })
      roleIds[name] = role.id
    }
  })

  describe('authorization', () => {
    it('serves an ADMIN', async () => {
      authState.roles = ['ADMIN']
      const res = await listUsers(req('/api/v1/admin/users'))
      expect(res.status).toBe(200)
    })

    it.each([['EXPORT_MANAGER'], ['VERIFIER'], ['READ_ONLY']])(
      'refuses %s with 403, rather than serving a filtered list',
      async (role) => {
        authState.roles = [role as Role]
        const res = await listUsers(req('/api/v1/admin/users'))

        expect(res.status).toBe(403)
        expect((await body(res)).success).toBe(false)
        authState.roles = ['ADMIN']
      },
    )

    it('refuses a caller holding no role at all', async () => {
      authState.roles = []
      const res = await listUsers(req('/api/v1/admin/users'))
      expect(res.status).toBe(403)
      authState.roles = ['ADMIN']
    })

    it('does not leak the roster through `read User`, which every role holds', async () => {
      // The point of gating on `manage User`: READ_ONLY has `read all`, so a
      // read-level gate would have served it the whole roster.
      authState.roles = ['READ_ONLY']
      const res = await listUsers(req('/api/v1/admin/users'))
      expect(res.status).toBe(403)
      authState.roles = ['ADMIN']
    })
  })

  describe('organization isolation', () => {
    it('never returns a user belonging to another tenant', async () => {
      const outsider = await makeUser({ organizationId: otherOrgId, name: 'Outsider' })
      const res = await listUsers(req('/api/v1/admin/users?limit=100'))
      const ids = (await rows(res)).map((r) => r.id)

      expect(res.status).toBe(200)
      expect(ids).not.toContain(outsider.id)
    })

    it('ignores an organizationId supplied in the query string', async () => {
      const outsider = await makeUser({ organizationId: otherOrgId, name: 'Outsider Two' })
      const res = await listUsers(req(`/api/v1/admin/users?organizationId=${otherOrgId}&limit=100`))
      const ids = (await rows(res)).map((r) => r.id)

      expect(ids).not.toContain(outsider.id)
      expect(ids).toContain(authState.userId)
    })

    it('cannot be made to cross tenants by searching for the other org’s user', async () => {
      const outsider = await makeUser({ organizationId: otherOrgId, name: 'Zzz Unique Outsider' })
      const res = await listUsers(req('/api/v1/admin/users?q=Zzz Unique Outsider'))

      expect(await rows(res)).toHaveLength(0)
      expect(outsider.organizationId).toBe(otherOrgId)
    })
  })

  describe('projection', () => {
    it('returns status, roles, last sign-in and created-at', async () => {
      const when = new Date('2026-02-02T10:00:00.000Z')
      const u = await makeUser({ status: 'SUSPENDED', role: 'VERIFIER', lastLoginAt: when })
      const res = await listUsers(req(`/api/v1/admin/users?q=${u.name}`))
      const [row] = await rows(res)

      expect(row).toMatchObject({
        id: u.id,
        name: u.name,
        email: u.email,
        status: 'SUSPENDED',
        roles: ['VERIFIER'],
      })
      expect(new Date(row!.lastLoginAt!).toISOString()).toBe(when.toISOString())
      expect(row!.createdAt).toEqual(expect.any(String))
    })

    it('never returns the password hash or preferences', async () => {
      const res = await listUsers(req('/api/v1/admin/users?limit=100'))
      for (const row of await rows(res)) {
        expect(row).not.toHaveProperty('passwordHash')
        expect(row).not.toHaveProperty('preferences')
      }
    })

    it('returns an empty roles array for a user with none, not null', async () => {
      const u = await makeUser({ name: `Roleless ${uniq()}` })
      const res = await listUsers(req(`/api/v1/admin/users?q=${u.name}`))
      expect((await rows(res))[0]!.roles).toEqual([])
    })

    it('includes users the directory endpoint hides, which is the whole point', async () => {
      const invited = await makeUser({ status: 'INVITED', name: `Invited ${uniq()}` })
      const res = await listUsers(req(`/api/v1/admin/users?q=${invited.name}`))

      expect((await rows(res)).map((r) => r.id)).toContain(invited.id)
    })
  })

  describe('search', () => {
    it('matches on name, case-insensitively', async () => {
      const u = await makeUser({ name: `Grace Hopper ${uniq()}` })
      const res = await listUsers(req('/api/v1/admin/users?q=grace hopper&limit=100'))

      expect((await rows(res)).map((r) => r.id)).toContain(u.id)
    })

    it('matches on email', async () => {
      const u = await makeUser()
      const local = u.email.split('@')[0]!
      const res = await listUsers(req(`/api/v1/admin/users?q=${local}`))

      expect((await rows(res)).map((r) => r.id)).toEqual([u.id])
    })

    it('returns an empty page rather than an error when nothing matches', async () => {
      const res = await listUsers(req(`/api/v1/admin/users?q=no-such-person-${uniq()}`))
      const payload = await body(res)

      expect(res.status).toBe(200)
      expect(payload.data).toEqual([])
      expect(payload.meta.pagination?.nextCursor).toBeNull()
    })
  })

  describe('filtering', () => {
    it('narrows to one status', async () => {
      const suspended = await makeUser({ status: 'SUSPENDED' })
      const res = await listUsers(req('/api/v1/admin/users?status=SUSPENDED&limit=100'))
      const returned = await rows(res)

      expect(returned.map((r) => r.id)).toContain(suspended.id)
      expect(returned.every((r) => r.status === 'SUSPENDED')).toBe(true)
    })

    it('narrows to one role', async () => {
      const verifier = await makeUser({ role: 'VERIFIER' })
      const res = await listUsers(req('/api/v1/admin/users?role=VERIFIER&limit=100'))
      const returned = await rows(res)

      expect(returned.map((r) => r.id)).toContain(verifier.id)
      expect(returned.every((r) => r.roles.includes('VERIFIER'))).toBe(true)
    })

    it('combines status and role with AND', async () => {
      const wanted = await makeUser({ status: 'ACTIVE', role: 'EXPORT_MANAGER' })
      const decoy = await makeUser({ status: 'DEACTIVATED', role: 'EXPORT_MANAGER' })
      const res = await listUsers(
        req('/api/v1/admin/users?status=ACTIVE&role=EXPORT_MANAGER&limit=100'),
      )
      const ids = (await rows(res)).map((r) => r.id)

      expect(ids).toContain(wanted.id)
      expect(ids).not.toContain(decoy.id)
    })

    it('filters the role in the database, so a page is never short', async () => {
      // A post-filter would cut the page first and drop non-matching rows
      // afterwards, returning fewer than `limit` while more still existed.
      await Promise.all([
        makeUser({ role: 'READ_ONLY' }),
        makeUser({ role: 'READ_ONLY' }),
        makeUser({ role: 'READ_ONLY' }),
      ])
      const res = await listUsers(req('/api/v1/admin/users?role=READ_ONLY&limit=2'))
      const payload = await body(res)

      expect(payload.data).toHaveLength(2)
      expect(payload.meta.pagination?.nextCursor).not.toBeNull()
    })
  })

  describe('pagination', () => {
    it('walks every row exactly once, with no repeat and no gap', async () => {
      await Promise.all([makeUser(), makeUser(), makeUser(), makeUser(), makeUser()])

      const seen: string[] = []
      let cursor: string | null = null
      for (let page = 0; page < 20; page += 1) {
        const url: string = cursor
          ? `/api/v1/admin/users?limit=2&cursor=${encodeURIComponent(cursor)}`
          : '/api/v1/admin/users?limit=2'
        const res: Response = await listUsers(req(url))
        const payload = await body(res)
        seen.push(...(payload.data as unknown as Row[]).map((r) => r.id))
        cursor = payload.meta.pagination?.nextCursor ?? null
        if (!cursor) break
      }

      expect(new Set(seen).size).toBe(seen.length)
      const all = await listUsers(req('/api/v1/admin/users?limit=100'))
      expect(new Set(seen)).toEqual(new Set((await rows(all)).map((r) => r.id)))
    })

    it('reports a null cursor on the last page', async () => {
      const res = await listUsers(req('/api/v1/admin/users?limit=100'))
      expect((await body(res)).meta.pagination?.nextCursor).toBeNull()
    })

    it('honours the requested page size', async () => {
      await Promise.all([makeUser(), makeUser()])
      const res = await listUsers(req('/api/v1/admin/users?limit=1'))
      const payload = await body(res)

      expect(payload.data).toHaveLength(1)
      expect(payload.meta.pagination?.limit).toBe(1)
    })
  })

  describe('sorting', () => {
    it('defaults to newest first', async () => {
      const res = await listUsers(req('/api/v1/admin/users?limit=100'))
      const created = (await rows(res)).map((r) => new Date(r.createdAt).getTime())
      const descending = [...created].sort((a, b) => b - a)

      expect(created).toEqual(descending)
    })

    it('sorts by name ascending and descending', async () => {
      const asc = await listUsers(req('/api/v1/admin/users?sort=name&limit=100'))
      const names = (await rows(asc)).map((r) => r.name)
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))

      const desc = await listUsers(req('/api/v1/admin/users?sort=-name&limit=100'))
      const reversed = (await rows(desc)).map((r) => r.name)
      expect(reversed).toEqual([...reversed].sort((a, b) => b.localeCompare(a)))
    })

    it('sorts by email', async () => {
      const res = await listUsers(req('/api/v1/admin/users?sort=email&limit=100'))
      const emails = (await rows(res)).map((r) => r.email)
      expect(emails).toEqual([...emails].sort())
    })

    it('paginates a non-default sort without repeating or skipping a row', async () => {
      const seen: string[] = []
      let cursor: string | null = null
      for (let page = 0; page < 20; page += 1) {
        const url: string = cursor
          ? `/api/v1/admin/users?sort=name&limit=2&cursor=${encodeURIComponent(cursor)}`
          : '/api/v1/admin/users?sort=name&limit=2'
        const res: Response = await listUsers(req(url))
        const payload = await body(res)
        seen.push(...(payload.data as unknown as Row[]).map((r) => r.id))
        cursor = payload.meta.pagination?.nextCursor ?? null
        if (!cursor) break
      }

      expect(new Set(seen).size).toBe(seen.length)
      const all = await listUsers(req('/api/v1/admin/users?limit=100'))
      expect(seen.length).toBe((await rows(all)).length)
    })
  })

  describe('the directory endpoint is unchanged', () => {
    it('still hides non-active users, while this endpoint shows them', async () => {
      const { GET: searchDirectory } = await import('./users/route')
      const suspended = await makeUser({
        status: 'SUSPENDED',
        name: `Directory Check ${uniq()}`,
      })

      const dir = await searchDirectory(req(`/api/v1/users?q=${suspended.name}`))
      const dirRows = (await body(dir)).data as unknown as Array<{ id: string }>
      expect(dirRows.map((r) => r.id)).not.toContain(suspended.id)

      const admin = await listUsers(req(`/api/v1/admin/users?q=${suspended.name}`))
      expect((await rows(admin)).map((r) => r.id)).toContain(suspended.id)
    })

    it('still serves a non-admin, which this endpoint does not', async () => {
      const { GET: searchDirectory } = await import('./users/route')
      authState.roles = ['READ_ONLY']

      const dir = await searchDirectory(req('/api/v1/users'))
      expect(dir.status).toBe(200)

      const admin = await listUsers(req('/api/v1/admin/users'))
      expect(admin.status).toBe(403)

      authState.roles = ['ADMIN']
    })
  })

  describe('invite', () => {
    const post = (payload: unknown) =>
      inviteUser(
        req('/api/v1/admin/users', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        }),
      )

    it('creates the user, the role and an invitation together', async () => {
      const email = `invite-${uniq()}@triyara.test`
      const res = await post({ name: 'Invited Person', email, role: 'VERIFIER' })
      expect(res.status).toBe(201)

      const user = await prisma.user.findUniqueOrThrow({
        where: { email },
        include: { roles: { include: { role: true } }, resetTokens: true },
      })
      expect(user.organizationId).toBe(authState.organizationId)
      expect(user.roles.map((r) => r.role.name)).toEqual(['VERIFIER'])
      // The invitation is the only way in, so it must exist and be unexpired.
      expect(user.resetTokens).toHaveLength(1)
      expect(user.resetTokens[0]!.expiresAt.getTime()).toBeGreaterThan(Date.now())
      expect(user.resetTokens[0]!.usedAt).toBeNull()
    })

    it('stores a password hash nobody can sign in with', async () => {
      const email = `invite-${uniq()}@triyara.test`
      await post({ name: 'Invited Person', email, role: 'READ_ONLY' })

      const user = await prisma.user.findUniqueOrThrow({ where: { email } })
      // A bcrypt hash of 48 random bytes. Not empty, not a known string.
      expect(user.passwordHash).toMatch(/^\$2[aby]\$/)
      expect(user.passwordHash.length).toBeGreaterThan(50)
    })

    it('writes an audit row that carries no credential', async () => {
      const email = `invite-${uniq()}@triyara.test`
      const res = await post({ name: 'Invited Person', email, role: 'EXPORT_MANAGER' })
      const created = (await body(res)).data as unknown as { id: string }

      const audit = await prisma.auditLog.findFirst({
        where: { entityType: 'User', entityId: created.id, action: 'user.invited' },
      })
      expect(audit).not.toBeNull()
      const serialised = JSON.stringify(audit)
      expect(serialised).toContain(email)
      expect(serialised).not.toContain('$2b$')
      expect(serialised).not.toMatch(/tokenHash|passwordHash/)
    })

    it('refuses a duplicate email and creates nothing', async () => {
      const email = `invite-${uniq()}@triyara.test`
      expect((await post({ name: 'First', email, role: 'VERIFIER' })).status).toBe(201)

      // A non-admin role on purpose: ADMIN is refused outright now, and this
      // test is about the duplicate email, not about who may be an admin.
      const second = await post({ name: 'Second', email, role: 'READ_ONLY' })
      expect(second.status).toBe(409)

      // The first user keeps their role and gains no extra invitation.
      const user = await prisma.user.findUniqueOrThrow({
        where: { email },
        include: { roles: { include: { role: true } }, resetTokens: true },
      })
      expect(user.name).toBe('First')
      expect(user.roles.map((r) => r.role.name)).toEqual(['VERIFIER'])
      expect(user.resetTokens).toHaveLength(1)
    })

    it('refuses inviting anyone straight to ADMIN, and creates nothing', async () => {
      // ADMIN is only ever reached through the access-request workflow.
      const email = `noadmin-${uniq()}@triyara.test`
      const res = await post({ name: 'Would-be admin', email, role: 'ADMIN' })
      expect(res.status).toBe(403)
      expect(await prisma.user.findUnique({ where: { email } })).toBeNull()
    })

    it('refuses a non-admin and creates nothing', async () => {
      const email = `invite-${uniq()}@triyara.test`
      authState.roles = ['EXPORT_MANAGER']
      try {
        const res = await post({ name: 'Nope', email, role: 'ADMIN' })
        expect(res.status).toBe(403)
      } finally {
        authState.roles = ['ADMIN']
      }
      expect(await prisma.user.findUnique({ where: { email } })).toBeNull()
    })

    it('files the new user in the caller organization, not another', async () => {
      const email = `invite-${uniq()}@triyara.test`
      await post({ name: 'Scoped', email, role: 'VERIFIER' })
      const user = await prisma.user.findUniqueOrThrow({ where: { email } })
      expect(user.organizationId).toBe(authState.organizationId)
      expect(user.organizationId).not.toBe(otherOrgId)
    })
  })
})
