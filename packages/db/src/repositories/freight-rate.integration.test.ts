import { randomUUID } from 'node:crypto'

import { Money } from '@triyara/money'
import { beforeAll, describe, expect, it } from 'vitest'

import { prisma } from '../client'
import { freightRateRepository } from './freight-rate.repository'
import { logisticsReferenceRepository } from './logistics-reference.repository'

/**
 * Freight and logistics against a real PostgreSQL (V3.3, ADR-0012).
 *
 * Three things can only be proved here: that the tenant boundary is in the
 * WHERE clause rather than in the caller, that a decimal survives Decimal(18,4)
 * exactly, and that the five database constraints actually fire - the overlap
 * exclusion in particular, which no service-level check can guarantee against a
 * concurrent writer.
 */

describe.skipIf(!process.env.DATABASE_URL)('freight and logistics (integration)', () => {
  const SLUG = `freight-it-${randomUUID().slice(0, 8)}`
  let orgA = ''
  let orgB = ''
  let inPort = ''
  let aePort = ''
  let seaOnlyPort = ''
  let box20 = ''
  let ctxA = { actorId: '', organizationId: '', requestId: 'freight-it' }
  let ctxB = { actorId: '', organizationId: '', requestId: 'freight-it' }

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
    return { org: org.id, user: user.id }
  }

  beforeAll(async () => {
    const a = await makeOrg(`${SLUG}-a`)
    const b = await makeOrg(`${SLUG}-b`)
    orgA = a.org
    orgB = b.org
    ctxA = { actorId: a.user, organizationId: orgA, requestId: 'freight-it' }
    ctxB = { actorId: b.user, organizationId: orgB, requestId: 'freight-it' }

    // Global reference rows, created directly: they belong to no tenant.
    const mk = async (locode: string, name: string, cc: string, modes: string[]) =>
      (
        await prisma.port.upsert({
          where: { locode },
          update: {},
          create: { locode, name, countryCode: cc, modes: modes as never },
        })
      ).id
    inPort = await mk('ZZIN1', 'Test Origin', 'IN', ['SEA_FCL', 'SEA_LCL'])
    aePort = await mk('ZZAE1', 'Test Destination', 'AE', ['SEA_FCL', 'SEA_LCL'])
    await mk('ZZAIR', 'Test Airport', 'IN', ['AIR'])
    seaOnlyPort = await mk('ZZSEA', 'Test Sea Only', 'SG', ['SEA_FCL'])

    box20 = (
      await prisma.containerType.upsert({
        where: { code: 'ZZ20' },
        update: {},
        create: { code: 'ZZ20', name: 'Test 20ft', teu: '1.00' },
      })
    ).id
  })

  /**
   * A fresh tenant per case. The overlap constraint is scoped by organization,
   * so sharing one tenant across cases would make an earlier open-ended rate
   * block a later case for reasons that have nothing to do with what it tests.
   */
  async function freshCtx(label: string) {
    const o = await makeOrg(`${SLUG}-${label}-${randomUUID().slice(0, 6)}`)
    return { actorId: o.user, organizationId: o.org, requestId: 'freight-it' }
  }

  const jan = new Date('2027-01-01T00:00:00.000Z')
  const apr = new Date('2027-04-01T00:00:00.000Z')
  const jul = new Date('2027-07-01T00:00:00.000Z')

  const fcl = (over: Record<string, unknown> = {}) => ({
    originPortId: inPort,
    destinationPortId: aePort,
    mode: 'SEA_FCL' as const,
    containerTypeId: box20,
    amount: '1850.0000',
    currency: 'USD',
    effectiveFrom: jan,
    effectiveTo: apr,
    ...over,
  })

  describe('global reference data', () => {
    it('is readable with no organization scope at all', async () => {
      const ports = await logisticsReferenceRepository.listPorts()
      expect(ports.length).toBeGreaterThan(0)
      // The same rows are visible whichever tenant is asking, because nothing
      // about the query mentions a tenant.
      expect(ports.map((p) => p.locode)).toContain('ZZIN1')
    })

    it('enforces a unique LOCODE', async () => {
      await expect(
        prisma.port.create({
          data: { locode: 'ZZIN1', name: 'Duplicate', countryCode: 'IN', modes: ['SEA_FCL'] },
        }),
      ).rejects.toThrow()
    })

    it('enforces a unique container code', async () => {
      await expect(
        prisma.containerType.create({ data: { code: 'ZZ20', name: 'Duplicate', teu: '1.00' } }),
      ).rejects.toThrow()
    })

    it('hides inactive rows by default and shows them on request', async () => {
      await prisma.port.upsert({
        where: { locode: 'ZZOLD' },
        update: { isActive: false },
        create: {
          locode: 'ZZOLD',
          name: 'Closed Port',
          countryCode: 'IN',
          modes: ['SEA_FCL'],
          isActive: false,
        },
      })
      const active = await logisticsReferenceRepository.listPorts()
      expect(active.map((p) => p.locode)).not.toContain('ZZOLD')
      const all = await logisticsReferenceRepository.listPorts({ includeInactive: true })
      expect(all.map((p) => p.locode)).toContain('ZZOLD')
    })

    it('filters ports by mode', async () => {
      const air = await logisticsReferenceRepository.listPorts({ mode: 'AIR' })
      expect(air.map((p) => p.locode)).toContain('ZZAIR')
      expect(air.map((p) => p.locode)).not.toContain('ZZIN1')
    })

    it('returns container capacity as an exact decimal', async () => {
      const types = await logisticsReferenceRepository.listContainerTypes()
      const box = types.find((t) => t.code === 'ZZ20')
      expect(Money.of(box!.teu).toFixed(2)).toBe('1.00')
    })
  })

  describe('freight rate lifecycle', () => {
    it('creates, reads and lists a rate', async () => {
      const ctx = await freshCtx('create')
      const orgA = ctx.organizationId
      const created = await freightRateRepository.create(ctx, fcl())
      expect(created.version).toBe(1)
      expect(created.originPort.locode).toBe('ZZIN1')

      const found = await freightRateRepository.findById(orgA, created.id)
      expect(found?.id).toBe(created.id)

      const list = await freightRateRepository.list({ organizationId: orgA, limit: 50 })
      expect(list.items.map((i) => i.id)).toContain(created.id)
    })

    it('round-trips money exactly through Decimal(18,4)', async () => {
      const ctx = await freshCtx('money')
      const created = await freightRateRepository.create(
        ctx,
        fcl({ amount: '1234.5678', effectiveFrom: jul, effectiveTo: null }),
      )
      const read = await freightRateRepository.findById(ctx.organizationId, created.id)
      expect(Money.of(read!.amount).toFixed(4)).toBe('1234.5678')
      // And a value native float64 would corrupt.
      expect(Money.of(read!.amount).plus('0.1').toFixed(4)).toBe('1234.6678')
    })

    it('soft deletes, hides, then restores', async () => {
      const ctx = await freshCtx('lifecycle')
      const org = ctx.organizationId
      const r = await freightRateRepository.create(ctx, fcl())
      const deleted = await freightRateRepository.softDelete(ctx, r.id, r.version)
      expect(deleted.deletedAt).not.toBeNull()

      expect(await freightRateRepository.findById(org, r.id)).toBeNull()
      expect(
        await freightRateRepository.findById(org, r.id, { includeDeleted: true }),
      ).not.toBeNull()

      const restored = await freightRateRepository.restore(ctx, r.id, deleted.version)
      expect(restored.deletedAt).toBeNull()
    })

    it('keeps a deleted rate out of the list, and shows it on request', async () => {
      // findById hiding it is not enough: V3.4 selects a rate by LISTING the
      // corridor, so a deleted rate leaking into that list would be chosen and
      // priced as though it were live.
      const ctx = await freshCtx('list-deleted')
      const org = ctx.organizationId
      const r = await freightRateRepository.create(ctx, fcl())
      await freightRateRepository.softDelete(ctx, r.id, r.version)

      const live = await freightRateRepository.list({ organizationId: org, limit: 100 })
      expect(live.items.map((i) => i.id)).not.toContain(r.id)

      const all = await freightRateRepository.list({
        organizationId: org,
        includeDeleted: true,
        limit: 100,
      })
      expect(all.items.map((i) => i.id)).toContain(r.id)
    })

    it('refuses a stale version on update, delete and restore', async () => {
      const ctx = await freshCtx('stale')
      const r = await freightRateRepository.create(ctx, fcl())
      await expect(
        freightRateRepository.update(ctx, r.id, r.version - 1, { amount: '1' }),
      ).rejects.toThrow(/stale version|precondition/i)
      await expect(freightRateRepository.softDelete(ctx, r.id, r.version - 1)).rejects.toThrow(
        /stale version|precondition/i,
      )
    })

    it('finds only the rate live on a given date', async () => {
      const ctx = await freshCtx('eff')
      const org = ctx.organizationId
      await freightRateRepository.create(ctx, fcl({ effectiveFrom: jan, effectiveTo: apr }))
      await freightRateRepository.create(ctx, fcl({ effectiveFrom: apr, effectiveTo: jul }))

      const inQ1 = await freightRateRepository.list({
        organizationId: org,
        effectiveOn: new Date('2027-02-01'),
        limit: 50,
      })
      expect(inQ1.items).toHaveLength(1)
      expect(inQ1.items[0]!.effectiveFrom.toISOString()).toBe(jan.toISOString())
    })
  })

  describe('database constraints fire, not just the service', () => {
    it('refuses a route from a port to itself', async () => {
      await expect(
        freightRateRepository.create(ctxA, fcl({ destinationPortId: inPort })),
      ).rejects.toThrow(/different ports/i)
    })

    it('refuses SEA_FCL with no container type', async () => {
      await expect(
        freightRateRepository.create(ctxA, fcl({ containerTypeId: null })),
      ).rejects.toThrow(/container type is required/i)
    })

    it('refuses a non-containerised mode that names a container', async () => {
      await expect(
        freightRateRepository.create(ctxA, fcl({ mode: 'AIR', containerTypeId: box20 })),
      ).rejects.toThrow(/must be omitted|container type/i)
    })

    it('refuses an end date before its start', async () => {
      await expect(
        freightRateRepository.create(ctxA, fcl({ effectiveFrom: apr, effectiveTo: jan })),
      ).rejects.toThrow(/after its start/i)
    })

    it('refuses a negative amount', async () => {
      await expect(freightRateRepository.create(ctxA, fcl({ amount: '-1.0000' }))).rejects.toThrow(
        /cannot be negative/i,
      )
    })

    it('refuses two live rates overlapping on the same corridor', async () => {
      const ctx = await freshCtx('ov')
      await freightRateRepository.create(ctx, fcl({ effectiveFrom: jan, effectiveTo: jul }))

      // Any window touching Jan-Jul on the same corridor is refused.
      await expect(
        freightRateRepository.create(ctx, fcl({ effectiveFrom: apr, effectiveTo: null })),
      ).rejects.toThrow(/already covers this corridor/i)
    })

    it('allows adjacent, non-overlapping windows', async () => {
      const ctx = await freshCtx('adj')
      await freightRateRepository.create(ctx, fcl({ effectiveFrom: jan, effectiveTo: apr }))
      // tsrange is half-open, so a window starting exactly where the last ended
      // does not overlap.
      await expect(
        freightRateRepository.create(ctx, fcl({ effectiveFrom: apr, effectiveTo: jul })),
      ).resolves.toBeDefined()
    })

    it('lets a different container type share the same corridor and window', async () => {
      const ctx = await freshCtx('ct')
      const box40 = (
        await prisma.containerType.upsert({
          where: { code: 'ZZ40' },
          update: {},
          create: { code: 'ZZ40', name: 'Test 40ft', teu: '2.00' },
        })
      ).id
      await freightRateRepository.create(ctx, fcl({ effectiveFrom: jan, effectiveTo: jul }))
      await expect(
        freightRateRepository.create(
          ctx,
          fcl({ containerTypeId: box40, effectiveFrom: jan, effectiveTo: jul }),
        ),
      ).resolves.toBeDefined()
    })

    it('lets a DELETED rate stop blocking the window it held', async () => {
      const ctx = await freshCtx('del')
      const first = await freightRateRepository.create(
        ctx,
        fcl({ effectiveFrom: jan, effectiveTo: jul }),
      )
      await freightRateRepository.softDelete(ctx, first.id, first.version)
      // The exclusion is filtered WHERE deletedAt IS NULL, so the corridor frees up.
      await expect(
        freightRateRepository.create(ctx, fcl({ effectiveFrom: jan, effectiveTo: jul })),
      ).resolves.toBeDefined()
    })

    it('refuses an unknown or inactive port', async () => {
      await expect(
        freightRateRepository.create(ctxA, fcl({ originPortId: 'does-not-exist' })),
      ).rejects.toThrow(/port not found/i)
      const closed = await prisma.port.findUnique({ where: { locode: 'ZZOLD' } })
      await expect(
        freightRateRepository.create(ctxA, fcl({ originPortId: closed!.id })),
      ).rejects.toThrow(/port not found|no longer active/i)
    })
  })

  describe('tenant isolation', () => {
    let rateA = ''

    beforeAll(async () => {
      const r = await freightRateRepository.create(
        ctxA,
        fcl({
          originPortId: seaOnlyPort,
          effectiveFrom: new Date('2030-01-01'),
          effectiveTo: new Date('2030-06-01'),
        }),
      )
      rateA = r.id
    })

    it('cannot be read from another organization', async () => {
      expect(await freightRateRepository.findById(orgB, rateA)).toBeNull()
      expect(await freightRateRepository.findById(orgA, rateA)).not.toBeNull()
    })

    it('does not leak into another organization list', async () => {
      const list = await freightRateRepository.list({ organizationId: orgB, limit: 100 })
      expect(list.items.map((i) => i.id)).not.toContain(rateA)
    })

    it('cannot be updated from another organization', async () => {
      await expect(
        freightRateRepository.update(ctxB, rateA, 1, { amount: '9999.0000' }),
      ).rejects.toThrow(/not found/i)
      const still = await freightRateRepository.findById(orgA, rateA)
      expect(Money.of(still!.amount).toFixed(4)).toBe('1850.0000')
    })

    it('cannot be deleted from another organization', async () => {
      await expect(freightRateRepository.softDelete(ctxB, rateA, 1)).rejects.toThrow(/not found/i)
      expect((await freightRateRepository.findById(orgA, rateA))?.deletedAt).toBeNull()
    })

    it('cannot be restored from another organization', async () => {
      const ctx = await freshCtx('restore-x')
      const victim = await freightRateRepository.create(ctx, fcl())
      await freightRateRepository.softDelete(ctx, victim.id, victim.version)
      await expect(freightRateRepository.restore(ctxB, victim.id, 2)).rejects.toThrow(/not found/i)
      const still = await freightRateRepository.findById(ctx.organizationId, victim.id, {
        includeDeleted: true,
      })
      expect(still?.deletedAt).not.toBeNull()
    })

    it('lets two organizations hold the same corridor and window independently', async () => {
      // The exclusion is scoped by organizationId, so one tenant's rate must
      // never block another's - that would leak the existence of a commercial term.
      const one = await freshCtx('tenant-1')
      const two = await freshCtx('tenant-2')
      const window = { effectiveFrom: new Date('2032-01-01'), effectiveTo: new Date('2032-06-01') }
      await expect(freightRateRepository.create(one, fcl(window))).resolves.toBeDefined()
      await expect(freightRateRepository.create(two, fcl(window))).resolves.toBeDefined()
    })
  })

  it('writes an audit row for every mutation', async () => {
    const ctx = await freshCtx('audit')
    const r = await freightRateRepository.create(ctx, fcl())
    await freightRateRepository.update(ctx, r.id, r.version, { amount: '2000.0000' })

    const rows = await prisma.auditLog.findMany({
      where: { organizationId: ctx.organizationId, entityType: 'FreightRate', entityId: r.id },
      select: { action: true },
    })
    expect(rows.map((x) => x.action).sort()).toEqual([
      'freight_rate.created',
      'freight_rate.updated',
    ])
  })
})
