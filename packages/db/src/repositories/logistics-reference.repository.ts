import type { Prisma } from '@prisma/client'

import { prisma } from '../client'

// Global logistics reference data (V3.3, ADR-0012).
//
// Port and ContainerType carry NO organizationId, and that is the point: the
// same INNSA is Nhava Sheva for every tenant. There is deliberately no
// `organizationId` parameter on anything here - adding one would be the first
// step towards two tenants disagreeing about what a code means.
//
// Reads only. The rows are curated in prisma/seed-logistics.ts, so growth is by
// adding rows to that file rather than by an administrative CRUD screen nobody
// has asked for. `isActive` retires a port without deleting the history that
// references it.

const portSelect = {
  id: true,
  locode: true,
  name: true,
  countryCode: true,
  modes: true,
  isActive: true,
} satisfies Prisma.PortSelect

const containerTypeSelect = {
  id: true,
  code: true,
  name: true,
  teu: true,
  maxPayloadKg: true,
  internalVolumeCbm: true,
  isActive: true,
} satisfies Prisma.ContainerTypeSelect

export type PortRecord = Prisma.PortGetPayload<{ select: typeof portSelect }>
export type ContainerTypeRecord = Prisma.ContainerTypeGetPayload<{
  select: typeof containerTypeSelect
}>

export interface ListPortsParams {
  q?: string | undefined
  countryCode?: string | undefined
  mode?: Prisma.PortWhereInput['modes'] extends undefined ? never : PortMode
  includeInactive?: boolean
}

type PortMode = 'SEA_FCL' | 'SEA_LCL' | 'AIR' | 'ROAD' | 'RAIL' | 'MULTIMODAL'

export const logisticsReferenceRepository = {
  async listPorts(params: ListPortsParams = {}): Promise<PortRecord[]> {
    return prisma.port.findMany({
      where: {
        ...(params.includeInactive ? {} : { isActive: true }),
        ...(params.countryCode ? { countryCode: params.countryCode } : {}),
        ...(params.mode ? { modes: { has: params.mode } } : {}),
        ...(params.q
          ? {
              OR: [
                { name: { contains: params.q, mode: 'insensitive' } },
                { locode: { contains: params.q.toUpperCase() } },
              ],
            }
          : {}),
      },
      select: portSelect,
      orderBy: [{ countryCode: 'asc' }, { name: 'asc' }],
    })
  },

  async findPortByLocode(locode: string): Promise<PortRecord | null> {
    return prisma.port.findUnique({ where: { locode }, select: portSelect })
  },

  async listContainerTypes(
    params: { includeInactive?: boolean } = {},
  ): Promise<ContainerTypeRecord[]> {
    return prisma.containerType.findMany({
      where: params.includeInactive ? {} : { isActive: true },
      select: containerTypeSelect,
      orderBy: [{ teu: 'asc' }, { code: 'asc' }],
    })
  },
}

export type LogisticsReferenceRepository = typeof logisticsReferenceRepository
