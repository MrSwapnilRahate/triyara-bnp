import type { RoleName } from '@prisma/client'

import { prisma } from '../client'

// Read-only lookup over the FROZEN Role table (TRY-BNP-AUTH-01). Adding a
// reader changes nothing about that module: there are no writes here, and the
// role catalogue itself is still seeded and owned by the auth foundation.

export interface RoleRecord {
  id: string
  name: RoleName
  description: string | null
}

export const roleRepository = {
  findByName(name: RoleName): Promise<RoleRecord | null> {
    return prisma.role.findUnique({
      where: { name },
      select: { id: true, name: true, description: true },
    })
  },

  list(): Promise<RoleRecord[]> {
    return prisma.role.findMany({
      select: { id: true, name: true, description: true },
      orderBy: { name: 'asc' },
    })
  },
}

export type RoleRepository = typeof roleRepository
