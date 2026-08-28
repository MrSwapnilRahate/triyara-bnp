import { randomUUID } from 'node:crypto'

import { buildAbilityFor } from '../../packages/auth/src/abilities'
import { hashPassword } from '../../packages/auth/src/password'
import { createExternalProvisioningService } from '../../packages/core/src/account/external-provisioning.service'
import { prisma } from '../../packages/db/src/client'
import { accountRepository } from '../../packages/db/src/repositories/account.repository'
import { userRepository } from '../../packages/db/src/repositories/user.repository'

/**
 * The prerequisites a buyer needs before they can reach the portal at all.
 *
 * None of this is creatable through the public UI, and that is the product
 * working as designed rather than a gap in it: public registration produces a
 * PENDING lead for a human to review, and an approved Account with a
 * BuyerProfile is the outcome of that review. A test that waited for staff to
 * click Approve would never run.
 *
 * So the setup below builds what staff would have built, and stops there. The
 * portal user itself goes through `externalProvisioningService.provision` -
 * the real service, with a real ADMIN ability set - so the approval gate, the
 * duplicate-email rules and the invitation invariants are all exercised rather
 * than sidestepped. From the invitation token onward every step belongs to the
 * browser: the password is chosen at `/reset-password`, the session is created
 * at `/login`, and nothing here logs anybody in.
 *
 * The plaintext token is returned by `provision` once and never stored. It is
 * passed straight into the URL a test navigates to, and is never logged, never
 * written to a file, and never put in a test title.
 */

/** Matches the seed, which is the only organization these tests use. */
const ORGANIZATION_SLUG = 'triyara'

export interface BuyerFixture {
  readonly label: string
  readonly accountId: string
  readonly companyName: string
  readonly email: string
  /** Chosen at `/reset-password` by the test, not set here. */
  readonly password: string
  /** Single-use. Consumed the first time the reset form succeeds. */
  readonly inviteToken: string
  readonly rfqNumber: string
  readonly rfqTitle: string
  readonly quotationNumber: string
  readonly documentTitle: string
}

/** An ADMIN context, built from the seeded administrator. */
async function adminContext(organizationId: string) {
  const admin = await prisma.user.findFirstOrThrow({
    where: { organizationId, roles: { some: { role: { name: 'ADMIN' } } } },
  })

  return {
    user: {
      id: admin.id,
      organizationId,
      email: admin.email,
      name: admin.name,
      roles: ['ADMIN' as const],
      accountId: null,
    },
    organizationId,
    accountId: null,
    // The real ability set. `provision` asserts `manage User` and
    // `manage Account`, and this is what has to satisfy them - so the
    // authorization the endpoint performs is genuinely exercised.
    ability: buildAbilityFor(['ADMIN']),
    requestId: 'e2e-buyer-fixture',
  }
}

/** A no-op bus. Notifications are somebody else's suite. */
const silentEvents = { emit: async () => undefined } as never

/**
 * Builds one approved buyer with data of its own, and provisions their login.
 *
 * `label` is woven into every identifier so two buyers in the same run are
 * distinguishable on screen - which is what makes the isolation assertions
 * readable rather than a comparison of two opaque cuids.
 */
