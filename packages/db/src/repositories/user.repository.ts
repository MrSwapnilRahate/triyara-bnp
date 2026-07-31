import type { RoleName, User } from '@prisma/client'

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
  async updateProfile(id: string, data: { name: string }): Promise<void> {
    await prisma.user.update({ where: { id }, data: { name: data.name } })
  },

  async updatePassword(id: string, passwordHash: string): Promise<void> {
    await prisma.user.update({ where: { id }, data: { passwordHash } })
  },
}

export type UserRepository = typeof userRepository
