import { createAdminUsersService } from '@triyara/core'
import { userRepository } from '@triyara/db'

// User administration wiring (TRY-BNP-ADMIN-02). The repository is injected
// here so the route handler depends only on the service - never on Prisma.

export const adminUsersService = createAdminUsersService({ users: userRepository })
