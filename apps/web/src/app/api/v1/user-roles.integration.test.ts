// @vitest-environment node
import { randomUUID } from 'node:crypto'

import { buildAbilityFor, type Role } from '@triyara/auth'
import { prisma } from '@triyara/db'
import { beforeAll, describe, expect, it, vi } from 'vitest'

// Full stack: route handler -> service -> repository -> real PostgreSQL. Only
// the auth context is mocked, so authorization, organization isolation, the
// audit rows and the last-administrator guard are exercised for real.

const authState = { roles: ['ADMIN'] as Role[], organizationId: '', userId: '' }

vi.mock('@/auth/context', () => ({
  requireAuth: vi.fn(async () => ({
    user: {
      id: authState.userId,
      organizationId: authState.organizationId,
      email: 'user-roles-it@triyara.test',
      name: 'User Roles IT',
      roles: authState.roles,
    },
    organizationId: authState.organizationId,
    ability: buildAbilityFor(authState.roles),
  })),
}))

const { GET: listRoles, POST: assignRole } = await import('./admin/users/[id]/roles/route')
const { DELETE: revokeRole } = await import('./admin/users/[id]/roles/[role]/route')
const { GET: getMatrix } = await import('./auth/permission-matrix/route')

const req = (url: string, init?: RequestInit) => new Request(`http://t.test${url}`, init)
const params = (id: string, role?: string) =>
  ({
    params: Promise.resolve(role ? { id, role } : { id }),
  }) as never
const body = async (res: Response) =>
  (await res.json()) as {
    success: boolean
    data: never
    meta: { requestId: string; [k: string]: unknown }
    errors: Array<{ code: string; message: string }> | null
  }

type RoleRow = { roleId: string; name: string; description: string | null }
const rows = async (res: Response) => (await body(res)).data as unknown as RoleRow[]
const names = async (res: Response) => (await rows(res)).map((r) => r.name).sort()

// Fixtures namespaced to this file: vitest runs files in parallel and `upsert`
// is a select-then-insert, so a shared slug races on an empty database.
const uniq = () => randomUUID().replace(/-/g, '').slice(0, 10)
const SLUG = 'user-roles-itest'

