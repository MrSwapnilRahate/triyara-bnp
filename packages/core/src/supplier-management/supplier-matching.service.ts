import { assertAbility, type AuthContext } from '@triyara/auth'
import type {
  HistoryResult,
  SupplierHistoryRepository,
  SupplierListResult,
  SupplierQuotationHistoryItem,
  SupplierRfqHistoryItem,
  SupplierScoreRepository,
} from '@triyara/db'
import type { ListSuppliersQuery, SupplierHistoryQuery } from '@triyara/validation'

import { scoreSupplier, type SupplierScore } from './supplier-score'

// Supplier intelligence & matching (TRY-BNP-SUPPLIER-MATCH).
//
// Reads only. Every write in this area already has a home — this service adds
// no way to change a supplier, and deliberately so: a shortlist screen that can
// also edit records is one mis-click from altering the data it is meant to be
// judging.
//
// Search itself is NOT reimplemented here. `supplierMasterService.list` already
// filters, sorts and pages suppliers; this composes scores onto whatever that
// returns rather than issuing a second, subtly different query that would drift
// from it.

export type MatchingCtx = AuthContext & { requestId?: string }

export interface MatchingDeps {
  /** The existing supplier search, composed with — never replaced. */
  search: (ctx: MatchingCtx, query: ListSuppliersQuery) => Promise<SupplierListResult>
  scores: SupplierScoreRepository
  history: SupplierHistoryRepository
}

export interface ScoredSupplierListResult extends SupplierListResult {
  scores: SupplierScore[]
}

export function createSupplierMatchingService({ search, scores, history }: MatchingDeps) {
  return {
    /**
     * A shortlist: the existing search, with a score against each row.
     *
     * Scores are returned ALONGSIDE the items rather than merged into them, so
     * the supplier shape stays exactly what every other screen receives. A list
     * item that grew an extra field only on this endpoint would be the kind of
     * difference nobody notices until something else breaks on it.
     */
    async shortlist(
      ctx: MatchingCtx,
      query: ListSuppliersQuery,
    ): Promise<ScoredSupplierListResult> {
      assertAbility(ctx, 'read', 'SupplierProfile')

      const page = await search(ctx, query)
      if (page.items.length === 0) return { ...page, scores: [] }

      const signals = await scores.collectScoreSignals(
        ctx.organizationId,
        page.items.map((s) => s.id),
      )

      return {
        ...page,
        scores: page.items
          .map((item) => signals.get(item.id))
          .filter((s): s is NonNullable<typeof s> => s !== undefined)
          .map(scoreSupplier),
      }
    },

    /** One supplier's score, for the detail drawer. */
    async score(ctx: MatchingCtx, supplierId: string): Promise<SupplierScore | null> {
      assertAbility(ctx, 'read', 'SupplierProfile')
      await history.assertVisible(ctx.organizationId, supplierId)

      const signals = await scores.collectScoreSignals(ctx.organizationId, [supplierId])
      const found = signals.get(supplierId)
      return found ? scoreSupplier(found) : null
    },

    async rfqs(
      ctx: MatchingCtx,
      supplierId: string,
      query: SupplierHistoryQuery,
    ): Promise<HistoryResult<SupplierRfqHistoryItem>> {
      assertAbility(ctx, 'read', 'SupplierProfile')
      // Visibility first: a supplier the caller cannot see must look absent,
      // not merely empty of history.
      await history.assertVisible(ctx.organizationId, supplierId)
      return history.rfqs({
        organizationId: ctx.organizationId,
        supplierId,
        limit: query.limit,
        cursor: query.cursor,
      })
    },

    async quotations(
      ctx: MatchingCtx,
      supplierId: string,
      query: SupplierHistoryQuery,
    ): Promise<HistoryResult<SupplierQuotationHistoryItem>> {
      assertAbility(ctx, 'read', 'SupplierProfile')
      await history.assertVisible(ctx.organizationId, supplierId)
      return history.quotations({
        organizationId: ctx.organizationId,
        supplierId,
        limit: query.limit,
        cursor: query.cursor,
      })
    },
  }
}

export type SupplierMatchingService = ReturnType<typeof createSupplierMatchingService>
