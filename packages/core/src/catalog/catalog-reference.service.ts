import { assertAbility, type AuthContext } from '@triyara/auth'
import type { CatalogReferenceRepository } from '@triyara/db'
import type { ListSpecificationsQuery, ListTagsQuery } from '@triyara/validation'

// Read-only catalog master data. Authorized as `ReferenceData`, which every role
// may read under the frozen ability model.

export type CatalogReferenceCtx = AuthContext & { requestId?: string }

export interface CatalogReferenceDeps {
  repo: CatalogReferenceRepository
}

export function createCatalogReferenceService({ repo }: CatalogReferenceDeps) {
  return {
    async listSpecifications(ctx: CatalogReferenceCtx, query: ListSpecificationsQuery) {
      assertAbility(ctx, 'read', 'ReferenceData')
      return repo.listSpecificationDefinitions({
        organizationId: ctx.organizationId,
        q: query.q,
        isFilterable: query.isFilterable === undefined ? undefined : query.isFilterable === 'true',
        limit: query.limit,
        cursor: query.cursor,
      })
    },

    async listTags(ctx: CatalogReferenceCtx, query: ListTagsQuery) {
      assertAbility(ctx, 'read', 'ReferenceData')
      return repo.listTags({
        organizationId: ctx.organizationId,
        q: query.q,
        isActive: query.isActive === undefined ? undefined : query.isActive === 'true',
        limit: query.limit,
        cursor: query.cursor,
      })
    },
  }
}

export type CatalogReferenceService = ReturnType<typeof createCatalogReferenceService>
