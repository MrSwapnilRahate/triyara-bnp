import { createSupplierRegistrationService } from '@triyara/core'
import { organizationRepository, supplierRegistrationRepository } from '@triyara/db'
import { createStorageFromEnv } from '@triyara/storage'
import { MAX_FILE_SIZE } from '@triyara/validation'

import { eventBus } from './event-bus'

/**
 * The tenant public registrations land in.
 *
 * Configurable so a second Triyara entity, or a staging environment pointed at
 * production-like data, does not silently collect submissions into whichever
 * organization happened to be created first. Defaults to the seeded tenant so
 * a fresh checkout works without extra setup.
 */
const INTAKE_ORGANIZATION_SLUG = process.env.PUBLIC_REGISTRATION_ORG_SLUG ?? 'triyara'

export const supplierRegistrationService = createSupplierRegistrationService({
  repo: supplierRegistrationRepository,
  storage: createStorageFromEnv(),
  events: eventBus,
  organizations: organizationRepository,
  intakeOrganizationSlug: INTAKE_ORGANIZATION_SLUG,
  maxBytes: MAX_FILE_SIZE,
})
