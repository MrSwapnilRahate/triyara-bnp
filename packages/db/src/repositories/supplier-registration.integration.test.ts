import { randomUUID } from 'node:crypto'

import { beforeAll, describe, expect, it } from 'vitest'

import { prisma } from '../client'
import { supplierRegistrationRepository } from './supplier-registration.repository'

// Public supplier registration (TRY-BNP-SUPPLIER-REG) against a real database.
//
// Fixtures are namespaced to this file: vitest runs files in parallel and
// `upsert` is select-then-insert, so a shared organization slug races on a cold
// database.
describe.skipIf(!process.env.DATABASE_URL)('supplier registration (integration)', () => {
  let organizationId = ''
  let otherOrgId = ''
  let ctx = { actorId: 'system:public-registration', organizationId: '', requestId: 'reg-it' }
  let productId = ''
  let foreignProductId = ''

  const uniq = () => randomUUID().replace(/-/g, '').slice(0, 10)

  const baseData = () => ({
    company: {
      companyName: 'Kerala Spice Exports',
      legalName: 'Kerala Spice Exports Pvt Ltd',
      businessType: 'MANUFACTURER_EXPORTER' as const,
      country: 'IN',
      city: 'Kochi',
    },
    contact: { name: 'Priya Raman', whatsapp: '+91 98470 11111' },
    business: {
      exportCountries: ['AE', 'US'],
      shippingPorts: ['Cochin'],
      languages: ['English'],
    },
    productIds: [] as string[],
    proposedProducts: [] as string[],
    claimedCertifications: [] as never[],
    documents: [] as never[],
  })

  beforeAll(async () => {
    const org = await prisma.organization.upsert({
      where: { slug: 'reg-itest' },
      update: {},
      create: { name: 'Reg IT', slug: 'reg-itest' },
    })
    organizationId = org.id
    ctx = { ...ctx, organizationId }

    const other = await prisma.organization.upsert({
      where: { slug: 'reg-itest-other' },
      update: {},
      create: { name: 'Reg IT Other', slug: 'reg-itest-other' },
    })
    otherOrgId = other.id

    async function makeProduct(orgId: string, slugPart: string) {
      const category = await prisma.category.upsert({
        where: { organizationId_slug: { organizationId: orgId, slug: `reg-cat-${slugPart}` } },
        update: {},
        create: {
          organizationId: orgId,
          name: 'Reg Cat',
          slug: `reg-cat-${slugPart}`,
          path: `/reg-cat-${slugPart}`,
          depth: 0,
        },
      })
      const product = await prisma.product.create({
        data: {
          organizationId: orgId,
          categoryId: category.id,
          sku: `P-${uniq()}`,
          name: 'Turmeric',
          slug: `turmeric-${uniq()}`,
        },
      })
      return product.id
    }

    productId = await makeProduct(organizationId, 'own')
    foreignProductId = await makeProduct(otherOrgId, 'other')
  })

  it('lands a registration in PENDING_REVIEW, marked as self-registered', async () => {
    const result = await supplierRegistrationRepository.register(ctx, baseData())

    expect(result.status).toBe('PENDING_REVIEW')
    expect(result.submittedAt).not.toBeNull()
    // DRAFT would mean we are waiting on the supplier. They have finished.
    expect(result.status).not.toBe('DRAFT')

    const stored = await prisma.supplier.findUniqueOrThrow({
      where: { id: result.id },
      select: {
        isSelfRegistered: true,
        organizationId: true,
        exportCountries: true,
        shippingPorts: true,
      },
    })
    expect(stored.isSelfRegistered).toBe(true)
    expect(stored.organizationId).toBe(organizationId)
    expect(stored.exportCountries).toEqual(['AE', 'US'])
  })

  it('generates a tenant-unique reference the registrant never supplies', async () => {
    const a = await supplierRegistrationRepository.register(ctx, baseData())
    const b = await supplierRegistrationRepository.register(ctx, baseData())

    expect(a.supplierCode).toMatch(/^REG-[A-F0-9]{10}$/)
    expect(a.supplierCode).not.toBe(b.supplierCode)
  })

  it('writes the contact, the approval history and the audit row in one go', async () => {
    const result = await supplierRegistrationRepository.register(ctx, {
      ...baseData(),
      notes: 'Met at the Kochi spice fair.',
    })

    const contacts = await prisma.supplierContact.findMany({
      where: { supplierId: result.id },
      select: { name: true, isPrimary: true, whatsapp: true, email: true },
    })
    expect(contacts).toHaveLength(1)
    expect(contacts[0]).toMatchObject({ name: 'Priya Raman', isPrimary: true, email: null })

    const approvals = await prisma.supplierApproval.findMany({
      where: { supplierId: result.id },
      select: { fromStatus: true, toStatus: true, decision: true },
    })
    expect(approvals).toEqual([
      { fromStatus: null, toStatus: 'PENDING_REVIEW', decision: 'SUBMITTED' },
    ])

    const notes = await prisma.supplierNote.findMany({ where: { supplierId: result.id } })
    expect(notes[0]?.body).toContain('Kochi spice fair')

    const audit = await prisma.auditLog.findMany({
      where: { entityType: 'Supplier', entityId: result.id },
      select: { action: true, actorId: true },
    })
    expect(audit).toEqual([
      { action: 'supplier.self_registered', actorId: 'system:public-registration' },
    ])
  })

  it('accepts a supplier reachable only on WhatsApp', async () => {
    // The case the whole feature exists for: plenty of suppliers here have no
    // working email address, and requiring one would lose them.
    const result = await supplierRegistrationRepository.register(ctx, {
      ...baseData(),
      contact: { name: 'Only WhatsApp', whatsapp: '+91 90000 00000' },
    })
    const contact = await prisma.supplierContact.findFirstOrThrow({
      where: { supplierId: result.id },
      select: { email: true, phone: true, whatsapp: true },
    })
    expect(contact.email).toBeNull()
    expect(contact.phone).toBeNull()
    expect(contact.whatsapp).toBe('+91 90000 00000')
  })

  it('records claimed certifications on the supplier, not as certifications', async () => {
    const result = await supplierRegistrationRepository.register(ctx, {
      ...baseData(),
      claimedCertifications: ['FSSAI', 'ORGANIC'] as never,
    })

    const stored = await prisma.supplier.findUniqueOrThrow({
      where: { id: result.id },
      select: { claimedCertifications: true },
    })
    expect(stored.claimedCertifications).toEqual(['FSSAI', 'ORGANIC'])

    // An unverified claim must not appear as a held certification: that row
    // asserts we checked, and nobody has.
    const certifications = await prisma.supplierCertification.findMany({
      where: { supplierId: result.id },
    })
    expect(certifications).toHaveLength(0)
  })

  it('keeps products it does not have in the catalog instead of discarding them', async () => {
    const result = await supplierRegistrationRepository.register(ctx, {
      ...baseData(),
      proposedProducts: ['Turmeric fingers', 'Black pepper'],
    })
    const stored = await prisma.supplier.findUniqueOrThrow({
      where: { id: result.id },
      select: { proposedProducts: true },
    })
    expect(stored.proposedProducts).toEqual(['Turmeric fingers', 'Black pepper'])
  })

  it('creates offerings only for catalog products this organization owns', async () => {
    const result = await supplierRegistrationRepository.register(ctx, {
      ...baseData(),
      // One real, one from another tenant, one that never existed. The Restrict
      // foreign key would take the whole registration down over the last two.
      productIds: [productId, foreignProductId, 'no-such-product'],
    })

    const offerings = await prisma.supplierProductOffering.findMany({
      where: { supplierId: result.id },
      select: { productId: true, status: true },
    })
    expect(offerings).toEqual([{ productId, status: 'PENDING_APPROVAL' }])
  })

  it('records documents with the size read from storage', async () => {
    const result = await supplierRegistrationRepository.register(ctx, {
      ...baseData(),
      documents: [
        {
          type: 'COMPANY_PROFILE',
          storageKey: `${organizationId}/registrations/${uniq()}/profile.pdf`,
          title: 'profile.pdf',
          mimeType: 'application/pdf',
          fileSize: 12345,
          checksum: 'abc123',
        },
        {
          type: 'CERTIFICATE',
          storageKey: `${organizationId}/registrations/${uniq()}/fssai.jpg`,
          title: 'FSSAI certificate',
          fileSize: 999,
        },
      ] as never,
    })

    const documents = await prisma.supplierDocument.findMany({
      where: { supplierId: result.id },
      select: { type: true, fileSize: true, checksum: true },
      orderBy: { fileSize: 'desc' },
    })
    expect(documents).toEqual([
      { type: 'COMPANY_PROFILE', fileSize: 12345, checksum: 'abc123' },
      { type: 'CERTIFICATE', fileSize: 999, checksum: null },
    ])
  })

  it('rolls the whole registration back when any part of it fails', async () => {
    const before = await prisma.supplier.count({ where: { organizationId } })

    await expect(
      supplierRegistrationRepository.register(ctx, {
        ...baseData(),
        // A document type outside the enum fails at the database. If the writes
        // were not in one transaction, the supplier and contact would already
        // be committed and a half-registered company would be left behind.
        documents: [
          {
            type: 'NOT_A_REAL_TYPE',
            storageKey: 'k',
            fileSize: 1,
          },
        ] as never,
      }),
    ).rejects.toThrow()

    expect(await prisma.supplier.count({ where: { organizationId } })).toBe(before)
  })

  it('never lets a registration reach another organization', async () => {
    const result = await supplierRegistrationRepository.register(ctx, baseData())
    const found = await prisma.supplier.findFirst({
      where: { id: result.id, organizationId: otherOrgId },
    })
    expect(found).toBeNull()
  })
})
