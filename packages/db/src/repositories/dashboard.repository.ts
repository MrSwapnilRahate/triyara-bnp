import { prisma } from '../client'

/**
 * Dashboard counts (TRY-BNP-ADMIN-01).
 *
 * These exist because the list endpoints deliberately cannot answer them.
 * Cursor pagination returns a page and a forward cursor, never a total - that
 * is what keeps paging cheap on a growing table - so "how many RFQs are open"
 * has no answer in the list API and cannot be derived from one client-side
 * without walking every page.
 *
 * Counts only. No records are returned here: the dashboard's lists come from
 * the real list endpoints, so a row on the dashboard and the same row on its
 * module screen can never disagree about its own contents.
 */

export interface DashboardSummary {
  rfqs: { total: number; draft: number; pendingApproval: number; issued: number; awarded: number }
  quotations: {
    total: number
    draft: number
    pendingApproval: number
    sent: number
    accepted: number
    expired: number
  }
  suppliers: { total: number; approved: number; pendingReview: number }
  products: { total: number; active: number }
  /** What is waiting on a decision right now, across both sourcing modules. */
  pendingApprovals: number
}

export const dashboardRepository = {
  async summary(organizationId: string): Promise<DashboardSummary> {
    const live = { organizationId, deletedAt: null }

    // One round trip. Counting sequentially would make the dashboard's cost the
    // sum of eleven queries rather than the slowest of them.
    const [
      rfqTotal,
      rfqDraft,
      rfqPending,
      rfqIssued,
      rfqAwarded,
      quoteTotal,
      quoteDraft,
      quotePending,
      quoteSent,
      quoteAccepted,
      quoteExpired,
      supplierTotal,
      supplierApproved,
      supplierPending,
      productTotal,
      productActive,
    ] = await prisma.$transaction([
      prisma.rFQ.count({ where: live }),
      prisma.rFQ.count({ where: { ...live, status: 'DRAFT' } }),
      prisma.rFQ.count({ where: { ...live, status: 'PENDING_APPROVAL' } }),
      prisma.rFQ.count({ where: { ...live, status: 'ISSUED' } }),
      prisma.rFQ.count({ where: { ...live, status: 'AWARDED' } }),
      prisma.quotation.count({ where: live }),
      prisma.quotation.count({ where: { ...live, status: 'DRAFT' } }),
      prisma.quotation.count({ where: { ...live, status: 'PENDING_APPROVAL' } }),
      prisma.quotation.count({ where: { ...live, status: 'SENT' } }),
      prisma.quotation.count({ where: { ...live, status: 'ACCEPTED' } }),
      prisma.quotation.count({ where: { ...live, status: 'EXPIRED' } }),
      prisma.supplier.count({ where: live }),
      prisma.supplier.count({ where: { ...live, status: 'APPROVED' } }),
      prisma.supplier.count({ where: { ...live, status: 'PENDING_REVIEW' } }),
      prisma.product.count({ where: live }),
      prisma.product.count({ where: { ...live, status: 'ACTIVE' } }),
    ])

    return {
      rfqs: {
        total: rfqTotal,
        draft: rfqDraft,
        pendingApproval: rfqPending,
        issued: rfqIssued,
        awarded: rfqAwarded,
      },
      quotations: {
        total: quoteTotal,
        draft: quoteDraft,
        pendingApproval: quotePending,
        sent: quoteSent,
        accepted: quoteAccepted,
        expired: quoteExpired,
      },
      suppliers: {
        total: supplierTotal,
        approved: supplierApproved,
        pendingReview: supplierPending,
      },
      products: { total: productTotal, active: productActive },
      pendingApprovals: rfqPending + quotePending,
    }
  },
}

export type DashboardRepository = typeof dashboardRepository
