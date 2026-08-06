// @vitest-environment node
import { buildAbilityFor, type Role } from '@triyara/auth'
import { ConflictError, NotFoundError } from '@triyara/lib'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Route layer in isolation: auth context and the services are mocked, so these
// assert the HTTP contract - envelope, status, path parsing, delegation - and
// leave the business rules themselves to the service and integration tests.

const authState = { roles: ['ADMIN'] as Role[], organizationId: 'org1', userId: 'me' }

vi.mock('@/auth/context', () => ({
  requireAuth: vi.fn(async () => ({
    user: {
      id: authState.userId,
      organizationId: authState.organizationId,
      email: 'a@b.com',
      name: 'A',
      roles: authState.roles,
    },
    organizationId: authState.organizationId,
    ability: buildAbilityFor(authState.roles),
  })),
}))

const userRoleService = { list: vi.fn(), assign: vi.fn(), revoke: vi.fn() }
const permissionService = { roleMatrix: vi.fn() }
vi.mock('@/lib/auth-extension-service', () => ({ userRoleService, permissionService }))

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
    errors: Array<{ code: string; message: string; field?: string }> | null
  }

const roleRow = (name: string) => ({ roleId: `r-${name}`, name, description: null })

describe('base role membership routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState.roles = ['ADMIN']
    userRoleService.list.mockResolvedValue([roleRow('ADMIN')])
    userRoleService.assign.mockResolvedValue([roleRow('ADMIN'), roleRow('VERIFIER')])
    userRoleService.revoke.mockResolvedValue([roleRow('ADMIN')])
  })

  describe('GET /admin/users/:id/roles', () => {
    it('returns the roles in the platform envelope', async () => {
      const res = await listRoles(req('/api/v1/admin/users/u1/roles'), params('u1'))
      const payload = await body(res)

      expect(res.status).toBe(200)
      expect(payload.success).toBe(true)
      expect(payload.errors).toBeNull()
      expect(payload.meta).toMatchObject({ userId: 'u1', count: 1 })
    })

    it('passes the path id through to the service', async () => {
      await listRoles(req('/api/v1/admin/users/u7/roles'), params('u7'))
      expect(userRoleService.list).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'org1' }),
        'u7',
      )
    })

    it('translates a not-found user into 404', async () => {
      userRoleService.list.mockRejectedValue(new NotFoundError('User not found.'))
      const res = await listRoles(req('/api/v1/admin/users/nope/roles'), params('nope'))
      expect(res.status).toBe(404)
    })
  })

  describe('POST /admin/users/:id/roles', () => {
    it('returns 201 with the resulting role set', async () => {
      const res = await assignRole(
        req('/api/v1/admin/users/u1/roles', {
          method: 'POST',
          body: JSON.stringify({ role: 'VERIFIER' }),
        }),
        params('u1'),
      )
      const payload = await body(res)

      expect(res.status).toBe(201)
      expect(payload.data).toHaveLength(2)
      expect(userRoleService.assign).toHaveBeenCalledWith(expect.anything(), 'u1', 'VERIFIER')
    })

    it('rejects an unknown role with 422 without calling the service', async () => {
      const res = await assignRole(
        req('/api/v1/admin/users/u1/roles', {
          method: 'POST',
          body: JSON.stringify({ role: 'SUPERUSER' }),
        }),
        params('u1'),
      )

      expect(res.status).toBe(422)
      expect(userRoleService.assign).not.toHaveBeenCalled()
    })

    it('rejects a missing body with 422', async () => {
      const res = await assignRole(
        req('/api/v1/admin/users/u1/roles', { method: 'POST', body: JSON.stringify({}) }),
        params('u1'),
      )
      expect(res.status).toBe(422)
      expect(userRoleService.assign).not.toHaveBeenCalled()
    })

    it('translates a duplicate grant into 409', async () => {
      userRoleService.assign.mockRejectedValue(
        new ConflictError('This user already holds that role.'),
      )
      const res = await assignRole(
        req('/api/v1/admin/users/u1/roles', {
          method: 'POST',
          body: JSON.stringify({ role: 'ADMIN' }),
        }),
        params('u1'),
      )

      expect(res.status).toBe(409)
      expect((await body(res)).success).toBe(false)
    })
  })

  describe('DELETE /admin/users/:id/roles/:role', () => {
    it('returns the remaining roles', async () => {
      const res = await revokeRole(
        req('/api/v1/admin/users/u1/roles/VERIFIER', { method: 'DELETE' }),
        params('u1', 'VERIFIER'),
      )

      expect(res.status).toBe(200)
      expect(userRoleService.revoke).toHaveBeenCalledWith(expect.anything(), 'u1', 'VERIFIER')
    })

    it('validates the role path segment, so an unknown name is 422 not a no-op', async () => {
      const res = await revokeRole(
        req('/api/v1/admin/users/u1/roles/WIZARD', { method: 'DELETE' }),
        params('u1', 'WIZARD'),
      )

      expect(res.status).toBe(422)
      expect(userRoleService.revoke).not.toHaveBeenCalled()
    })

    it('url-decodes the role segment', async () => {
      await revokeRole(
        req('/api/v1/admin/users/u1/roles/EXPORT_MANAGER', { method: 'DELETE' }),
        params('u1', 'EXPORT_MANAGER'),
      )
      expect(userRoleService.revoke).toHaveBeenCalledWith(expect.anything(), 'u1', 'EXPORT_MANAGER')
    })

    it('translates the last-administrator refusal into 409', async () => {
      userRoleService.revoke.mockRejectedValue(
        new ConflictError('This is the only administrator in the organization.'),
      )
      const res = await revokeRole(
        req('/api/v1/admin/users/u1/roles/ADMIN', { method: 'DELETE' }),
        params('u1', 'ADMIN'),
      )

      expect(res.status).toBe(409)
    })
  })

  describe('GET /auth/permission-matrix', () => {
    beforeEach(() => {
      permissionService.roleMatrix.mockReturnValue({
        actions: ['read'],
        subjects: ['User'],
        roles: [{ role: 'ADMIN', permissions: { User: ['read'] } }],
      })
    })

    it('returns the matrix in the envelope', async () => {
      const res = await getMatrix(req('/api/v1/auth/permission-matrix'))
      const payload = await body(res)

      expect(res.status).toBe(200)
      expect(payload.success).toBe(true)
      expect(payload.data).toMatchObject({ actions: ['read'], subjects: ['User'] })
    })

    it('is cacheable but only privately', async () => {
      const res = await getMatrix(req('/api/v1/auth/permission-matrix'))
      expect(res.headers.get('cache-control')).toBe('private, max-age=300')
    })

    it('serves any signed-in role, because it carries no tenant data', async () => {
      for (const role of ['READ_ONLY', 'VERIFIER', 'EXPORT_MANAGER'] as Role[]) {
        authState.roles = [role]
        const res = await getMatrix(req('/api/v1/auth/permission-matrix'))
        expect(res.status).toBe(200)
      }
    })
  })
})
