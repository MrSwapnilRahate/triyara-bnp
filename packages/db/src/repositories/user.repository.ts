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

  async updatePassword(id: string, passwordHash: string): Promise<void> {
    await prisma.user.update({ where: { id }, data: { passwordHash } })
  },
}
