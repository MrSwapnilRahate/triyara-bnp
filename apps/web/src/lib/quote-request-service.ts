import { createQuoteRequestService } from '@triyara/core'
import { organizationRepository, quoteRequestRepository } from '@triyara/db'

import { eventBus } from './event-bus'
import { rfqService } from './rfq-service'

// Public quote request intake wiring (TRY-BNP-QR-01). Repositories are injected
// here so route handlers depend only on services - never on Prisma.

/**
 * The tenant public enquiries land in.
 *
 * The SAME variable the buyer and supplier registration forms read. All three
 * are the public face of one company, and letting them drift to different
 * tenants would split the intake queue in a way nobody would notice until an
 * enquiry went missing.
 */
const INTAKE_ORGANIZATION_SLUG = process.env.PUBLIC_REGISTRATION_ORG_SLUG ?? 'triyara'

export const quoteRequestService = createQuoteRequestService({
  repo: quoteRequestRepository,
  events: eventBus,
  organizations: organizationRepository,
  intakeOrganizationSlug: INTAKE_ORGANIZATION_SLUG,
  // The real RFQ service, so a promoted enquiry goes through exactly the same
  // validation, tenant checks and audit trail as an RFQ raised by hand.
  rfqs: rfqService,
})