export async function createBuyerFixture(label: string): Promise<BuyerFixture> {
  const stamp = `${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`
  const suffix = `${label}-${stamp}`

  const organization = await prisma.organization.findFirstOrThrow({
    where: { slug: ORGANIZATION_SLUG },
  })
  const organizationId = organization.id
  const ctx = await adminContext(organizationId)
  const actorId = ctx.user.id

  // Approved, because `provision` refuses anything else - and that refusal is
  // itself asserted by a test below.
  const account = await prisma.account.create({
    data: {
      organizationId,
      legalName: `UI Audit ${suffix} Trading LLC`,
      displayName: `UI Audit ${suffix}`,
      country: 'AE',
      registrationStatus: 'APPROVED',
      createdById: actorId,
      updatedById: actorId,
    },
  })
  await prisma.buyerProfile.create({
    data: { accountId: account.id, organizationId, createdById: actorId, updatedById: actorId },
  })

  // One requirement, one offer, one document - the three portal surfaces that
  // read existing data. Named with the label so a leak across accounts is
  // visible in the assertion message.
  const rfqNumber = `RFQ-UIAUDIT-${suffix.toUpperCase()}`
  const rfqTitle = `${label} sona masoori rice`
  const rfq = await prisma.rFQ.create({
    data: {
      organizationId,
      rfqNumber,
      type: 'BUYER',
      buyerId: account.id,
      title: rfqTitle,
      status: 'ISSUED',
      priority: 'NORMAL',
      currency: 'USD',
      destinationCountry: 'AE',
      destinationPort: 'Jebel Ali',
      createdById: actorId,
    },
  })
  await prisma.rFQItem.create({
    data: {
      rfqId: rfq.id,
      organizationId,
      lineNumber: 1,
      customProductName: `${label} unpolished rice`,
      quantity: 25,
      unit: 'MT',
      requiredCertifications: [],
    },
  })

  // SENT, and with `sentAt` set: the buyer list filters on the visible statuses
  // and orders by that column.
  const quotationNumber = `QT-UIAUDIT-${suffix.toUpperCase()}`
  const quotation = await prisma.quotation.create({
    data: {
      organizationId,
      quotationNumber,
      buyerId: account.id,
      primaryRfqId: rfq.id,
      status: 'SENT',
      sentAt: new Date(),
      currency: 'USD',
      baseCurrency: 'USD',
      createdById: actorId,
    },
  })
  await prisma.quotationItem.create({
    data: {
      quotationId: quotation.id,
      organizationId,
      lineNumber: 1,
      customProductName: `${label} unpolished rice`,
      quantity: 25,
      unit: 'MT',
      unitPrice: 440,
      lineSubtotal: 11000,
      lineTotal: 11000,
    },
  })

  const documentTitle = `UI Audit ${suffix} GST certificate`
  await prisma.document.create({
    data: {
      organizationId,
      accountId: account.id,
      type: 'GST',
      status: 'RECEIVED',
      title: documentTitle,
      currentFileVersion: 1,
      currentStorageKey: `${organizationId}/${account.id}/${stamp}/gst.pdf`,
      currentMimeType: 'application/pdf',
      currentOriginalFilename: 'gst-certificate.pdf',
      currentFileSize: 248_512,
      currentChecksum: `sha256-${stamp}`,
      createdById: actorId,
      updatedById: actorId,
    },
  })

  // The real service, with the real ability check.
  const provisioning = createExternalProvisioningService({
    accounts: accountRepository,
    users: userRepository,
    events: silentEvents,
    hashPassword,
  })
  const email = `ui-audit-${label}-${stamp}@example.com`.toLowerCase()
  const outcome = await provisioning.provision(ctx as never, account.id, {
    name: `UI Audit ${label} Contact`,
    email,
  })
  if (outcome.status !== 'provisioned') {
    throw new Error(`Expected a provisioned portal user, got "${outcome.status}".`)
  }

  return {
    label,
    accountId: account.id,
    companyName: `UI Audit ${suffix}`,
    email,
    // Chosen by the test at /reset-password. Long enough for the 8-character
    // rule, and distinct per fixture.
    password: `UiAudit!${stamp}`,
    inviteToken: outcome.token,
    rfqNumber,
    rfqTitle,
    quotationNumber,
    documentTitle,
  }
}

/**
 * An approved account with no portal user, for the refusal tests.
 *
 * Returns the account id and a provisioning function, so a test can assert what
 * the real service does rather than what a comment claims it does.
 */
export async function createAccountForProvisioning(
  registrationStatus: 'APPROVED' | 'PENDING_REVIEW',
) {
  const stamp = `${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`
  const organization = await prisma.organization.findFirstOrThrow({
    where: { slug: ORGANIZATION_SLUG },
  })
  const ctx = await adminContext(organization.id)

  const account = await prisma.account.create({
    data: {
      organizationId: organization.id,
      legalName: `UI Audit ${registrationStatus} ${stamp} LLC`,
      registrationStatus,
      createdById: ctx.user.id,
      updatedById: ctx.user.id,
    },
  })

  const provisioning = createExternalProvisioningService({
    accounts: accountRepository,
    users: userRepository,
    events: silentEvents,
    hashPassword,
  })

  return {
    accountId: account.id,
    stamp,
    provision: (email: string) =>
      provisioning.provision(ctx as never, account.id, {
        name: `UI Audit ${registrationStatus} Contact`,
        email,
      }),
  }
}

export async function disconnectFixtures(): Promise<void> {
  await prisma.$disconnect()
}
