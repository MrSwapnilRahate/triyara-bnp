import type { Organization } from '@prisma/client'

import { prisma } from '../client'

export const organizationRepository = {
  findById(id: string): Promise<Organization | null> {
    return prisma.organization.findUnique({ where: { id } })
  },
}
