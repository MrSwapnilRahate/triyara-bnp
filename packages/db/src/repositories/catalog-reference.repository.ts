import { prisma } from '../client'

// Read-only master lookups (units, packaging, HS codes, origin countries, attributes).
export const catalogReferenceRepository = {
  listUnits(orgId: string) {
    return prisma.unitOfMeasure.findMany({
      where: { organizationId: orgId, isActive: true },
      select: { id: true, code: true, name: true },
      orderBy: { code: 'asc' },
    })
  },
  listPackagingTypes(orgId: string) {
    return prisma.packagingType.findMany({
      where: { organizationId: orgId, isActive: true },
      select: { id: true, code: true, name: true },
      orderBy: { code: 'asc' },
    })
  },
  listOriginCountries(orgId: string) {
    return prisma.originCountry.findMany({
      where: { organizationId: orgId, isActive: true },
      select: { id: true, code: true, name: true },
      orderBy: { name: 'asc' },
    })
  },
  listHsCodes(orgId: string, q?: string) {
    return prisma.hSCode.findMany({
      where: {
        organizationId: orgId,
        isActive: true,
        ...(q
          ? {
              OR: [
                { code: { contains: q } },
                { description: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: { id: true, code: true, description: true, countryVariant: true },
      orderBy: { code: 'asc' },
      take: 200,
    })
  },
  listAttributes(orgId: string) {
    return prisma.productAttribute.findMany({
      where: { organizationId: orgId, isActive: true },
      select: { id: true, key: true, label: true, dataType: true, unit: true },
      orderBy: { label: 'asc' },
    })
  },
  attributeIds(orgId: string, ids: string[]) {
    return prisma.productAttribute.findMany({
      where: { organizationId: orgId, id: { in: ids } },
      select: { id: true, dataType: true },
    })
  },
  countRefs(
    orgId: string,
    table: 'unit' | 'packaging' | 'origin' | 'hsCode',
    ids: string[],
  ): Promise<number> {
    const where = { organizationId: orgId, id: { in: ids } }
    if (table === 'unit') return prisma.unitOfMeasure.count({ where })
    if (table === 'packaging') return prisma.packagingType.count({ where })
    if (table === 'origin') return prisma.originCountry.count({ where })
    return prisma.hSCode.count({ where })
  },
}
