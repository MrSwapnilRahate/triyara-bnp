import { createQuotationService } from '@triyara/core'
import {
  quotationReferenceRepository,
  quotationRepository,
  quotationSourcingRepository,
} from '@triyara/db'

import { eventBus } from './event-bus'

// Quotation REST API wiring (TRY-BNP-QUOTE-API). Repositories are injected here
// so route handlers depend only on services - never on Prisma.
//
// approvalThreshold and minMarginPercent are left at the service defaults: they
// are commercial policy, and hard-coding a different figure at the API boundary
// would put policy in the wrong layer.

export const quotationService = createQuotationService({
  repo: quotationRepository,
  sourcing: quotationSourcingRepository,
  reference: quotationReferenceRepository,
  events: eventBus,
})
