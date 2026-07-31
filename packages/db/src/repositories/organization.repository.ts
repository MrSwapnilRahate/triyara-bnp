import type { Organization } from '@prisma/client'

import { prisma } from '../client'

export const organizationRepository = {
  findById(id: string): Promise<Organization | null> {
    return prisma.organization.findUnique({ where: { id } })
  },

  /**
   * Renames the organization. `slug` is deliberately not updatable: it is the
   * tenant's stable handle, referenced in seeds and fixtures, and changing it
   * would silently break anything holding the old one.
   */
  update(id: string, data: { name: string }): Promise<Organization> {
    return prisma.organization.update({ where: { id }, data: { name: data.name } })
  },
}

export type OrganizationRepository = typeof organizationRepository
