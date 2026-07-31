import type { RoleName, User } from '@prisma/client'
import type { Prisma } from '@prisma/client'

import { prisma } from '../client'

export interface UserWithRoles extends User {
  roles: { role: { name: RoleName } }[]
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
}

export type UserRepository = typeof userRepository
