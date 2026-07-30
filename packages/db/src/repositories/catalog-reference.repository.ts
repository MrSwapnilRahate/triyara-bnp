import type { Prisma } from '@prisma/client'

import { prisma } from '../client'
import { decodeCursor, encodeCursor } from './account.repository'

// Read-only catalog master data (TRY-BNP-CATALOG-S1): specification definitions
// and tags. Exposed so route handlers never touch Prisma directly.

const definitionSelect = {
  id: true,
  organizationId: true,
  name: true,
  slug: true,
  unit: true,
  dataType: true,
  allowedValues: true,
  isFilterable: true,
  isRequired: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ProductSpecificationDefinitionSelect

const tagSelect = {
  id: true,
  organizationId: true,
  name: true,
  slug: true,
  description: true,
  color: true,
  sortOrder: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TagSelect

export type SpecificationDefinitionRecord = Prisma.ProductSpecificationDefinitionGetPayload<{
  select: typeof definitionSelect
}>
export type TagRecord = Prisma.TagGetPayload<{ select: typeof tagSelect }>

interface ListReferenceParams {
  organizationId: string
  q?: string
  limit: number
  cursor?: string
}

export interface ListDefinitionsParams extends ListReferenceParams {
  isFilterable?: boolean
}

export interface ListTagsParams extends ListReferenceParams {
  isActive?: boolean
}

function page<T extends { id: string }>(rows: T[], limit: number) {
  const items = rows.slice(0, limit)
  const nextCursor = rows.length > limit ? encodeCursor(items[items.length - 1]!.id) : null
  return { items, nextCursor }
}

export const catalogReferenceRepository = {
  async listSpecificationDefinitions(params: ListDefinitionsParams) {
    const rows = await prisma.productSpecificationDefinition.findMany({
      where: {
        organizationId: params.organizationId,
        deletedAt: null,
        ...(params.isFilterable === undefined ? {} : { isFilterable: params.isFilterable }),
        ...(params.q ? { name: { contains: params.q, mode: 'insensitive' } } : {}),
      },
      select: definitionSelect,
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      take: params.limit + 1,
      ...(params.cursor ? { cursor: { id: decodeCursor(params.cursor) }, skip: 1 } : {}),
    })
    return page(rows, params.limit)
  },

  async listTags(params: ListTagsParams) {
    const rows = await prisma.tag.findMany({
      where: {
        organizationId: params.organizationId,
        deletedAt: null,
        ...(params.isActive === undefined ? {} : { isActive: params.isActive }),
        ...(params.q ? { name: { contains: params.q, mode: 'insensitive' } } : {}),
      },
      select: tagSelect,
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      take: params.limit + 1,
      ...(params.cursor ? { cursor: { id: decodeCursor(params.cursor) }, skip: 1 } : {}),
    })
    return page(rows, params.limit)
  },
}

export type CatalogReferenceRepository = typeof catalogReferenceRepository
