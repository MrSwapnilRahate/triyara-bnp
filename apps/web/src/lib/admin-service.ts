import { createAdminService } from '@triyara/core'
import {
  auditRepository,
  dashboardRepository,
  organizationRepository,
  userRepository,
} from '@triyara/db'

// Administration wiring (TRY-BNP-ADMIN-01). Repositories are injected here so
// route handlers depend only on the service - never on Prisma.

export const adminService = createAdminService({
  audit: auditRepository,
  organizations: organizationRepository,
  users: userRepository,
  dashboard: dashboardRepository,
})
