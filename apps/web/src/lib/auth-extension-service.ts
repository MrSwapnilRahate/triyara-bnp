import {
  createEmailVerificationService,
  createLoginAuditService,
  createPermissionService,
  createScopedRoleService,
  createSessionService,
} from '@triyara/core'
import {
  loginAttemptRepository,
  roleRepository,
  scopedRoleRepository,
  sessionRepository,
  userRepository,
  userSecurityRepository,
} from '@triyara/db'

import { eventBus } from './event-bus'

// Auth extension wiring (TRY-BNP-AUTH-02). Repositories are injected here so the
// services stay unit-testable with fakes.

export const emailVerificationService = createEmailVerificationService({
  repo: userSecurityRepository,
  users: userRepository,
  events: eventBus,
})

export const sessionService = createSessionService({
  repo: sessionRepository,
  events: eventBus,
})

export const scopedRoleService = createScopedRoleService({
  repo: scopedRoleRepository,
  roles: roleRepository,
  users: userRepository,
  events: eventBus,
})

export const permissionService = createPermissionService({
  scopedRoles: scopedRoleRepository,
})

export const loginAuditService = createLoginAuditService({
  attempts: loginAttemptRepository,
  security: userSecurityRepository,
})
