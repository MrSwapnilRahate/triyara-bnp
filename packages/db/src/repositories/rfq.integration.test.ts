import { randomUUID } from 'node:crypto'

import { beforeAll, describe, expect, it } from 'vitest'

import { prisma } from '../client'
import { rfqRepository } from './rfq.repository'
import { rfqSupplierRepository } from './rfq-supplier.repository'

// RFQ Management repositories (TRY-BNP-RFQ-01) against a real database.
describe.skipIf(!process.env.DATABASE_URL)('rfq management (integration)', () => {
  let organizationId = ''
  let ctx = { actorId: '', organizationId: '', requestId: 'rfq-it' }
  let accountId = ''
  let productId = ''
  let supplierId = ''
  let supplierId2 = ''

  // Full entropy: names and numbers must be unique across runs, not just within one.
  const uniq = () => randomUUID().replace(/-/g, '').slice(0, 10)
  const num = () => `RFQ-IT-${uniq().toUpperCase()}`

  beforeAll(async () => {
    const org = await prisma.organization.upsert({
      where: { slug: 'rfq-itest' },
      update: {},
      create: { name: 'RFQ IT', slug: 'rfq-itest' },
    })
    organizationId = org.id
    const user = await prisma.user.upsert({
      where: { email: 'rfq-it@triyara.test' },
      update: {},
      create: { organizationId, email: 'rfq-it@triyara.test', name: 'IT', passwordHash: 'x' },
    })
    ctx = { actorId: user.id, organizationId, requestId: 'rfq-it' }

    const account = await prisma.account.create({
      data: {
        organizationId,
        legalName: `Buyer ${uniq()}`,
        createdById: user.id,
        updatedById: user.id,
      },
    })
    accountId = account.id

    const cat = await prisma.category.upsert({
      where: { organizationId_slug: { organizationId, slug: 'rfq-it-cat' } },
      update: {},
      create: { organizationId, name: 'IT Cat', slug: 'rfq-it-cat', path: '/rfq-it-cat', depth: 0 },
    })
    const product = await prisma.product.create({
      data: {
        organizationId,
        categoryId: cat.id,
        sku: `P-${uniq()}`,
        name: `IT Product ${uniq()}`,
        slug: `it-${uniq()}`,
      },
    })
    productId = product.id

    const s1 = await prisma.supplier.create({
      data: {
        organizationId,
        supplierCode: `S-${uniq().toUpperCase()}`,
        companyName: `S1 ${uniq()}`,
        legalName: 'S1',
        businessType: 'TRADER',
        createdById: user.id,
      },
    })
    supplierId = s1.id
    const s2 = await prisma.supplier.create({
      data: {
        organizationId,
        supplierCode: `S-${uniq().toUpperCase()}`,
        companyName: `S2 ${uniq()}`,
        legalName: 'S2',
        businessType: 'TRADER',
        createdById: user.id,
      },
    })
    supplierId2 = s2.id
  })

  const baseRfq = () => ({
    rfqNumber: num(),
    type: 'BUYER' as const,
    buyerId: accountId,
    title: `IT RFQ ${uniq()}`,
    currency: 'USD',
    destinationCountry: 'AE',
    destinationPort: 'Jebel Ali',
  })
  const line = () => ({ productId, quantity: 10, unit: 'MT', requiredCertifications: [] as never })

  it('creates an RFQ with lines, opening approval and revision 1', async () => {
    const rfq = await rfqRepository.create(ctx, baseRfq(), [line()])
    expect(rfq.status).toBe('DRAFT')
    expect(rfq.items).toHaveLength(1)
    expect(rfq.currentRevision).toBe(1)

    const approvals = await rfqRepository.approvalHistory(organizationId, rfq.id)
    expect(approvals).toHaveLength(1)
    expect(approvals[0]!.toStatus).toBe('DRAFT')

    const revisions = await rfqRepository.revisionHistory(organizationId, rfq.id)
    expect(revisions).toHaveLength(1)
    expect(revisions[0]!.revisionNumber).toBe(1)

    const audit = await prisma.auditLog.count({ where: { entityType: 'RFQ', entityId: rfq.id } })
    expect(audit).toBeGreaterThanOrEqual(1)
  })

  it('enforces a tenant-unique RFQ number', async () => {
    const n = num()
    await rfqRepository.create(ctx, { ...baseRfq(), rfqNumber: n }, [line()])
    await expect(
      rfqRepository.create(ctx, { ...baseRfq(), rfqNumber: n }, [line()]),
    ).rejects.toThrow(/already exists/i)
  })

  it('rejects a BUYER rfq with no buyer at the database level', async () => {
    await expect(
      prisma.rFQ.create({
        data: {
          organizationId,
          rfqNumber: num(),
          type: 'BUYER',
          buyerId: null,
          title: 'No buyer',
          createdById: ctx.actorId,
        },
      }),
    ).rejects.toThrow()
  })

  it('rejects a line that is neither catalogued nor free text', async () => {
    const rfq = await rfqRepository.create(ctx, baseRfq(), [line()])
    await expect(
      prisma.rFQItem.create({
        data: { rfqId: rfq.id, organizationId, lineNumber: 99, quantity: '1', unit: 'MT' },
      }),
    ).rejects.toThrow()
  })

  it('rejects a deadline after the shipment date at the database level', async () => {
    await expect(
      prisma.rFQ.create({
        data: {
          organizationId,
          rfqNumber: num(),
          type: 'INTERNAL',
          title: 'Bad dates',
          createdById: ctx.actorId,
          quotationDeadline: new Date('2026-10-01'),
          expectedShipmentDate: new Date('2026-09-01'),
        },
      }),
    ).rejects.toThrow()
  })

  it('rejects a non-internal comment', async () => {
    const rfq = await rfqRepository.create(ctx, baseRfq(), [line()])
    await expect(
      prisma.rFQComment.create({
        data: {
          rfqId: rfq.id,
          organizationId,
          authorId: ctx.actorId,
          body: 'leak',
          isInternal: false,
        },
      }),
    ).rejects.toThrow()
  })

  it('enforces optimistic concurrency on update', async () => {
    const rfq = await rfqRepository.create(ctx, baseRfq(), [line()])
    await rfqRepository.mutate(ctx, rfq.id, rfq.version, { title: 'Renamed' })
    await expect(
      rfqRepository.mutate(ctx, rfq.id, rfq.version, { title: 'Again' }),
    ).rejects.toThrow()
  })

  it('cuts a new revision when lines are replaced', async () => {
    const rfq = await rfqRepository.create(ctx, baseRfq(), [line()])
    const revised = await rfqRepository.replaceItems(
      ctx,
      rfq.id,
      rfq.version,
      [line(), { ...line(), quantity: 5 }],
      'Buyer added a line.',
    )

    expect(revised.currentRevision).toBe(2)
    expect(revised.items).toHaveLength(2)

    const history = await rfqRepository.revisionHistory(organizationId, rfq.id)
    expect(history.map((h) => h.revisionNumber)).toEqual([2, 1])
    // The snapshot reproduces the RFQ as issued at that revision.
    expect((history[0]!.snapshot as { items: unknown[] }).items).toHaveLength(2)
    expect((history[1]!.snapshot as { items: unknown[] }).items).toHaveLength(1)
  })

  it('invites suppliers idempotently', async () => {
    const rfq = await rfqRepository.create(ctx, baseRfq(), [line()])
    const first = await rfqSupplierRepository.invite(ctx, rfq.id, [supplierId, supplierId2])
    expect(first).toHaveLength(2)
    // Re-inviting must not duplicate.
    const second = await rfqSupplierRepository.invite(ctx, rfq.id, [supplierId, supplierId2])
    expect(second).toHaveLength(2)
  })

  it('supersedes prior bids on re-submission and keeps the price history', async () => {
    const rfq = await rfqRepository.create(ctx, baseRfq(), [line()])
    await rfqRepository.transition(ctx, rfq.id, rfq.version, 'ISSUED', 'APPROVED')
    const [participation] = await rfqSupplierRepository.invite(ctx, rfq.id, [supplierId])
    const itemId = rfq.items[0]!.id

    const v1 = await rfqSupplierRepository.submitResponse(ctx, participation!.id, {
      lines: [{ rfqItemId: itemId, price: 1000, currency: 'USD' }],
    })
    expect(v1.lines[0]!.revisionNumber).toBe(1)
    expect(v1.participation.status).toBe('SUBMITTED')
    expect(Number(v1.participation.quotationTotal)).toBe(1000)

    const v2 = await rfqSupplierRepository.submitResponse(ctx, participation!.id, {
      lines: [{ rfqItemId: itemId, price: 950, currency: 'USD' }],
    })
    expect(v2.lines[0]!.revisionNumber).toBe(2)

    const history = await rfqSupplierRepository.priceHistory(
      organizationId,
      participation!.id,
      itemId,
    )
    expect(history.map((h) => h.revisionNumber)).toEqual([2, 1])
    // Exactly one row is current.
    expect(history.filter((h) => h.isCurrent)).toHaveLength(1)
    expect(Number(history.find((h) => h.isCurrent)!.price)).toBe(950)
  })

  it('marks a bid late when it arrives after the deadline', async () => {
    const rfq = await rfqRepository.create(
      ctx,
      {
        ...baseRfq(),
        quotationDeadline: new Date(Date.now() - 86_400_000),
        expectedShipmentDate: new Date(Date.now() + 86_400_000),
      },
      [line()],
    )
    await rfqRepository.transition(ctx, rfq.id, rfq.version, 'ISSUED', 'APPROVED')
    const [p] = await rfqSupplierRepository.invite(ctx, rfq.id, [supplierId])

    const res = await rfqSupplierRepository.submitResponse(ctx, p!.id, {
      lines: [{ rfqItemId: rfq.items[0]!.id, price: 10, currency: 'USD' }],
    })
    // Late is a property of the submission, not a participation status.
    expect(res.participation.isLate).toBe(true)
    expect(res.participation.status).toBe('SUBMITTED')
  })

  it('rejects a bid on a line from a different RFQ', async () => {
    const a = await rfqRepository.create(ctx, baseRfq(), [line()])
    const b = await rfqRepository.create(ctx, baseRfq(), [line()])
    await rfqRepository.transition(ctx, a.id, a.version, 'ISSUED', 'APPROVED')
    const [p] = await rfqSupplierRepository.invite(ctx, a.id, [supplierId])

    await expect(
      rfqSupplierRepository.submitResponse(ctx, p!.id, {
        lines: [{ rfqItemId: b.items[0]!.id, price: 10, currency: 'USD' }],
      }),
    ).rejects.toThrow(/does not belong to this RFQ/i)
  })

  it('ranks current bids cheapest first for a line', async () => {
    const rfq = await rfqRepository.create(ctx, baseRfq(), [line()])
    await rfqRepository.transition(ctx, rfq.id, rfq.version, 'ISSUED', 'APPROVED')
    const parts = await rfqSupplierRepository.invite(ctx, rfq.id, [supplierId, supplierId2])
    const itemId = rfq.items[0]!.id

    await rfqSupplierRepository.submitResponse(ctx, parts[0]!.id, {
      lines: [{ rfqItemId: itemId, price: 1200, currency: 'USD' }],
    })
    await rfqSupplierRepository.submitResponse(ctx, parts[1]!.id, {
      lines: [{ rfqItemId: itemId, price: 1100, currency: 'USD' }],
    })

    const ranked = await rfqSupplierRepository.compareLine(organizationId, itemId)
    expect(ranked).toHaveLength(2)
    expect(Number(ranked[0]!.price)).toBe(1100)
  })

  it('records each approval transition alongside the denormalised status', async () => {
    const rfq = await rfqRepository.create(ctx, baseRfq(), [line()])
    const pending = await rfqRepository.transition(
      ctx,
      rfq.id,
      rfq.version,
      'PENDING_APPROVAL',
      'PENDING',
    )
    const approved = await rfqRepository.transition(
      ctx,
      rfq.id,
      pending.version,
      'APPROVED',
      'APPROVED',
    )
    expect(approved.status).toBe('APPROVED')

    const history = await rfqRepository.approvalHistory(organizationId, rfq.id)
    expect(history.map((h) => h.toStatus)).toEqual(['APPROVED', 'PENDING', 'DRAFT'])
    expect(history.map((h) => h.sequence)).toEqual([3, 2, 1])
  })

  it('isolates by organization', async () => {
    const other = await prisma.organization.upsert({
      where: { slug: 'rfq-itest-other' },
      update: {},
      create: { name: 'Other', slug: 'rfq-itest-other' },
    })
    const mine = await rfqRepository.create(ctx, baseRfq(), [line()])
    const seen = await rfqRepository.list({ organizationId: other.id, limit: 100 })
    expect(seen.items.map((r) => r.id)).not.toContain(mine.id)
  })

  it('soft-deletes and restores, keeping the number reserved', async () => {
    const n = num()
    const rfq = await rfqRepository.create(ctx, { ...baseRfq(), rfqNumber: n }, [line()])
    const deleted = await rfqRepository.softDelete(ctx, rfq.id, rfq.version)
    expect(deleted.deletedAt).not.toBeNull()
    expect(deleted.status).toBe('CANCELLED')

    await expect(
      rfqRepository.create(ctx, { ...baseRfq(), rfqNumber: n }, [line()]),
    ).rejects.toThrow(/already exists/i)

    const restored = await rfqRepository.restore(ctx, rfq.id, deleted.version)
    expect(restored.deletedAt).toBeNull()
    expect(restored.status).toBe('DRAFT')
  })

  it('finds RFQs by invited supplier and by requested product', async () => {
    const rfq = await rfqRepository.create(ctx, baseRfq(), [line()])
    await rfqSupplierRepository.invite(ctx, rfq.id, [supplierId])

    const bySupplier = await rfqRepository.list({ organizationId, supplierId, limit: 100 })
    expect(bySupplier.items.map((r) => r.id)).toContain(rfq.id)

    const byProduct = await rfqRepository.list({ organizationId, productId, limit: 100 })
    expect(byProduct.items.map((r) => r.id)).toContain(rfq.id)
  })
})
