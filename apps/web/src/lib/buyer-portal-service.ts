import { createBuyerPortalService } from '@triyara/core'
import {
  documentRepository,
  quotationRepository,
  quoteRequestRepository,
  rfqRepository,
  userRepository,
} from '@triyara/db'

// Buyer portal wiring (TRY-BNP-PORTAL-RFQ). The repositories are injected here
// so the page depends only on the service - never on Prisma - matching how the
// portal context, account and admin-user services are wired.
//
// Every buyer-scoped query takes organization and account as required arguments
// and writes both into the WHERE unconditionally, which is what keeps a portal
// read inside one account.
//
// `quoteRequestRepository` arrives as `intake`, and the name is the contract: the
// portal reaches the enquiry table and never the RFQ service. A buyer submits a
// requirement; whether it becomes an RFQ is the trade desk's decision, and that
// separation is what keeps TRIYARA between the buyer and the supplier network.

export const buyerPortalService = createBuyerPortalService({
  contacts: userRepository,
  documents: documentRepository,
  intake: quoteRequestRepository,
  quotations: quotationRepository,
  rfqs: rfqRepository,
})
