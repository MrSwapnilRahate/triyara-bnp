import { randomUUID } from 'node:crypto'

import { beforeAll, describe, expect, it } from 'vitest'

import { prisma } from '../client'
import { supplierRepository } from './supplier.repository'
import { supplierOfferingRepository } from './supplier-offering.repository'

// Supplier Management repositories (TRY-BNP-SUPPLIER-02) against a real database.
describe.skipIf(!process.env.DATABASE_URL)('supplier management (integration)', () => {
  let organizationId = ''
  let ctx = { actorId: '', organizationId: '', requestId: 'sup-it' }
  let productId = ''
  let categoryId = ''

  // Full-entropy suffix. A timestamp prefix is NOT unique across runs, which
  // previously made the statutory-identifier test collide with earlier rows.
  const uniq = () => randomUUID().replace(/-/g, '').slice(0, 10)
  const code = () => `SUP-${uniq().toUpperCase()}`

  beforeAll(async () => {
    const org = await prisma.organization.upsert({
      where: { slug: 'supplier-itest' },
      update: {},
      create: { name: 'Supplier IT', slug: 'supplier-itest' },
    })
    organizationId = org.id
    const user = await prisma.user.upsert({
      where: { email: 'supplier-it@triyara.test' },
      update: {},
      create: { organizationId, email: 'supplier-it@triyara.test', name: 'IT', passwordHash: 'x' },
    })
    ctx = { actorId: user.id, organizationId, requestId: 'sup-it' }

    const cat = await prisma.category.upsert({
      where: { organizationId_slug: { organizationId, slug: 'sup-it-cat' } },
      update: {},
      create: { organizationId, name: 'IT Cat', slug: 'sup-it-cat', path: '/sup-it-cat', depth: 0 },
    })
    categoryId = cat.id
    const product = await prisma.product.create({
      data: {
        organizationId,
        categoryId,
        sku: `P-${uniq()}`,
        name: 'IT Product',
        slug: `it-product-${uniq()}`,
      },
    })
    productId = product.id
  })

  it('creates a supplier and opens the approval history', async () => {
    const s = await supplierRepository.create(ctx, {
      supplierCode: code(),
      companyName: 'Acme Spices',
      legalName: 'Acme Spices Pvt Ltd',
      businessType: 'MANUFACTURER',
      country: 'IN',
      city: 'Nashik',
    })
    expect(s.status).toBe('DRAFT')
    const history = await supplierRepository.approvalHistory(organizationId, s.id)
    expect(history).toHaveLength(1)
    expect(history[0]!.toStatus).toBe('DRAFT')
  })

  it('enforces a tenant-unique supplier code', async () => {
    const c = code()
    await supplierRepository.create(ctx, {
      supplierCode: c,
      companyName: 'A',
      legalName: 'A',
      businessType: 'TRADER',
    })
    await expect(
      supplierRepository.create(ctx, {
        supplierCode: c,
        companyName: 'B',
        legalName: 'B',
        businessType: 'TRADER',
      }),
    ).rejects.toThrow(/already exists/i)
  })

  it('makes GST unique only when present, so NULLs never collide', async () => {
    const gst = `27${randomUUID().replace(/-/g, '').slice(0, 11).toUpperCase()}1Z5`
    await supplierRepository.create(ctx, {
      supplierCode: code(),
      companyName: 'G1',
      legalName: 'G1',
      businessType: 'TRADER',
      gstNumber: gst,
    })
    await expect(
      supplierRepository.create(ctx, {
        supplierCode: code(),
        companyName: 'G2',
        legalName: 'G2',
        businessType: 'TRADER',
        gstNumber: gst,
      }),
    ).rejects.toThrow(/GST number is already registered/i)

    // Two foreign suppliers with no GST must both be allowed.
    await supplierRepository.create(ctx, {
      supplierCode: code(),
      companyName: 'F1',
      legalName: 'F1',
      businessType: 'TRADER',
    })
    await expect(
      supplierRepository.create(ctx, {
        supplierCode: code(),
        companyName: 'F2',
        legalName: 'F2',
        businessType: 'TRADER',
      }),
    ).resolves.toBeTruthy()
  })

  it('records each approval transition and moves the denormalised status together', async () => {
    const s = await supplierRepository.create(ctx, {
      supplierCode: code(),
      companyName: 'Flow',
      legalName: 'Flow Ltd',
      businessType: 'PROCESSOR',
    })
    const submitted = await supplierRepository.transition(
      ctx,
      s.id,
      s.version,
      'PENDING_REVIEW',
      'SUBMITTED',
    )
    expect(submitted.status).toBe('PENDING_REVIEW')

    const approved = await supplierRepository.transition(
      ctx,
      s.id,
      submitted.version,
      'APPROVED',
      'APPROVED',
      'Docs verified',
    )
    expect(approved.status).toBe('APPROVED')
    expect(approved.isVerified).toBe(true)

    const history = await supplierRepository.approvalHistory(organizationId, s.id)
    expect(history.map((h) => h.toStatus)).toEqual(['APPROVED', 'PENDING_REVIEW', 'DRAFT'])
  })

  it('enforces optimistic concurrency on transition', async () => {
    const s = await supplierRepository.create(ctx, {
      supplierCode: code(),
      companyName: 'Conc',
      legalName: 'Conc',
      businessType: 'TRADER',
    })
    await supplierRepository.transition(ctx, s.id, s.version, 'PENDING_REVIEW', 'SUBMITTED')
    await expect(
      supplierRepository.transition(ctx, s.id, s.version, 'APPROVED', 'APPROVED'),
    ).rejects.toThrow()
  })

  it('allows at most one primary contact per supplier', async () => {
    const s = await supplierRepository.create(ctx, {
      supplierCode: code(),
      companyName: 'Prim',
      legalName: 'Prim',
      businessType: 'TRADER',
    })
    await prisma.supplierContact.create({
      data: { supplierId: s.id, organizationId, name: 'One', isPrimary: true },
    })
    await prisma.supplierContact.create({
      data: { supplierId: s.id, organizationId, name: 'Two', isPrimary: false },
    })
    await expect(
      prisma.supplierContact.create({
        data: { supplierId: s.id, organizationId, name: 'Three', isPrimary: true },
      }),
    ).rejects.toThrow()
  })

  it('never exposes the bank account number in the detail projection', async () => {
    const s = await supplierRepository.create(ctx, {
      supplierCode: code(),
      companyName: 'Bank',
      legalName: 'Bank',
      businessType: 'TRADER',
    })
    await prisma.supplierBankAccount.create({
      data: {
        supplierId: s.id,
        organizationId,
        bankName: 'SBI',
        accountHolderName: 'Bank Ltd',
        accountNumber: '99999999',
        ifscCode: 'SBIN0000001',
        currency: 'INR',
        isPrimary: true,
      },
    })
    const detail = await supplierRepository.findById(organizationId, s.id)
    expect(detail!.bankAccounts).toHaveLength(1)
    expect(JSON.stringify(detail!.bankAccounts)).not.toContain('99999999')
  })

  it('rejects overlapping capacity windows for the same supplier and product', async () => {
    const s = await supplierRepository.create(ctx, {
      supplierCode: code(),
      companyName: 'Cap',
      legalName: 'Cap',
      businessType: 'MANUFACTURER',
    })
    const base = {
      supplierId: s.id,
      organizationId,
      productId,
      capacity: '100',
      unit: 'MT',
      frequency: 'PER_MONTH' as const,
    }
    await prisma.supplierCapacity.create({
      data: { ...base, effectiveFrom: new Date('2026-01-01'), effectiveTo: new Date('2026-07-01') },
    })
    await expect(
      prisma.supplierCapacity.create({
        data: {
          ...base,
          effectiveFrom: new Date('2026-06-01'),
          effectiveTo: new Date('2027-01-01'),
        },
      }),
    ).rejects.toThrow()
    // Adjacent, non-overlapping is fine.
    await expect(
      prisma.supplierCapacity.create({
        data: {
          ...base,
          effectiveFrom: new Date('2026-07-01'),
          effectiveTo: new Date('2027-01-01'),
        },
      }),
    ).resolves.toBeTruthy()
  })

  it('rejects an out-of-range performance score', async () => {
    const s = await supplierRepository.create(ctx, {
      supplierCode: code(),
      companyName: 'Perf',
      legalName: 'Perf',
      businessType: 'TRADER',
    })
    await expect(
      prisma.supplierPerformance.create({
        data: {
          supplierId: s.id,
          organizationId,
          periodStart: new Date('2026-01-01'),
          periodEnd: new Date('2026-03-31'),
          qualityScore: '150',
        },
      }),
    ).rejects.toThrow()
  })

  it('links offerings to catalog products and answers "who supplies X?"', async () => {
    const s = await supplierRepository.create(ctx, {
      supplierCode: code(),
      companyName: 'Offer',
      legalName: 'Offer',
      businessType: 'MANUFACTURER',
    })
    const submitted = await supplierRepository.transition(
      ctx,
      s.id,
      s.version,
      'PENDING_REVIEW',
      'SUBMITTED',
    )
    await supplierRepository.transition(ctx, s.id, submitted.version, 'APPROVED', 'APPROVED')

    const offering = await supplierOfferingRepository.create(ctx, s.id, {
      productId,
      supplierSku: 'OF-1',
      price: 1500,
      currency: 'USD',
      incoterm: 'FOB',
      port: 'Nhava Sheva',
      isPreferred: true,
      status: 'ACTIVE',
    })
    expect(offering.product.id).toBe(productId)

    // Same terms twice is a duplicate.
    await expect(
      supplierOfferingRepository.create(ctx, s.id, {
        productId,
        price: 1600,
        currency: 'USD',
        incoterm: 'FOB',
        port: 'Nhava Sheva',
      }),
    ).rejects.toThrow(/exact terms/i)

    // Different incoterm is a legitimately different offering.
    await expect(
      supplierOfferingRepository.create(ctx, s.id, {
        productId,
        price: 1700,
        currency: 'USD',
        incoterm: 'CIF',
        port: 'Dubai',
      }),
    ).resolves.toBeTruthy()

    const shortlist = await supplierOfferingRepository.findSuppliersForProduct(
      organizationId,
      productId,
    )
    expect(shortlist.map((o) => o.supplierId)).toContain(s.id)
  })

  it('excludes unapproved suppliers from the sourcing shortlist', async () => {
    const draft = await supplierRepository.create(ctx, {
      supplierCode: code(),
      companyName: 'Draft Co',
      legalName: 'Draft Co',
      businessType: 'TRADER',
    })
    await supplierOfferingRepository.create(ctx, draft.id, {
      productId,
      price: 1,
      currency: 'USD',
      incoterm: 'EXW',
      port: 'Nagpur',
      status: 'ACTIVE',
    })
    const shortlist = await supplierOfferingRepository.findSuppliersForProduct(
      organizationId,
      productId,
    )
    expect(shortlist.map((o) => o.supplierId)).not.toContain(draft.id)
  })

  it('finds suppliers by the product they offer', async () => {
    const listed = await supplierRepository.list({ organizationId, productId, limit: 50 })
    expect(listed.items.length).toBeGreaterThan(0)
  })
})
