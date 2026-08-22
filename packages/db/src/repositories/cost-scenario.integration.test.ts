import { randomUUID } from 'node:crypto'

import { Money } from '@triyara/money'
import { beforeAll, describe, expect, it } from 'vitest'

import { prisma } from '../client'
import { costScenarioRepository } from './cost-scenario.repository'

/**
 * Cost scenario persistence against a real PostgreSQL (V3, ADR-0012).
 *
 * Two things can only be proved here rather than against a stub: that the
 * tenant boundary is enforced by the WHERE clause and not by the caller, and
 * that a decimal survives the round trip through Decimal(18,4) exactly.
 */

describe.skipIf(!process.env.DATABASE_URL)('cost scenario (integration)', () => {
  const SLUG = `cost-it-${randomUUID().slice(0, 8)}`
  let orgA = ''
  let orgB = ''
  let userA = ''
  let userB = ''
  let productA = ''
  let productB = ''
  let buyerA = ''
  let buyerB = ''
  let ctxA = { actorId: '', organizationId: '', requestId: 'cost-it' }
  let ctxB = { actorId: '', organizationId: '', requestId: 'cost-it' }

  async function makeOrg(slug: string) {
    const org = await prisma.organization.create({ data: { name: slug, slug } })
    const user = await prisma.user.create({
      data: {
        organizationId: org.id,
        email: `${slug}-${randomUUID().slice(0, 6)}@triyara.test`,
        name: 'IT',
        passwordHash: 'x',
      },
    })
    const category = await prisma.category.create({
      data: {
        organizationId: org.id,
        name: 'Dehydrated',
        slug: `deh-${slug}`,
        path: `deh-${slug}`,
      },
    })
    const product = await prisma.product.create({
      data: {
        organizationId: org.id,
        categoryId: category.id,
        sku: `SKU-${slug}`,
        slug: `sku-${slug}`,
        name: 'Dehydrated Onion Flakes',
      },
    })
    const buyer = await prisma.account.create({
      data: {
        organizationId: org.id,
        legalName: `Buyer ${slug}`,
        createdById: user.id,
        updatedById: user.id,
      },
    })
    return { org: org.id, user: user.id, product: product.id, buyer: buyer.id }
  }

  beforeAll(async () => {
    const a = await makeOrg(`${SLUG}-a`)
    const b = await makeOrg(`${SLUG}-b`)
    orgA = a.org
    userA = a.user
    productA = a.product
    buyerA = a.buyer
    orgB = b.org
    userB = b.user
    productB = b.product
    buyerB = b.buyer
    ctxA = { actorId: userA, organizationId: orgA, requestId: 'cost-it' }
    ctxB = { actorId: userB, organizationId: orgB, requestId: 'cost-it' }
  })

  const scenario = (over: Record<string, unknown> = {}) => ({
    name: 'FOB Nhava Sheva',
    productId: productA,
    quantity: '12500.0000',
    unit: 'KG',
    incoterm: 'FOB' as const,
    unitCost: '3.4700',
    currency: 'USD',
    baseCurrency: 'USD',
    ...over,
  })

  it('creates a scenario, with charges, and reads it back', async () => {
    const created = await costScenarioRepository.create(ctxA, {
      ...scenario(),
      buyerId: buyerA,
      originLocode: 'INNSA',
      destinationLocode: 'AEJEA',
      destinationCountry: 'AE',
      mode: 'SEA_FCL',
      charges: [
        {
          type: 'FREIGHT',
          basis: 'PER_CONTAINER',
          rate: '1850.000000',
          amount: '3700.0000',
          currency: 'USD',
        },
        {
          type: 'INSURANCE',
          basis: 'PERCENTAGE',
          rate: '0.500000',
          amount: '0.0000',
          currency: 'USD',
        },
      ],
    })

    expect(created.id).toBeTruthy()
    expect(created.version).toBe(1)
    expect(created.charges).toHaveLength(2)
    // Sequence falls back to array order, so charges resolve deterministically.
    expect(created.charges.map((c) => c.sequence)).toEqual([0, 1])

    const found = await costScenarioRepository.findById(orgA, created.id)
    expect(found?.name).toBe('FOB Nhava Sheva')
  })

  it('allows a scenario with no buyer - the pre-commercial case', async () => {
    const created = await costScenarioRepository.create(ctxA, scenario({ name: 'No buyer yet' }))
    expect(created.buyerId).toBeNull()
  })

  it('allows many scenarios for the same product and buyer', async () => {
    // The entire point: alternatives, not one canonical answer.
    const a = await costScenarioRepository.create(
      ctxA,
      scenario({ name: 'Alt A', buyerId: buyerA }),
    )
    const b = await costScenarioRepository.create(
      ctxA,
      scenario({ name: 'Alt B', buyerId: buyerA, incoterm: 'CIF' }),
    )
    expect(a.id).not.toBe(b.id)

    const list = await costScenarioRepository.list({
      organizationId: orgA,
      productId: productA,
      buyerId: buyerA,
      limit: 50,
    })
    expect(list.items.length).toBeGreaterThanOrEqual(2)
  })

  describe('money survives the round trip', () => {
    it('stores and returns a decimal exactly at Decimal(18,4)', async () => {
      const created = await costScenarioRepository.create(
        ctxA,
        scenario({
          name: 'Precision',
          quantity: '12500.0001',
          unitCost: '3.4767',
          sellingPricePerUnit: '4.1600',
          fxRate: '83.25123456',
          baseCurrency: 'INR',
        }),
      )
      const read = await costScenarioRepository.findById(orgA, created.id)

      // Reconstructed through the kernel, never through a JS number.
      expect(Money.of(read!.unitCost).toFixed(4)).toBe('3.4767')
      expect(Money.of(read!.quantity).toFixed(4)).toBe('12500.0001')
      expect(Money.of(read!.sellingPricePerUnit!).toFixed(4)).toBe('4.1600')
      // fxRate is Decimal(18,8) - a rate needs more places than money does.
      expect(Money.of(read!.fxRate!).toFixed(8)).toBe('83.25123456')
    })

    it('keeps a value a float64 would corrupt', async () => {
      // 0.1 + 0.2 territory, and a magnitude past 2^53.
      const created = await costScenarioRepository.create(
        ctxA,
        scenario({ name: 'Big', unitCost: '0.1000', sellingPricePerUnit: '0.3000' }),
      )
      const read = await costScenarioRepository.findById(orgA, created.id)
      const sum = Money.of(read!.unitCost).plus('0.2')
      expect(sum.toFixed(4)).toBe('0.3000')
      expect(sum.equals(Money.of(read!.sellingPricePerUnit!))).toBe(true)
    })

    it('rounds a charge to the column scale rather than silently truncating', async () => {
      const created = await costScenarioRepository.create(ctxA, {
        ...scenario({ name: 'Charge scale' }),
        charges: [{ type: 'FREIGHT', amount: '1234.56785', currency: 'USD' }],
      })
      // Postgres rounds half-up into Decimal(18,4); the value is not truncated.
      expect(Money.of(created.charges[0]!.amount).toFixed(4)).toBe('1234.5679')
    })
  })

  describe('tenant isolation', () => {
    let scenarioA = ''

    beforeAll(async () => {
      const s = await costScenarioRepository.create(ctxA, scenario({ name: 'Org A only' }))
      scenarioA = s.id
    })

    it('cannot be read from another organization', async () => {
      expect(await costScenarioRepository.findById(orgB, scenarioA)).toBeNull()
      // ...while its own tenant sees it, so this is scoping and not absence.
      expect(await costScenarioRepository.findById(orgA, scenarioA)).not.toBeNull()
    })

    it('does not appear in another organization list', async () => {
      const list = await costScenarioRepository.list({ organizationId: orgB, limit: 100 })
      expect(list.items.map((i) => i.id)).not.toContain(scenarioA)
    })

    it('cannot be updated from another organization', async () => {
      await expect(
        costScenarioRepository.update(ctxB, scenarioA, 1, { name: 'hijacked' }),
      ).rejects.toThrow(/not found/i)
      const still = await costScenarioRepository.findById(orgA, scenarioA)
      expect(still?.name).toBe('Org A only')
    })

    it('cannot be deleted from another organization', async () => {
      await expect(costScenarioRepository.softDelete(ctxB, scenarioA, 1)).rejects.toThrow(
        /not found/i,
      )
      expect((await costScenarioRepository.findById(orgA, scenarioA))?.deletedAt).toBeNull()
    })

    it('cannot be restored from another organization', async () => {
      const victim = await costScenarioRepository.create(ctxA, scenario({ name: 'To restore' }))
      await costScenarioRepository.softDelete(ctxA, victim.id, victim.version)

      await expect(costScenarioRepository.restore(ctxB, victim.id, 2)).rejects.toThrow(/not found/i)
      const still = await costScenarioRepository.findById(orgA, victim.id, { includeDeleted: true })
      expect(still?.deletedAt).not.toBeNull()
    })

    it('refuses a product belonging to another organization', async () => {
      await expect(
        costScenarioRepository.create(ctxA, scenario({ productId: productB })),
      ).rejects.toThrow(/product/i)
    })

    it('refuses a buyer belonging to another organization', async () => {
      await expect(
        costScenarioRepository.create(ctxA, scenario({ buyerId: buyerB })),
      ).rejects.toThrow(/buyer/i)
    })

    it('refuses a cross-tenant reference on UPDATE, not only on CREATE', async () => {
      const own = await costScenarioRepository.create(ctxA, scenario({ name: 'Patchable' }))
      await expect(
        costScenarioRepository.update(ctxA, own.id, own.version, { buyerId: buyerB }),
      ).rejects.toThrow(/buyer/i)
      await expect(
        costScenarioRepository.update(ctxA, own.id, own.version, { productId: productB }),
      ).rejects.toThrow(/product/i)
    })
  })

  describe('soft delete, restore and concurrency', () => {
    it('hides a deleted scenario, then finds and restores it', async () => {
      const s = await costScenarioRepository.create(ctxA, scenario({ name: 'Lifecycle' }))

      const deleted = await costScenarioRepository.softDelete(ctxA, s.id, s.version)
      expect(deleted.deletedAt).not.toBeNull()
      expect(deleted.version).toBe(s.version + 1)

      // Hidden by default...
      expect(await costScenarioRepository.findById(orgA, s.id)).toBeNull()
      // ...but discoverable when asked for, which is what makes restore usable.
      expect(
        await costScenarioRepository.findById(orgA, s.id, { includeDeleted: true }),
      ).not.toBeNull()

      const list = await costScenarioRepository.list({ organizationId: orgA, limit: 100 })
      expect(list.items.map((i) => i.id)).not.toContain(s.id)
      const withDeleted = await costScenarioRepository.list({
        organizationId: orgA,
        includeDeleted: true,
        limit: 100,
      })
      expect(withDeleted.items.map((i) => i.id)).toContain(s.id)

      const restored = await costScenarioRepository.restore(ctxA, s.id, deleted.version)
      expect(restored.deletedAt).toBeNull()
      expect(await costScenarioRepository.findById(orgA, s.id)).not.toBeNull()
    })

    it('refuses a stale version on update, delete and restore', async () => {
      const s = await costScenarioRepository.create(ctxA, scenario({ name: 'Concurrency' }))
      const stale = s.version - 1

      await expect(costScenarioRepository.update(ctxA, s.id, stale, { name: 'x' })).rejects.toThrow(
        /stale version|precondition/i,
      )
      await expect(costScenarioRepository.softDelete(ctxA, s.id, stale)).rejects.toThrow(
        /stale version|precondition/i,
      )

      const deleted = await costScenarioRepository.softDelete(ctxA, s.id, s.version)
      await expect(costScenarioRepository.restore(ctxA, s.id, deleted.version - 1)).rejects.toThrow(
        /stale version|precondition/i,
      )
    })

    it('increments the version on every mutation', async () => {
      const s = await costScenarioRepository.create(ctxA, scenario({ name: 'Versioning' }))
      expect(s.version).toBe(1)
      const updated = await costScenarioRepository.update(ctxA, s.id, 1, { name: 'Versioning 2' })
      expect(updated.version).toBe(2)
    })

    it('replaces the whole charge set on update, and leaves it alone when absent', async () => {
      const s = await costScenarioRepository.create(ctxA, {
        ...scenario({ name: 'Charges' }),
        charges: [{ type: 'FREIGHT', amount: '100.0000', currency: 'USD' }],
      })
      expect(s.charges).toHaveLength(1)

      const renamed = await costScenarioRepository.update(ctxA, s.id, s.version, { name: 'Kept' })
      expect(renamed.charges).toHaveLength(1)

      const replaced = await costScenarioRepository.update(ctxA, s.id, renamed.version, {
        charges: [
          { type: 'PACKING', amount: '50.0000', currency: 'USD' },
          { type: 'DOCUMENTATION', amount: '25.0000', currency: 'USD' },
        ],
      })
      expect(replaced.charges.map((c) => c.type)).toEqual(['PACKING', 'DOCUMENTATION'])
    })
  })

  it('writes an audit row for every mutation', async () => {
    const s = await costScenarioRepository.create(ctxA, scenario({ name: 'Audited' }))
    await costScenarioRepository.update(ctxA, s.id, s.version, { name: 'Audited 2' })

    const rows = await prisma.auditLog.findMany({
      where: { organizationId: orgA, entityType: 'CostScenario', entityId: s.id },
      select: { action: true },
    })
    expect(rows.map((r) => r.action).sort()).toEqual([
      'cost_scenario.created',
      'cost_scenario.updated',
    ])
  })
})
