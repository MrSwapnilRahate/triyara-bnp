import { hashPassword } from '@triyara/auth'
import { createAdminUsersService } from '@triyara/core'
import { userRepository } from '@triyara/db'

import { eventBus } from './event-bus'

// User administration wiring (TRY-BNP-ADMIN-02). The repository is injected
// here so the route handler depends only on the service - never on Prisma.
//
// `hashPassword` is injected rather than imported inside the service so core
// stays free of bcrypt, matching how authentication already hashes.

export const adminUsersService = createAdminUsersService({
  users: userRepository,
  events: eventBus,
  hashPassword,
})
