import { hashPassword } from '@triyara/auth'
import { createExternalProvisioningService } from '@triyara/core'
import { accountRepository, userRepository } from '@triyara/db'

import { eventBus } from './event-bus'

// External portal provisioning wiring (TRY-BNP-EXT-PROVISION). Repositories are
// injected here so the route handler depends only on the service - never on
// Prisma - matching how admin user administration is wired.
//
// `hashPassword` is injected rather than imported inside the service so core
// stays free of bcrypt, exactly as the staff invite does.

export const externalProvisioningService = createExternalProvisioningService({
  accounts: accountRepository,
  users: userRepository,
  events: eventBus,
  hashPassword,
})
