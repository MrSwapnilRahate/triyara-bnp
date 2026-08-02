import { randomUUID } from 'node:crypto'

import { NotFoundError, PreconditionFailedError } from '@triyara/lib'
import { beforeAll, describe, expect, it } from 'vitest'

import { prisma } from '../client'
import { buyerRegistrationRepository } from './buyer-registration.repository'

// Public buyer registration (TRY-BNP-BUYER-REG) against a real database.
//
// Fixtures are namespaced to this file: vitest runs files in parallel and
// `upsert` is select-then-insert, so a shared organization slug races on a cold
// database.
describe.skipIf(!process.env.DATABASE_URL)('buyer registration (integration)', () => {
  let organizationId = ''
  let otherOrgId = ''
  let ctx = { actorId: 'system:public-registration', organizationId: '', requestId: 'buyer-it' }
  let reviewerCtx = { actorId: '', organizationId: '', requestId: 'buyer-it' }

  const uniq = () => randomUUID().replace(/-/g, '').slice(0, 10)

  const baseData = () => ({
    company: {
      companyName: 'Gulf Spice Trading LLC',
      businessType: 'IMPORTER' as const,
      country: 'AE',
      city: 'Dubai',
    },
    contact: { name: 'Fatima Al Mansouri', phone: '+971 50 123 4567' },
    logistics: {
      destinationCountries: ['AE', 'SA'],
      destinationPort: 'Jebel Ali',
      incoterms: ['CIF'],
      paymentTerms: ['LC at sight'],
      certificationsRequired: ['HALAL'],
      languages: ['English', 'Arabic'],
    },
    products: [] as never[],
    documents: [] as never[],
  })

  beforeAll(async () => {
    const org = await prisma.organization.upsert({
      where: { slug: 'buyer-itest' },
      update: {},
      create: { name: 'Buyer IT', slug: 'buyer-itest' },
    })
    organizationId = org.id
    ctx = { ...ctx, organizationId }

    const reviewer = await prisma.user.upsert({
      where: { email: 'buyer-it-reviewer@triyara.test' },
      update: {},
      create: {
        organizationId,
        email: 'buyer-it-reviewer@triyara.test',
        name: 'Reviewer',
        passwordHash: 'x',
      },
    })
    reviewerCtx = { actorId: reviewer.id, organizationId, requestId: 'buyer-it' }

    const other = await prisma.organization.upsert({
      where: { slug: 'buyer-itest-other' },
      update: {},
      create: { name: 'Buyer IT Other', slug: 'buyer-itest-other' },
    })
    otherOrgId = other.id
  })

  it('lands an enquiry in PENDING_REVIEW while it stays a PROSPECT', async () => {
    const result = await buyerRegistrationRepository.register(ctx, baseData())

    expect(result.registrationStatus).toBe('PENDING_REVIEW')
    expect(result.submittedAt).not.toBeNull()

    const stored = await prisma.account.findUniqueOrThrow({
      where: { id: result.id },
      select: {
        relationshipStatus: true,
        registrationStatus: true,
        isSelfRegistered: true,
        isVerified: true,
        source: true,
      },
    })
    // The two statuses answer different questions and must not be conflated: a
    // company nobody has checked is not yet a customer of any standing.
    expect(stored.relationshipStatus).toBe('PROSPECT')
    expect(stored.registrationStatus).toBe('PENDING_REVIEW')
    expect(stored.isSelfRegistered).toBe(true)
    expect(stored.isVerified).toBe(false)
    expect(stored.source).toBe('PUBLIC_REGISTRATION')
  })

  it('writes the profile, contact, approval and audit in one go', async () => {
    const result = await buyerRegistrationRepository.register(ctx, {
      ...baseData(),
      packaging: '25kg PP bags',
      annualRequirement: 'Approx 500 MT',
      notes: 'Repeat buyer for a UAE retail chain.',
      products: [
        { product: 'Turmeric fingers', targetVolume: '2 x 20ft', targetPrice: '$1800 CIF' },
        { product: 'Black pepper' },
      ] as never,
    })

    const profile = await prisma.buyerProfile.findUniqueOrThrow({
      where: { accountId: result.id },
      select: {
        id: true,
        destinationCountries: true,
        destinationPort: true,
        certificationsRequired: true,
        packaging: true,
        annualRequirement: true,
        description: true,
      },
    })
    expect(profile.destinationCountries).toEqual(['AE', 'SA'])
    expect(profile.destinationPort).toBe('Jebel Ali')
    expect(profile.packaging).toBe('25kg PP bags')
    expect(profile.description).toContain('UAE retail chain')

    const products = await prisma.buyerProduct.findMany({
      where: { buyerProfileId: profile.id },
      select: { product: true, targetPrice: true },
      orderBy: { product: 'asc' },
    })
    expect(products).toEqual([
      { product: 'Black pepper', targetPrice: null },
      { product: 'Turmeric fingers', targetPrice: '$1800 CIF' },
    ])

    const contacts = await prisma.buyerContact.findMany({
      where: { accountId: result.id },
      select: { name: true, isPrimary: true, email: true, phone: true },
    })
    expect(contacts).toEqual([
      {
        name: 'Fatima Al Mansouri',
        isPrimary: true,
        email: null,
        phone: '+971 50 123 4567',
      },
    ])

    const approvals = await prisma.buyerApproval.findMany({
      where: { accountId: result.id },
      select: { fromStatus: true, toStatus: true, decision: true },
    })
    expect(approvals).toEqual([
      { fromStatus: null, toStatus: 'PENDING_REVIEW', decision: 'SUBMITTED' },
    ])

    const audit = await prisma.auditLog.findMany({
      where: { entityType: 'Account', entityId: result.id },
      select: { action: true, actorId: true },
    })
    expect(audit).toEqual([
      { action: 'buyer.self_registered', actorId: 'system:public-registration' },
    ])
  })

  it('accepts a buyer reachable only on WhatsApp', async () => {
    const result = await buyerRegistrationRepository.register(ctx, {
      ...baseData(),
      contact: { name: 'Only WhatsApp', whatsapp: '+971 55 000 0000' },
    })
    const contact = await prisma.buyerContact.findFirstOrThrow({
      where: { accountId: result.id },
      select: { email: true, phone: true, whatsapp: true },
    })
    expect(contact.email).toBeNull()
    expect(contact.phone).toBeNull()
    expect(contact.whatsapp).toBe('+971 55 000 0000')
  })

  it('records an attached document with the size read from storage', async () => {
    const result = await buyerRegistrationRepository.register(ctx, {
      ...baseData(),
      documents: [
        {
          type: 'COMPANY_PROFILE',
          storageKey: `${organizationId}/buyer-registrations/${uniq()}/profile.pdf`,
          title: 'profile.pdf',
          mimeType: 'application/pdf',
          fileSize: 4242,
          checksum: 'abc123',
        },
      ] as never,
    })

    const documents = await prisma.document.findMany({
      where: { accountId: result.id },
      select: { type: true, currentFileSize: true, currentChecksum: true, status: true },
    })
    expect(documents).toEqual([
      {
        type: 'COMPANY_PROFILE',
        currentFileSize: 4242,
        currentChecksum: 'abc123',
        status: 'RECEIVED',
      },
    ])

    // The Document module keeps a version row per file; a document without one
    // cannot be superseded later.
    const versions = await prisma.documentVersion.findMany({
      where: { document: { accountId: result.id } },
      select: { versionNumber: true, fileSize: true },
    })
    expect(versions).toEqual([{ versionNumber: 1, fileSize: 4242 }])
  })

  it('rolls the whole enquiry back when any part of it fails', async () => {
    const before = await prisma.account.count({ where: { organizationId } })

    await expect(
      buyerRegistrationRepository.register(ctx, {
        ...baseData(),
        // A document type outside the enum fails at the database. Without one
        // transaction the account, profile and contact would already be
        // committed and a half-registered buyer left behind.
        documents: [{ type: 'NOT_A_REAL_TYPE', storageKey: 'k', fileSize: 1 }] as never,
      }),
    ).rejects.toThrow()

    expect(await prisma.account.count({ where: { organizationId } })).toBe(before)
  })

  it('approves an enquiry and verifies the buyer in the same step', async () => {
    const created = await buyerRegistrationRepository.register(ctx, baseData())
    const current = await buyerRegistrationRepository.findById(organizationId, created.id)

    const approved = await buyerRegistrationRepository.transition(
      reviewerCtx,
      created.id,
      current!.version,
      'APPROVED',
      'APPROVED',
      'Documents check out.',
    )

    expect(approved.registrationStatus).toBe('APPROVED')
    // "Convert into a verified buyer" is the same transition, not a second
    // action someone has to remember.
    expect(approved.isVerified).toBe(true)
    expect(approved.verifiedAt).not.toBeNull()
  })

  it('rejects an enquiry without verifying it', async () => {
    const created = await buyerRegistrationRepository.register(ctx, baseData())
    const current = await buyerRegistrationRepository.findById(organizationId, created.id)

    const rejected = await buyerRegistrationRepository.transition(
      reviewerCtx,
      created.id,
      current!.version,
      'REJECTED',
      'REJECTED',
      'No import licence.',
    )
    expect(rejected.registrationStatus).toBe('REJECTED')
    expect(rejected.isVerified).toBe(false)
    expect(rejected.verifiedAt).toBeNull()
  })

  it('preserves the full decision trail', async () => {
    const created = await buyerRegistrationRepository.register(ctx, baseData())
    const first = await buyerRegistrationRepository.findById(organizationId, created.id)
    const approved = await buyerRegistrationRepository.transition(
      reviewerCtx,
      created.id,
      first!.version,
      'APPROVED',
      'APPROVED',
      'Looks legitimate.',
    )
    await buyerRegistrationRepository.transition(
      reviewerCtx,
      created.id,
      approved.version,
      'BLOCKED',
      'BLOCKED',
      'Payment dispute.',
    )

    const history = await buyerRegistrationRepository.approvalHistory(organizationId, created.id)
    expect(history.map((h) => [h.fromStatus, h.toStatus, h.decision])).toEqual([
      [null, 'PENDING_REVIEW', 'SUBMITTED'],
      ['PENDING_REVIEW', 'APPROVED', 'APPROVED'],
      ['APPROVED', 'BLOCKED', 'BLOCKED'],
    ])
    expect(history[1]?.comments).toBe('Looks legitimate.')
    expect(history[1]?.reviewerId).toBe(reviewerCtx.actorId)
  })

  it('refuses a second reviewer working from a stale version', async () => {
    const created = await buyerRegistrationRepository.register(ctx, baseData())
    const current = await buyerRegistrationRepository.findById(organizationId, created.id)

    await buyerRegistrationRepository.transition(
      reviewerCtx,
      created.id,
      current!.version,
      'APPROVED',
      'APPROVED',
    )

    // The first reviewer's version is now behind; their decision must not land
    // on top of one already taken.
    await expect(
      buyerRegistrationRepository.transition(
        reviewerCtx,
        created.id,
        current!.version,
        'REJECTED',
        'REJECTED',
      ),
    ).rejects.toBeInstanceOf(PreconditionFailedError)

    const after = await buyerRegistrationRepository.findById(organizationId, created.id)
    expect(after!.registrationStatus).toBe('APPROVED')
  })

  it('treats an account in another organization as absent', async () => {
    const created = await buyerRegistrationRepository.register(ctx, baseData())

    expect(await buyerRegistrationRepository.findById(otherOrgId, created.id)).toBeNull()
    await expect(
      buyerRegistrationRepository.transition(
        { ...reviewerCtx, organizationId: otherOrgId },
        created.id,
        1,
        'APPROVED',
        'APPROVED',
      ),
    ).rejects.toBeInstanceOf(NotFoundError)
  })

  it('leaves accounts keyed in by the team out of the review queue', async () => {
    // The default is APPROVED precisely so deploying this does not drop the
    // existing customer base into a queue nobody asked for.
    const staffEntered = await prisma.account.create({
      data: {
        organizationId,
        legalName: 'Keyed In By Staff Ltd',
        createdById: reviewerCtx.actorId,
        updatedById: reviewerCtx.actorId,
      },
      select: { registrationStatus: true, isSelfRegistered: true },
    })
    expect(staffEntered.registrationStatus).toBe('APPROVED')
    expect(staffEntered.isSelfRegistered).toBe(false)
  })
})
