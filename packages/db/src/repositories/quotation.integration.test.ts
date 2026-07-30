import { randomUUID } from 'node:crypto'

import { beforeAll, describe, expect, it } from 'vitest'

import { prisma } from '../client'
import { quotationRepository } from './quotation.repository'
import { quotationReferenceRepository } from './quotation-reference.repository'
import { quotationSourcingRepository } from './quotation-sourcing.repository'

// Quotation Engine repositories (TRY-BNP-QUOTE-01) against a real database.
//
// The database-level guarantees are what these tests exist for: the partial
// unique index that permits exactly one selected supplier per line, the EXCLUDE
// constraint that forbids overlapping FX windows, optimistic concurrency, and
// the revision chain.
describe.skipIf(!process.env.DATABASE_URL)('quotation engine (integration)', () => {
  let organizationId = ''
  let ctx = { actorId: '', organizationId: '', requestId: 'quote-it' }
  let accountId = ''
  let productId = ''
  let supplierId = ''
  let supplierId2 = ''

  // Full entropy: numbers AND names must be unique across runs, not just within
  // one, or a second run collides on a natural key.
  const uniq = () => randomUUID().replace(/-/g, '').slice(0, 10)
  const num = () => `QT-IT-${uniq().toUpperCase()}`

  beforeAll(async () => {
    const org = await prisma.organization.upsert({
      where: { slug: 'quote-itest' },
      update: {},
      create: { name: 'Quote IT', slug: 'quote-itest' },
    })
    organizationId = org.id
    const user = await prisma.user.upsert({
      where: { email: 'quote-it@triyara.test' },
      update: {},
      create: { organizationId, email: 'quote-it@triyara.test', name: 'IT', passwordHash: 'x' },
    })
    ctx = { actorId: user.id, organizationId, requestId: 'quote-it' }

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
      where: { organizationId_slug: { organizationId, slug: 'quote-it-cat' } },
      update: {},
      create: {
        organizationId,
        name: 'IT Cat',
        slug: 'quote-it-cat',
        path: '/quote-it-cat',
        depth: 0,
      },
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

    for (const label of ['S1', 'S2']) {
      const s = await prisma.supplier.create({
        data: {
          organizationId,
          supplierCode: `S-${uniq().toUpperCase()}`,
          companyName: `${label} ${uniq()}`,
          legalName: label,
          businessType: 'TRADER',
          createdById: user.id,
        },
      })
      if (label === 'S1') supplierId = s.id
      else supplierId2 = s.id
    }
  })

  const header = () => ({
    quotationNumber: num(),
    type: 'FIRM' as const,
    buyerId: accountId,
    title: `IT Quotation ${uniq()}`,
    currency: 'USD',
    baseCurrency: 'USD',
    validUntil: new Date(Date.now() + 30 * 86_400_000),
  })

  const line = (unitPrice = 100, unitCost = 80) => ({
    productId,
    quantity: 10,
    unit: 'MT',
    unitPrice,
    unitCost,
    requiredCertifications: [] as never,
  })

  const totals = (over: Partial<Parameters<typeof quotationRepository.create>[3]> = {}) => ({
    subtotal: 1000,
    chargesTotal: 0,
    discountTotal: 0,
    taxTotal: 0,
    grandTotal: 1000,
    costTotal: 800,
    marginPercent: 20,
    ...over,
  })

  it('creates a quotation with lines, an opening approval and revision 1', async () => {
    const q = await quotationRepository.create(ctx, header(), [line()], totals())
    expect(q.status).toBe('DRAFT')
    expect(q.revisionNumber).toBe(1)
    expect(q.items).toHaveLength(1)
    expect(Number(q.grandTotal)).toBe(1000)

    const approvals = await quotationRepository.approvalHistory(organizationId, q.id)
    expect(approvals).toHaveLength(1)
    expect(approvals[0]!.toStatus).toBe('DRAFT')

    const revisions = await quotationRepository.revisionHistory(organizationId, q.id)
    expect(revisions).toHaveLength(1)
    expect(revisions[0]!.fromRevision).toBeNull()
    expect(revisions[0]!.toRevision).toBe(1)
  })

  it('numbers lines from 1 and seeds lineTotal from the subtotal', async () => {
    const q = await quotationRepository.create(
      ctx,
      header(),
      [line(100), line(250)],
      totals({ subtotal: 3500, grandTotal: 3500 }),
    )
    const lines = [...q.items].sort((a, b) => a.lineNumber - b.lineNumber)
    expect(lines.map((l) => l.lineNumber)).toEqual([1, 2])
    expect(Number(lines[1]!.lineSubtotal)).toBe(2500)
    expect(Number(lines[1]!.lineTotal)).toBe(2500)
  })

  it('rejects a duplicate number and revision within the tenant', async () => {
    const h = header()
    await quotationRepository.create(ctx, h, [line()], totals())
    await expect(quotationRepository.create(ctx, h, [line()], totals())).rejects.toThrow(
      /already exists/,
    )
  })

  it('enforces optimistic concurrency on update', async () => {
    const q = await quotationRepository.create(ctx, header(), [line()], totals())
    const updated = await quotationRepository.mutate(ctx, q.id, q.version, { title: 'Revised' })
    expect(updated.version).toBe(q.version + 1)
    // The stale version must be refused, not silently applied.
    await expect(
      quotationRepository.mutate(ctx, q.id, q.version, { title: 'Stale' }),
    ).rejects.toThrow()
  })

  it('replaces lines and stores the recomputed roll-ups', async () => {
    const q = await quotationRepository.create(ctx, header(), [line()], totals())
    const after = await quotationRepository.replaceItems(
      ctx,
      q.id,
      q.version,
      [line(120), line(130)],
      totals({ subtotal: 2500, grandTotal: 2500, costTotal: 1600, marginPercent: 36 }),
    )
    expect(after.items).toHaveLength(2)
    expect(Number(after.grandTotal)).toBe(2500)
    expect(Number(after.marginPercent)).toBe(36)
  })

  it('isolates tenants: another organization cannot read the quotation', async () => {
    const q = await quotationRepository.create(ctx, header(), [line()], totals())
    const other = await prisma.organization.upsert({
      where: { slug: 'quote-itest-other' },
      update: {},
      create: { name: 'Other', slug: 'quote-itest-other' },
    })
    expect(await quotationRepository.findById(other.id, q.id)).toBeNull()
  })

  describe('revisions', () => {
    it('supersedes the current row and opens revision 2 chained to it', async () => {
      const q = await quotationRepository.create(ctx, header(), [line()], totals())
      const next = await quotationRepository.revise(
        ctx,
        q.id,
        q.version,
        [line(120)],
        totals({ subtotal: 1200, grandTotal: 1200 }),
        'Buyer renegotiated freight.',
      )
      expect(next.revisionNumber).toBe(2)
      expect(next.previousRevisionId).toBe(q.id)
      expect(next.status).toBe('DRAFT')

      const previous = await quotationRepository.findById(organizationId, q.id)
      expect(previous!.status).toBe('SUPERSEDED')
      expect(previous!.supersededAt).not.toBeNull()

      // The superseded row IS the snapshot: its lines are still readable.
      expect(Number(previous!.items[0]!.unitPrice)).toBe(100)
      expect(Number(next.items[0]!.unitPrice)).toBe(120)
    })

    it('returns only the newest live revision as current', async () => {
      const h = header()
      const q = await quotationRepository.create(ctx, h, [line()], totals())
      await quotationRepository.revise(ctx, q.id, q.version, [line(120)], totals(), 'r2')

      const current = await quotationRepository.findCurrentByNumber(
        organizationId,
        h.quotationNumber,
      )
      expect(current!.revisionNumber).toBe(2)

      const chain = await quotationRepository.revisionChain(organizationId, h.quotationNumber)
      expect(chain.map((c) => c.revisionNumber)).toEqual([2, 1])
    })

    it('records the revision hop, not a bare revision number', async () => {
      const q = await quotationRepository.create(ctx, header(), [line()], totals())
      const next = await quotationRepository.revise(
        ctx,
        q.id,
        q.version,
        [line(120)],
        totals(),
        'price change',
      )
      const revisions = await quotationRepository.revisionHistory(organizationId, next.id)
      const hop = revisions.find((r) => r.toRevision === 2)
      expect(hop!.fromRevision).toBe(1)
      expect(hop!.reason).toBe('price change')
    })
  })

  describe('sourcing options', () => {
    it('ranks candidate options by landed cost, cheapest first', async () => {
      const q = await quotationRepository.create(ctx, header(), [line()], totals())
      const options = await quotationSourcingRepository.replaceOptions(ctx, q.items[0]!.id, [
        {
          supplierId: supplierId2,
          supplierPrice: 95,
          supplierCurrency: 'USD',
          landedUnitCost: 95,
        },
        { supplierId, supplierPrice: 80, supplierCurrency: 'USD', landedUnitCost: 82 },
      ])
      expect(options.map((o) => o.rank)).toEqual([1, 2])
      expect(options[0]!.supplierId).toBe(supplierId)
      expect(Number(options[0]!.landedUnitCost)).toBe(82)
    })

    it('replaces options wholesale rather than accumulating them', async () => {
      const q = await quotationRepository.create(ctx, header(), [line()], totals())
      await quotationSourcingRepository.replaceOptions(ctx, q.items[0]!.id, [
        { supplierId, supplierPrice: 80, supplierCurrency: 'USD', landedUnitCost: 82 },
        { supplierId: supplierId2, supplierPrice: 95, supplierCurrency: 'USD', landedUnitCost: 95 },
      ])
      const after = await quotationSourcingRepository.replaceOptions(ctx, q.items[0]!.id, [
        { supplierId, supplierPrice: 78, supplierCurrency: 'USD', landedUnitCost: 79 },
      ])
      expect(after).toHaveLength(1)
      expect(Number(after[0]!.landedUnitCost)).toBe(79)
    })

    it('refuses an option for a supplier outside the tenant', async () => {
      const q = await quotationRepository.create(ctx, header(), [line()], totals())
      await expect(
        quotationSourcingRepository.replaceOptions(ctx, q.items[0]!.id, [
          { supplierId: 'nope', supplierPrice: 1, supplierCurrency: 'USD', landedUnitCost: 1 },
        ]),
      ).rejects.toThrow(/Supplier not found/)
    })

    it('permits exactly one selected supplier per line', async () => {
      const q = await quotationRepository.create(ctx, header(), [line()], totals())
      const options = await quotationSourcingRepository.replaceOptions(ctx, q.items[0]!.id, [
        { supplierId, supplierPrice: 80, supplierCurrency: 'USD', landedUnitCost: 82 },
        { supplierId: supplierId2, supplierPrice: 95, supplierCurrency: 'USD', landedUnitCost: 95 },
      ])

      const first = await quotationSourcingRepository.selectOption(
        ctx,
        options[0]!.id,
        options[0]!.version,
        'Cheapest landed cost.',
      )
      expect(first.isSelected).toBe(true)
      expect(first.selectedById).toBe(ctx.actorId)

      // Awarding the other candidate must move the flag, not add a second one.
      const second = await quotationSourcingRepository.selectOption(
        ctx,
        options[1]!.id,
        options[1]!.version,
        'Shorter lead time wins.',
      )
      expect(second.isSelected).toBe(true)

      const all = await quotationSourcingRepository.compareLine(organizationId, q.items[0]!.id)
      expect(all.filter((o) => o.isSelected)).toHaveLength(1)
      expect(all.find((o) => o.isSelected)!.id).toBe(options[1]!.id)
    })

    it('enforces optimistic concurrency on selection', async () => {
      const q = await quotationRepository.create(ctx, header(), [line()], totals())
      const options = await quotationSourcingRepository.replaceOptions(ctx, q.items[0]!.id, [
        { supplierId, supplierPrice: 80, supplierCurrency: 'USD', landedUnitCost: 82 },
      ])
      await quotationSourcingRepository.selectOption(ctx, options[0]!.id, options[0]!.version)
      await expect(
        quotationSourcingRepository.selectOption(ctx, options[0]!.id, options[0]!.version),
      ).rejects.toThrow()
    })

    it('rejects two options for the same supplier on one line', async () => {
      const q = await quotationRepository.create(ctx, header(), [line()], totals())
      await expect(
        quotationSourcingRepository.replaceOptions(ctx, q.items[0]!.id, [
          { supplierId, supplierPrice: 80, supplierCurrency: 'USD', landedUnitCost: 82 },
          { supplierId, supplierPrice: 90, supplierCurrency: 'USD', landedUnitCost: 92 },
        ]),
      ).rejects.toThrow()
    })

    it('drops options with their line when the lines are replaced', async () => {
      const q = await quotationRepository.create(ctx, header(), [line()], totals())
      const lineId = q.items[0]!.id
      await quotationSourcingRepository.replaceOptions(ctx, lineId, [
        { supplierId, supplierPrice: 80, supplierCurrency: 'USD', landedUnitCost: 82 },
      ])
      await quotationRepository.replaceItems(ctx, q.id, q.version, [line(120)], totals())
      expect(await quotationSourcingRepository.compareLine(organizationId, lineId)).toHaveLength(0)
    })
  })

  describe('charges and taxes', () => {
    it('defaults scope from the presence of a line and marks discounts as deductions', async () => {
      const q = await quotationRepository.create(ctx, header(), [line()], totals())
      const { charges } = await quotationSourcingRepository.replaceConditions(
        ctx,
        q.id,
        [
          { type: 'FREIGHT', amount: 200, currency: 'USD' },
          { type: 'DISCOUNT', amount: 50, currency: 'USD' },
          { type: 'PACKING', quotationItemId: q.items[0]!.id, amount: 25, currency: 'USD' },
        ],
        [],
      )
      const byType = new Map(charges.map((c) => [c.type, c]))
      expect(byType.get('FREIGHT')!.scope).toBe('HEADER')
      expect(byType.get('FREIGHT')!.isDeduction).toBe(false)
      expect(byType.get('DISCOUNT')!.isDeduction).toBe(true)
      expect(byType.get('PACKING')!.scope).toBe('LINE')
    })

    it('replaces conditions wholesale', async () => {
      const q = await quotationRepository.create(ctx, header(), [line()], totals())
      await quotationSourcingRepository.replaceConditions(
        ctx,
        q.id,
        [
          { type: 'FREIGHT', amount: 200, currency: 'USD' },
          { type: 'INSURANCE', amount: 30, currency: 'USD' },
        ],
        [{ type: 'IGST', ratePercent: 18, taxableAmount: 1200, amount: 216, currency: 'USD' }],
      )
      const after = await quotationSourcingRepository.replaceConditions(
        ctx,
        q.id,
        [{ type: 'FREIGHT', amount: 250, currency: 'USD' }],
        [],
      )
      expect(after.charges).toHaveLength(1)
      expect(after.taxes).toHaveLength(0)

      const listed = await quotationSourcingRepository.listConditions(organizationId, q.id)
      expect(listed.charges).toHaveLength(1)
      expect(Number(listed.charges[0]!.amount)).toBe(250)
    })

    it('rejects a tax rate outside 0-100', async () => {
      const q = await quotationRepository.create(ctx, header(), [line()], totals())
      await expect(
        quotationSourcingRepository.replaceConditions(
          ctx,
          q.id,
          [],
          [{ type: 'IGST', ratePercent: 140, taxableAmount: 1000, amount: 1400, currency: 'USD' }],
        ),
      ).rejects.toThrow()
    })
  })

  describe('lifecycle', () => {
    it('records each transition with its threshold and margin at decision time', async () => {
      const q = await quotationRepository.create(ctx, header(), [line()], totals())
      const pending = await quotationRepository.transition(
        ctx,
        q.id,
        q.version,
        'PENDING_APPROVAL',
        'PENDING',
        'For review.',
        1_000_000,
      )
      expect(pending.status).toBe('PENDING_APPROVAL')

      const approved = await quotationRepository.transition(
        ctx,
        q.id,
        pending.version,
        'APPROVED',
        'APPROVED',
        'Margin acceptable.',
        1_000_000,
      )
      expect(approved.status).toBe('APPROVED')

      const history = await quotationRepository.approvalHistory(organizationId, q.id)
      // Opening DRAFT row plus the two decisions, newest step first.
      expect(history).toHaveLength(3)
      expect(history.map((h) => h.sequence)).toEqual([3, 2, 1])
      const latest = history[0]!
      expect(latest.toStatus).toBe('APPROVED')
      expect(Number(latest.thresholdAmount)).toBe(1_000_000)
      expect(Number(latest.marginPercent)).toBe(20)
      // The opening row predates any threshold, so it carries none.
      expect(history.at(-1)!.thresholdAmount).toBeNull()
    })

    it('stamps sentAt when the quotation is sent', async () => {
      const q = await quotationRepository.create(ctx, header(), [line()], totals())
      const sent = await quotationRepository.transition(
        ctx,
        q.id,
        q.version,
        'SENT',
        'APPROVED',
        'Sent.',
      )
      expect(sent.sentAt).not.toBeNull()
    })

    it('withdraws on soft delete and returns to draft on restore', async () => {
      const q = await quotationRepository.create(ctx, header(), [line()], totals())
      const removed = await quotationRepository.softDelete(ctx, q.id, q.version)
      expect(removed.status).toBe('WITHDRAWN')
      expect(removed.deletedAt).not.toBeNull()
      expect(await quotationRepository.findById(organizationId, q.id)).toBeNull()

      const restored = await quotationRepository.restore(ctx, q.id, removed.version)
      expect(restored.status).toBe('DRAFT')
      expect(restored.deletedAt).toBeNull()
    })
  })

  describe('listing', () => {
    it('filters to the current revision only', async () => {
      const h = header()
      const q = await quotationRepository.create(ctx, h, [line()], totals())
      await quotationRepository.revise(ctx, q.id, q.version, [line(120)], totals(), 'r2')

      const all = await quotationRepository.list({
        organizationId,
        q: h.quotationNumber,
        limit: 25,
      })
      expect(all.items).toHaveLength(2)

      const current = await quotationRepository.list({
        organizationId,
        q: h.quotationNumber,
        currentOnly: true,
        limit: 25,
      })
      expect(current.items).toHaveLength(1)
      expect(current.items[0]!.revisionNumber).toBe(2)
    })

    it('paginates by cursor without repeating a row', async () => {
      const marker = uniq().toUpperCase()
      for (let i = 0; i < 3; i += 1) {
        await quotationRepository.create(
          ctx,
          { ...header(), quotationNumber: `QT-PG-${marker}-${i}` },
          [line()],
          totals(),
        )
      }
      const first = await quotationRepository.list({ organizationId, q: marker, limit: 2 })
      expect(first.items).toHaveLength(2)
      expect(first.nextCursor).not.toBeNull()

      const second = await quotationRepository.list({
        organizationId,
        q: marker,
        limit: 2,
        cursor: first.nextCursor!,
      })
      expect(second.items).toHaveLength(1)
      const ids = new Set([...first.items, ...second.items].map((i) => i.id))
      expect(ids.size).toBe(3)
    })

    it('excludes withdrawn quotations unless asked for them', async () => {
      const h = header()
      const q = await quotationRepository.create(ctx, h, [line()], totals())
      await quotationRepository.softDelete(ctx, q.id, q.version)

      const live = await quotationRepository.list({
        organizationId,
        q: h.quotationNumber,
        limit: 25,
      })
      expect(live.items).toHaveLength(0)

      const withDeleted = await quotationRepository.list({
        organizationId,
        q: h.quotationNumber,
        includeDeleted: true,
        limit: 25,
      })
      expect(withDeleted.items).toHaveLength(1)
    })
  })

  describe('payment terms and exchange rates', () => {
    // fromCurrency is Char(3), so a random code carries far too little entropy to
    // stay unique as rows accumulate across runs. The unique and EXCLUDE
    // constraints are both organization-scoped, so a fresh tenant per test gives
    // real isolation where a random currency code only gives the appearance of it.
    const fxCtx = async () => {
      const org = await prisma.organization.create({
        data: { name: `FX ${uniq()}`, slug: `fx-${uniq()}` },
      })
      return { actorId: ctx.actorId, organizationId: org.id, requestId: 'quote-it-fx' }
    }

    it('rejects a duplicate payment term code within the tenant', async () => {
      const code = `PT-${uniq().toUpperCase()}`
      await quotationReferenceRepository.createPaymentTerm(ctx, { code, name: 'Net 30' })
      await expect(
        quotationReferenceRepository.createPaymentTerm(ctx, { code, name: 'Net 30 again' }),
      ).rejects.toThrow(/already exists/)
    })

    it('finds the rate in force on a date and nothing outside the window', async () => {
      const fx = await fxCtx()
      const from = 'USD'
      await quotationReferenceRepository.createExchangeRate(fx, {
        fromCurrency: from,
        toCurrency: 'INR',
        rate: 83.45,
        effectiveFrom: new Date('2026-03-01'),
        effectiveTo: new Date('2026-04-01'),
      })

      const inside = await quotationReferenceRepository.findRateOn(
        fx.organizationId,
        from,
        'INR',
        new Date('2026-03-15'),
      )
      expect(Number(inside!.rate)).toBe(83.45)

      // Before the window and after it must both return null rather than
      // silently converting at some default.
      expect(
        await quotationReferenceRepository.findRateOn(
          fx.organizationId,
          from,
          'INR',
          new Date('2026-02-01'),
        ),
      ).toBeNull()
      expect(
        await quotationReferenceRepository.findRateOn(
          fx.organizationId,
          from,
          'INR',
          new Date('2026-05-01'),
        ),
      ).toBeNull()
    })

    it('forbids two overlapping windows for the same currency pair', async () => {
      const fx = await fxCtx()
      const from = 'USD'
      await quotationReferenceRepository.createExchangeRate(fx, {
        fromCurrency: from,
        toCurrency: 'INR',
        rate: 83,
        effectiveFrom: new Date('2026-03-01'),
        effectiveTo: new Date('2026-06-01'),
      })
      await expect(
        quotationReferenceRepository.createExchangeRate(fx, {
          fromCurrency: from,
          toCurrency: 'INR',
          rate: 84,
          effectiveFrom: new Date('2026-05-01'),
          effectiveTo: new Date('2026-07-01'),
        }),
      ).rejects.toThrow()
    })

    it('allows adjacent, non-overlapping windows', async () => {
      const fx = await fxCtx()
      const from = 'USD'
      await quotationReferenceRepository.createExchangeRate(fx, {
        fromCurrency: from,
        toCurrency: 'INR',
        rate: 83,
        effectiveFrom: new Date('2026-03-01'),
        effectiveTo: new Date('2026-04-01'),
      })
      await expect(
        quotationReferenceRepository.createExchangeRate(fx, {
          fromCurrency: from,
          toCurrency: 'INR',
          rate: 84,
          effectiveFrom: new Date('2026-04-01'),
          effectiveTo: new Date('2026-05-01'),
        }),
      ).resolves.toBeTruthy()
    })

    it('rejects a non-positive rate', async () => {
      await expect(
        quotationReferenceRepository.createExchangeRate(await fxCtx(), {
          fromCurrency: 'USD',
          toCurrency: 'INR',
          rate: 0,
          effectiveFrom: new Date('2026-03-01'),
        }),
      ).rejects.toThrow()
    })

    it('rejects a rate between identical currencies', async () => {
      await expect(
        quotationReferenceRepository.createExchangeRate(ctx, {
          fromCurrency: 'INR',
          toCurrency: 'INR',
          rate: 1,
          effectiveFrom: new Date('2026-03-01'),
        }),
      ).rejects.toThrow()
    })
  })

  describe('audit trail', () => {
    it('writes an audit entry for every mutation', async () => {
      const q = await quotationRepository.create(ctx, header(), [line()], totals())
      await quotationRepository.mutate(ctx, q.id, q.version, { title: 'Audited' })

      const entries = await prisma.auditLog.findMany({
        where: { organizationId, entityType: 'Quotation', entityId: q.id },
        orderBy: { createdAt: 'asc' },
        select: { action: true, actorId: true, requestId: true },
      })
      expect(entries.map((e) => e.action)).toEqual(['quotation.created', 'quotation.updated'])
      expect(entries.every((e) => e.actorId === ctx.actorId)).toBe(true)
      expect(entries.every((e) => e.requestId === 'quote-it')).toBe(true)
    })
  })
})
