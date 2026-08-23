import { createPortalContextService } from '@triyara/core'
import { accountRepository, buyerProfileRepository, supplierProfileRepository } from '@triyara/db'

// External portal context wiring (TRY-BNP-PORTAL-CTX). Repositories are injected
// here so the page depends only on the service - never on Prisma - matching how
// account, admin-users and external provisioning are wired.
//
// All three lookups take `organizationId` as their first argument and put it in
// the query, which is what keeps a portal session inside its own tenant.

export const portalContextService = createPortalContextService({
  accounts: accountRepository,
  buyerProfiles: buyerProfileRepository,
  supplierProfiles: supplierProfileRepository,
})
