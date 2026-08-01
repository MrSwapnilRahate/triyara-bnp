// @vitest-environment node
import { buildAbilityFor, type Role } from '@triyara/auth'
import { ForbiddenError } from '@triyara/lib'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Route layer in isolation: auth context and the service are mocked, so these
// assert the HTTP contract - envelope, status, query parsing, delegation - and
// leave authorization behaviour itself to the service and integration tests.

const authState = { roles: ['ADMIN'] as Role[], organizationId: 'org1', userId: 'u1' }

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

const adminUsersService = { list: vi.fn() }
vi.mock('@/lib/admin-users-service', () => ({ adminUsersService }))

const { GET: listUsers } = await import('./admin/users/route')

const req = (url: string, init?: RequestInit) => new Request(`http://t.test${url}`, init)
const body = async (res: Response) =>
  (await res.json()) as {
    success: boolean
    data: never
    meta: { requestId: string; [k: string]: unknown }
    errors: Array<{ code: string; message: string; field?: string }> | null
  }

const userRow = (over: Record<string, unknown> = {}) => ({
  id: 'u1',
  name: 'Ada Lovelace',
  email: 'ada@triyara.test',
  avatarUrl: null,
  status: 'ACTIVE',
  roles: ['ADMIN'],
  lastLoginAt: new Date('2026-01-01T00:00:00.000Z'),
  createdAt: new Date('2025-12-01T00:00:00.000Z'),
  ...over,
})

describe('GET /api/v1/admin/users', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState.roles = ['ADMIN']
    adminUsersService.list.mockResolvedValue({ items: [userRow()], nextCursor: null })
  })

  it('returns the page in the platform envelope', async () => {
    const res = await listUsers(req('/api/v1/admin/users'))
    const payload = await body(res)

    expect(res.status).toBe(200)
    expect(payload.success).toBe(true)
    expect(payload.errors).toBeNull()
    expect(payload.meta.requestId).toEqual(expect.any(String))
    expect(payload.data).toHaveLength(1)
  })

  it('returns every documented field, and no credential or preference', async () => {
    const res = await listUsers(req('/api/v1/admin/users'))
    const [row] = (await body(res)).data as unknown as Array<Record<string, unknown>>

    for (const field of [
      'id',
      'name',
      'email',
      'avatarUrl',
      'status',
      'roles',
      'lastLoginAt',
      'createdAt',
    ]) {
      expect(row).toHaveProperty(field)
    }
    // The projection is fixed in the repository; this asserts the route does
    // not widen it back out on the way through.
    expect(row).not.toHaveProperty('passwordHash')
    expect(row).not.toHaveProperty('preferences')
  })

  it('applies the schema defaults when no query is given', async () => {
    await listUsers(req('/api/v1/admin/users'))

    expect(adminUsersService.list).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org1' }),
      expect.objectContaining({ limit: 25 }),
    )
  })

  it('passes search, status, role, sort and cursor through to the service', async () => {
    await listUsers(
      req('/api/v1/admin/users?q=ada&status=SUSPENDED&role=VERIFIER&sort=name&limit=10&cursor=abc'),
    )

    expect(adminUsersService.list).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        q: 'ada',
        status: 'SUSPENDED',
        role: 'VERIFIER',
        sort: 'name',
        limit: 10,
        cursor: 'abc',
      }),
    )
  })

  it('echoes the applied filters and sort in meta, so a client can render them', async () => {
    const res = await listUsers(req('/api/v1/admin/users?q=ada&status=ACTIVE&role=ADMIN'))
    const { meta } = await body(res)

    expect(meta.filters).toEqual({ q: 'ada', status: 'ACTIVE', role: 'ADMIN' })
    expect(meta.sort).toBe('-createdAt')
  })

  it('surfaces the cursor for the next page, and null on the last', async () => {
    adminUsersService.list.mockResolvedValue({ items: [userRow()], nextCursor: 'next-page' })
    const more = await listUsers(req('/api/v1/admin/users'))
    expect((await body(more)).meta.pagination).toEqual({ limit: 25, nextCursor: 'next-page' })

    adminUsersService.list.mockResolvedValue({ items: [], nextCursor: null })
    const last = await listUsers(req('/api/v1/admin/users'))
    expect((await body(last)).meta.pagination).toEqual({ limit: 25, nextCursor: null })
  })

  it('rejects a limit outside the allowed range with 422 rather than clamping it', async () => {
    const res = await listUsers(req('/api/v1/admin/users?limit=500'))

    expect(res.status).toBe(422)
    expect(adminUsersService.list).not.toHaveBeenCalled()
  })

  it('rejects an unknown status with 422', async () => {
    const res = await listUsers(req('/api/v1/admin/users?status=NOPE'))

    expect(res.status).toBe(422)
    expect(adminUsersService.list).not.toHaveBeenCalled()
  })

  it('rejects an unknown role with 422', async () => {
    const res = await listUsers(req('/api/v1/admin/users?role=SUPERUSER'))

    expect(res.status).toBe(422)
    expect(adminUsersService.list).not.toHaveBeenCalled()
  })

  it('rejects a sort column that is not offered, including lastLoginAt', async () => {
    for (const sort of ['lastLoginAt', 'passwordHash', 'status']) {
      const res = await listUsers(req(`/api/v1/admin/users?sort=${sort}`))
      expect(res.status).toBe(422)
    }
    expect(adminUsersService.list).not.toHaveBeenCalled()
  })

  it('translates the service refusal into 403', async () => {
    adminUsersService.list.mockRejectedValue(new ForbiddenError('Not permitted: manage User'))
    const res = await listUsers(req('/api/v1/admin/users'))

    expect(res.status).toBe(403)
    expect((await body(res)).success).toBe(false)
  })

  it('documents every query parameter the schema accepts, with matching enums', async () => {
    // The document is hand-written, so nothing but a test stops it drifting
    // from the schema the route actually enforces.
    const { adminOpenApiDocument } = await import('@/lib/admin-openapi')
    const { listAdminUsersQuerySchema, USER_STATUSES, ASSIGNABLE_ROLES, ADMIN_USER_SORTS } =
      await import('@triyara/validation')

    const documented = adminOpenApiDocument.paths['/admin/users'].get.parameters
    const names = documented.map((p) => p.name)
    expect(new Set(names)).toEqual(new Set(Object.keys(listAdminUsersQuerySchema.shape)))

    const enumOf = (name: string) =>
      (documented.find((p) => p.name === name)?.schema as { enum?: readonly string[] }).enum
    expect(enumOf('status')).toEqual(USER_STATUSES)
    expect(enumOf('role')).toEqual(ASSIGNABLE_ROLES)
    expect(enumOf('sort')).toEqual(ADMIN_USER_SORTS)
  })

  it('never takes the organization from the query string', async () => {
    await listUsers(req('/api/v1/admin/users?organizationId=someone-elses-org'))

    const [ctx, query] = adminUsersService.list.mock.calls[0] as [
      { organizationId: string },
      Record<string, unknown>,
    ]
    expect(ctx.organizationId).toBe('org1')
    expect(query).not.toHaveProperty('organizationId')
  })
})
