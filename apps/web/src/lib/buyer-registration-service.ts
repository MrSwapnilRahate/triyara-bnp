import { createBuyerRegistrationService } from '@triyara/core'
import { buyerRegistrationRepository, organizationRepository } from '@triyara/db'
import { createStorageFromEnv } from '@triyara/storage'
import { MAX_FILE_SIZE } from '@triyara/validation'

import { eventBus } from './event-bus'

/**
 * The tenant public buyer enquiries land in.
 *
 * The SAME variable the supplier portal reads, deliberately: both forms are the
 * public face of one company, and letting them drift to different tenants would
 * split the intake queue in a way nobody would notice until an enquiry went
 * missing.
 */
const INTAKE_ORGANIZATION_SLUG = process.env.PUBLIC_REGISTRATION_ORG_SLUG ?? 'triyara'

export const buyerRegistrationService = createBuyerRegistrationService({
  repo: buyerRegistrationRepository,
  storage: createStorageFromEnv(),
  events: eventBus,
  organizations: organizationRepository,
  intakeOrganizationSlug: INTAKE_ORGANIZATION_SLUG,
  maxBytes: MAX_FILE_SIZE,
})
