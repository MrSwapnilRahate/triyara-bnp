import type { Organization, Prisma } from '@prisma/client'

import { prisma } from '../client'

export interface OrganizationSettingsData {
  name?: string
  logoUrl?: string | null
  defaultCurrency?: string
  timezone?: string
  dateFormat?: string
  language?: string
}

export const organizationRepository = {
  findById(id: string): Promise<Organization | null> {
    return prisma.organization.findUnique({ where: { id } })
  },

  /**
   * Updates the tenant's display settings. `slug` is deliberately absent: it is
   * the tenant's stable handle, referenced by seeds and fixtures, and changing
   * it would silently break anything holding the old one.
   *
   * Only keys actually supplied are written, so a caller may change one setting
   * without restating the rest.
   */
  update(id: string, data: OrganizationSettingsData): Promise<Organization> {
    const patch: Prisma.OrganizationUpdateInput = {}
    if (data.name !== undefined) patch.name = data.name
    if (data.logoUrl !== undefined) patch.logoUrl = data.logoUrl
    if (data.defaultCurrency !== undefined) patch.defaultCurrency = data.defaultCurrency
    if (data.timezone !== undefined) patch.timezone = data.timezone
    if (data.dateFormat !== undefined) patch.dateFormat = data.dateFormat
    if (data.language !== undefined) patch.language = data.language
    return prisma.organization.update({ where: { id }, data: patch })
  },
}

export type OrganizationRepository = typeof organizationRepository
