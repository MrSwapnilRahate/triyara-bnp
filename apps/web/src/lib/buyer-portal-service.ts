import { createBuyerPortalService } from '@triyara/core'
import { quotationRepository, rfqRepository } from '@triyara/db'

// Buyer portal read wiring (TRY-BNP-PORTAL-RFQ). The repository is injected here
// so the page depends only on the service - never on Prisma - matching how the
// portal context, account and admin-user services are wired.
//
// `listForBuyer` takes organization and buyer as required arguments and writes
// both into the query unconditionally, which is what keeps a portal read inside
// one account.

export const buyerPortalService = createBuyerPortalService({
  quotations: quotationRepository,
  rfqs: rfqRepository,
})