describe.skipIf(!process.env.DATABASE_URL)(
  'base role membership API (integration, real PostgreSQL)',
  () => {
    let otherOrgId = ''
    const roleIds: Record<string, string> = {}

    async function makeUser(over: { organizationId?: string; roles?: string[] } = {}) {
      const id = uniq()
      const user = await prisma.user.create({
        data: {
          organizationId: over.organizationId ?? authState.organizationId,
          email: `ur-${id}@triyara.test`,
          name: `User ${id}`,
          passwordHash: 'x',
        },
      })
      for (const r of over.roles ?? []) {
        await prisma.userRole.create({ data: { userId: user.id, roleId: roleIds[r]! } })
      }
      return user
    }

    beforeAll(async () => {
      const org = await prisma.organization.upsert({
        where: { slug: SLUG },
        update: {},
        create: { name: 'User Roles IT', slug: SLUG },
      })
      authState.organizationId = org.id

      const other = await prisma.organization.upsert({
        where: { slug: `${SLUG}-other` },
        update: {},
        create: { name: 'Other Tenant', slug: `${SLUG}-other` },
      })
      otherOrgId = other.id

      // Sequential: Role.name is globally unique, so concurrent upserts race.
      for (const name of ['ADMIN', 'EXPORT_MANAGER', 'VERIFIER', 'READ_ONLY'] as const) {
        const role = await prisma.role.upsert({ where: { name }, update: {}, create: { name } })
        roleIds[name] = role.id
      }

      const me = await prisma.user.upsert({
        where: { email: 'user-roles-it@triyara.test' },
        update: {},
        create: {
          organizationId: org.id,
          email: 'user-roles-it@triyara.test',
          name: 'User Roles IT',
          passwordHash: 'x',
        },
      })
      authState.userId = me.id
      // The caller is an administrator, and a second one exists so the
      // last-admin guard does not fire on unrelated tests.
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: me.id, roleId: roleIds.ADMIN! } },
        update: {},
        create: { userId: me.id, roleId: roleIds.ADMIN! },
      })
      await makeUser({ roles: ['ADMIN'] })
    })

    describe('authorization', () => {
      it.each([['EXPORT_MANAGER'], ['VERIFIER'], ['READ_ONLY']])(
        'refuses %s on all three operations',
        async (role) => {
          const target = await makeUser()
          authState.roles = [role as Role]

          const list = await listRoles(req(`/x/${target.id}/roles`), params(target.id))
          const assign = await assignRole(
            req(`/x/${target.id}/roles`, {
              method: 'POST',
              body: JSON.stringify({ role: 'VERIFIER' }),
            }),
            params(target.id),
          )
          const revoke = await revokeRole(
            req(`/x/${target.id}/roles/VERIFIER`, { method: 'DELETE' }),
            params(target.id, 'VERIFIER'),
          )

          expect([list.status, assign.status, revoke.status]).toEqual([403, 403, 403])
          authState.roles = ['ADMIN']
        },
      )

      it('does not leak the role list through `read User`, which every role holds', async () => {
        const target = await makeUser({ roles: ['ADMIN'] })
        authState.roles = ['READ_ONLY']
        const res = await listRoles(req(`/x/${target.id}/roles`), params(target.id))
        expect(res.status).toBe(403)
        authState.roles = ['ADMIN']
      })
    })

    describe('organization isolation', () => {
      it('reports a user in another tenant as 404, never 403', async () => {
        const outsider = await makeUser({ organizationId: otherOrgId })

        const list = await listRoles(req(`/x/${outsider.id}/roles`), params(outsider.id))
        const assign = await assignRole(
          req(`/x/${outsider.id}/roles`, {
            method: 'POST',
            body: JSON.stringify({ role: 'VERIFIER' }),
          }),
          params(outsider.id),
        )
        const revoke = await revokeRole(
          req(`/x/${outsider.id}/roles/VERIFIER`, { method: 'DELETE' }),
          params(outsider.id, 'VERIFIER'),
        )

        expect([list.status, assign.status, revoke.status]).toEqual([404, 404, 404])
      })

      it('does not grant a role to a user in another tenant', async () => {
        const outsider = await makeUser({ organizationId: otherOrgId })
        await assignRole(
          req(`/x/${outsider.id}/roles`, {
            method: 'POST',
            body: JSON.stringify({ role: 'VERIFIER' }),
          }),
          params(outsider.id),
        )

        const held = await prisma.userRole.findMany({ where: { userId: outsider.id } })
        expect(held).toHaveLength(0)
      })
    })

    describe('assign', () => {
      it('grants a role and returns the resulting set', async () => {
        const target = await makeUser()
        const res = await assignRole(
          req(`/x/${target.id}/roles`, {
            method: 'POST',
            body: JSON.stringify({ role: 'VERIFIER' }),
          }),
          params(target.id),
        )

        expect(res.status).toBe(201)
        expect(await names(res)).toEqual(['VERIFIER'])
      })

      it('accumulates roles rather than replacing them', async () => {
        const target = await makeUser({ roles: ['READ_ONLY'] })
        const res = await assignRole(
          req(`/x/${target.id}/roles`, {
            method: 'POST',
            body: JSON.stringify({ role: 'VERIFIER' }),
          }),
          params(target.id),
        )

        expect(await names(res)).toEqual(['READ_ONLY', 'VERIFIER']) // names() sorts
      })

      it('refuses a duplicate with 409 and leaves the set unchanged', async () => {
        const target = await makeUser({ roles: ['VERIFIER'] })
        const res = await assignRole(
          req(`/x/${target.id}/roles`, {
            method: 'POST',
            body: JSON.stringify({ role: 'VERIFIER' }),
          }),
          params(target.id),
        )

        expect(res.status).toBe(409)
        const held = await prisma.userRole.findMany({ where: { userId: target.id } })
        expect(held).toHaveLength(1)
      })

      it('writes an audit row naming the user and both role sets', async () => {
        const target = await makeUser({ roles: ['READ_ONLY'] })
        await assignRole(
          req(`/x/${target.id}/roles`, {
            method: 'POST',
            body: JSON.stringify({ role: 'VERIFIER' }),
          }),
          params(target.id),
        )

        const audit = await prisma.auditLog.findFirst({
          where: { entityType: 'UserRole', entityId: target.id, action: 'user.role_assigned' },
          orderBy: { createdAt: 'desc' },
        })
        expect(audit).not.toBeNull()
        expect(audit!.organizationId).toBe(authState.organizationId)
        expect(audit!.actorId).toBe(authState.userId)
        // Enum declaration order, not alphabetical: RoleName is a PostgreSQL
        // enum, so VERIFIER sorts before READ_ONLY.
        expect(audit!.before).toEqual({ roles: ['READ_ONLY'] })
        expect(audit!.after).toEqual({ roles: ['VERIFIER', 'READ_ONLY'] })
      })
    })

    describe('revoke', () => {
      it('removes the role and returns what remains', async () => {
        const target = await makeUser({ roles: ['READ_ONLY', 'VERIFIER'] })
        const res = await revokeRole(
          req(`/x/${target.id}/roles/VERIFIER`, { method: 'DELETE' }),
          params(target.id, 'VERIFIER'),
        )

        expect(res.status).toBe(200)
        expect(await names(res)).toEqual(['READ_ONLY'])
      })

      it('is 404 when the user does not hold the role', async () => {
        const target = await makeUser({ roles: ['READ_ONLY'] })
        const res = await revokeRole(
          req(`/x/${target.id}/roles/VERIFIER`, { method: 'DELETE' }),
          params(target.id, 'VERIFIER'),
        )
        expect(res.status).toBe(404)
      })

      it('writes an audit row', async () => {
        const target = await makeUser({ roles: ['READ_ONLY', 'VERIFIER'] })
        await revokeRole(
          req(`/x/${target.id}/roles/VERIFIER`, { method: 'DELETE' }),
          params(target.id, 'VERIFIER'),
        )

        const audit = await prisma.auditLog.findFirst({
          where: { entityType: 'UserRole', entityId: target.id, action: 'user.role_revoked' },
          orderBy: { createdAt: 'desc' },
        })
        expect(audit).not.toBeNull()
        expect(audit!.before).toEqual({ roles: ['VERIFIER', 'READ_ONLY'] })
        expect(audit!.after).toEqual({ roles: ['READ_ONLY'] })
      })

      it('refuses to remove the caller’s own administrator role', async () => {
        const res = await revokeRole(
          req(`/x/${authState.userId}/roles/ADMIN`, { method: 'DELETE' }),
          params(authState.userId, 'ADMIN'),
        )

        expect(res.status).toBe(409)
        const still = await prisma.userRole.findFirst({
          where: { userId: authState.userId, roleId: roleIds.ADMIN! },
        })
        expect(still).not.toBeNull()
      })

      it('refuses to remove the organization’s last administrator', async () => {
        // A tenant of its own so the count is unambiguous, and a fresh one per
        // run: upserting a fixed slug would accumulate an administrator on
        // every execution and quietly stop exercising the guard.
        const soloOrg = await prisma.organization.create({
          data: { name: 'Solo Tenant', slug: `${SLUG}-solo-${uniq()}` },
        })
        const onlyAdmin = await prisma.user.create({
          data: {
            organizationId: soloOrg.id,
            email: `solo-${uniq()}@triyara.test`,
            name: 'Solo Admin',
            passwordHash: 'x',
          },
        })
        await prisma.userRole.create({
          data: { userId: onlyAdmin.id, roleId: roleIds.ADMIN! },
        })

        const previousOrg = authState.organizationId
        const previousUser = authState.userId
        // Act as a different administrator inside that tenant, so the refusal
        // under test is the last-admin guard and not the self-revoke guard.
        const second = await prisma.user.create({
          data: {
            organizationId: soloOrg.id,
            email: `solo2-${uniq()}@triyara.test`,
            name: 'Solo Second',
            passwordHash: 'x',
          },
        })
        authState.organizationId = soloOrg.id
        authState.userId = second.id

        const res = await revokeRole(
          req(`/x/${onlyAdmin.id}/roles/ADMIN`, { method: 'DELETE' }),
          params(onlyAdmin.id, 'ADMIN'),
        )

        expect(res.status).toBe(409)
        const still = await prisma.userRole.findFirst({
          where: { userId: onlyAdmin.id, roleId: roleIds.ADMIN! },
        })
        expect(still).not.toBeNull()

        authState.organizationId = previousOrg
        authState.userId = previousUser
      })

      it('lets only one of two simultaneous revocations through', async () => {
        // The guard is a row lock, and this is what it is for: two
        // administrators revoking each other at the same instant must not both
        // observe "one other admin remains" and leave the tenant with none.
        const org = await prisma.organization.create({
          data: { name: 'Race Tenant', slug: `${SLUG}-race-${uniq()}` },
        })
        const admins = await Promise.all([
          prisma.user.create({
            data: {
              organizationId: org.id,
              email: `race1-${uniq()}@triyara.test`,
              name: 'Race One',
              passwordHash: 'x',
            },
          }),
          prisma.user.create({
            data: {
              organizationId: org.id,
              email: `race2-${uniq()}@triyara.test`,
              name: 'Race Two',
              passwordHash: 'x',
            },
          }),
        ])
        for (const a of admins) {
          await prisma.userRole.create({ data: { userId: a.id, roleId: roleIds.ADMIN! } })
        }

        const previousOrg = authState.organizationId
        const previousUser = authState.userId
        authState.organizationId = org.id
        // A third administrator issues both requests, so neither is refused by
        // the self-revoke rule and the last-admin guard is what decides.
        const actor = await prisma.user.create({
          data: {
            organizationId: org.id,
            email: `race3-${uniq()}@triyara.test`,
            name: 'Race Actor',
            passwordHash: 'x',
          },
        })
        authState.userId = actor.id

        const [a, b] = await Promise.all([
          revokeRole(
            req(`/x/${admins[0]!.id}/roles/ADMIN`, { method: 'DELETE' }),
            params(admins[0]!.id, 'ADMIN'),
          ),
          revokeRole(
            req(`/x/${admins[1]!.id}/roles/ADMIN`, { method: 'DELETE' }),
            params(admins[1]!.id, 'ADMIN'),
          ),
        ])

        const statuses = [a.status, b.status].sort()
        expect(statuses).toEqual([200, 409])

        const remaining = await prisma.userRole.count({
          where: { roleId: roleIds.ADMIN!, user: { organizationId: org.id } },
        })
        expect(remaining).toBe(1)

        authState.organizationId = previousOrg
        authState.userId = previousUser
      })

      it('allows removing an administrator while another remains', async () => {
        const extra = await makeUser({ roles: ['ADMIN'] })
        const res = await revokeRole(
          req(`/x/${extra.id}/roles/ADMIN`, { method: 'DELETE' }),
          params(extra.id, 'ADMIN'),
        )

        expect(res.status).toBe(200)
        expect(await names(res)).toEqual([])
      })
    })

    describe('permission matrix', () => {
      it('describes every role from the same function the guards use', async () => {
        const res = await getMatrix(req('/api/v1/auth/permission-matrix'))
        const data = (await body(res)).data as unknown as {
          actions: string[]
          subjects: string[]
          roles: Array<{ role: string; permissions: Record<string, string[]> }>
        }

        expect(res.status).toBe(200)
        expect(data.roles.map((r) => r.role).sort()).toEqual([
          'ADMIN',
          'EXPORT_MANAGER',
          'READ_ONLY',
          'VERIFIER',
        ])
        // ADMIN manages everything; READ_ONLY reads and nothing more.
        const admin = data.roles.find((r) => r.role === 'ADMIN')!
        expect(admin.permissions.all).toContain('manage')
        const readOnly = data.roles.find((r) => r.role === 'READ_ONLY')!
        expect(readOnly.permissions.all).toEqual(['read'])
      })

      it('carries the vocabulary so a client need not keep its own', async () => {
        const res = await getMatrix(req('/api/v1/auth/permission-matrix'))
        const data = (await body(res)).data as unknown as {
          actions: string[]
          subjects: string[]
        }

        expect(data.actions).toContain('manage')
        expect(data.subjects).toContain('User')
        expect(data.subjects).toContain('Organization')
      })

      it('agrees with what the guards actually enforce', async () => {
        // The matrix says READ_ONLY cannot manage User; the roles endpoint must
        // refuse a READ_ONLY caller. If these two ever disagree, one of them is
        // lying about the platform.
        const res = await getMatrix(req('/api/v1/auth/permission-matrix'))
        const data = (await body(res)).data as unknown as {
          roles: Array<{ role: string; permissions: Record<string, string[]> }>
        }
        const readOnly = data.roles.find((r) => r.role === 'READ_ONLY')!
        expect(readOnly.permissions.User ?? []).not.toContain('manage')

        const target = await makeUser()
        authState.roles = ['READ_ONLY']
        const refused = await listRoles(req(`/x/${target.id}/roles`), params(target.id))
        expect(refused.status).toBe(403)
        authState.roles = ['ADMIN']
      })
    })
  },
)
