import type { RoleName, User, UserStatus } from '@prisma/client'
import type { Prisma } from '@prisma/client'

import { prisma } from '../client'
import { decodeCursor, encodeCursor } from './account.repository'

export interface UserWithRoles extends User {
  roles: { role: { name: RoleName } }[]
}

/**
 * What an administrator may see about a colleague. Fixed rather than
 * parameterised: a projection a caller can widen is a projection that will be
 * widened.
 */
const adminUserSelect = {
  id: true,
  name: true,
  email: true,
  avatarUrl: true,
  status: true,
  lastLoginAt: true,
  createdAt: true,
  roles: { select: { role: { select: { name: true } } } },
} satisfies Prisma.UserSelect

export type AdminUserRecord = Prisma.UserGetPayload<{ select: typeof adminUserSelect }>

export interface ListAdminUsersParams {
  limit: number
  cursor?: string
  q?: string
  status?: UserStatus
  role?: RoleName
  sort?: string
}

export interface AdminUserListResult {
  items: AdminUserRecord[]
  nextCursor: string | null
}

// Repository for identity reads/writes. Business repositories arrive with their modules.
export const userRepository = {
  findByEmail(email: string): Promise<UserWithRoles | null> {
    return prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { roles: { include: { role: true } } },
    })
  },

  findById(id: string): Promise<UserWithRoles | null> {
    return prisma.user.findUnique({
      where: { id },
      include: { roles: { include: { role: true } } },
    })
  },

  async markLogin(id: string): Promise<void> {
    await prisma.user.update({ where: { id }, data: { lastLoginAt: new Date() } })
  },

  /**
   * Changes the display name only. Email is the login identifier and roles are
   * granted by an administrator, so neither is writable through the profile
   * endpoint that calls this.
   */
  async updateProfile(
    id: string,
    data: { name?: string; avatarUrl?: string | null; preferences?: Record<string, unknown> },
  ): Promise<void> {
    const patch: Prisma.UserUpdateInput = {}
    if (data.name !== undefined) patch.name = data.name
    if (data.avatarUrl !== undefined) patch.avatarUrl = data.avatarUrl
    // The Prisma boundary is here, so the narrowing to InputJsonValue is here
    // too - callers pass an ordinary record and stay free of Prisma's types.
    if (data.preferences !== undefined) {
      patch.preferences = data.preferences as Prisma.InputJsonValue
    }
    await prisma.user.update({ where: { id }, data: patch })
  },

  /** The stored hash, for verifying a current password before changing it. */
  async findPasswordHash(id: string): Promise<string | null> {
    const row = await prisma.user.findUnique({ where: { id }, select: { passwordHash: true } })
    return row?.passwordHash ?? null
  },

  /** Compact projection for the global search directory. */
  searchDirectory(organizationId: string, q: string | undefined, limit: number) {
    return prisma.user.findMany({
      where: {
        organizationId,
        status: 'ACTIVE',
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { email: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      // No passwordHash, no preferences: a directory lookup must not be a way
      // to read anything about a colleague beyond how to address them.
      select: { id: true, name: true, email: true, avatarUrl: true },
      orderBy: { name: 'asc' },
      take: limit,
    })
  },

  async updatePassword(id: string, passwordHash: string): Promise<void> {
    await prisma.user.update({ where: { id }, data: { passwordHash } })
  },

  /**
   * The administrator's list (TRY-BNP-ADMIN-02).
   *
   * Additive: `searchDirectory` above is untouched and still backs global
   * search. The two differ in what they are for, so they differ in what they
   * return - this one carries status, roles and last sign-in, and is reachable
   * only through a route that requires `manage User`.
   *
   * Still no `passwordHash` and no `preferences`. Administering someone is not
   * a reason to read their credentials or their UI choices.
   */
  async listForAdmin(
    organizationId: string,
    params: ListAdminUsersParams,
  ): Promise<AdminUserListResult> {
    const where: Prisma.UserWhereInput = {
      organizationId,
      ...(params.status ? { status: params.status } : {}),
      // A join filter, not a post-filter: excluding rows in the database keeps
      // the page size honest. Filtering after the fact returns short pages and
      // a cursor that points past rows the caller never saw.
      ...(params.role ? { roles: { some: { role: { name: params.role } } } } : {}),
      ...(params.q
        ? {
            OR: [
              { name: { contains: params.q, mode: 'insensitive' } },
              { email: { contains: params.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    }

    const raw = params.sort ?? '-createdAt'
    const dir: Prisma.SortOrder = raw.startsWith('-') ? 'desc' : 'asc'
    const field = raw.replace(/^-/, '') as 'createdAt' | 'name' | 'email'

    const rows = await prisma.user.findMany({
      where,
      select: adminUserSelect,
      // `id` tiebreaks in the same direction, so rows sharing a name or a
      // creation instant cannot repeat or vanish across a page boundary.
      orderBy: [{ [field]: dir }, { id: dir }],
      take: params.limit + 1,
      ...(params.cursor ? { cursor: { id: decodeCursor(params.cursor) }, skip: 1 } : {}),
    })

    const items = rows.slice(0, params.limit)
    const nextCursor = rows.length > params.limit ? encodeCursor(items[items.length - 1]!.id) : null
    return { items, nextCursor }
  },
}

export type UserRepository = typeof userRepository
