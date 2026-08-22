import { randomUUID } from 'node:crypto'

import { resolveFreightRate } from '@triyara/core'
import { Money } from '@triyara/money'
import { beforeAll, describe, expect, it } from 'vitest'

import { prisma } from '../client'
import { costScenarioRepository } from './cost-scenario.repository'
import { freightRateRepository } from './freight-rate.repository'
import { logisticsReferenceRepository } from './logistics-reference.repository'

/**
 * Rate selection against a real PostgreSQL (V3.4).
 *
 * Two things only a database can prove: that one tenant's rate is invisible to
 * another's resolution even on an identical corridor, and that the effective
 * window really excludes a rate whose period has passed.
 */

describe.skipIf(!process.env.DATABASE_URL)('freight resolution (integration)', () => {
  const SLUG = `resolve-it-${randomUUID().slice(0, 8)}`
  let orgA = ''
  let orgB = ''
  let inPort = ''
  let aePort = ''
  let box20 = ''
  let productA = ''
  let ctxA = { actorId: '', organizationId: '', requestId: 'resolve-it' }
  let ctxB = { actorId: '', organizationId: '', requestId: 'resolve-it' }

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
      data: { organizationId: org.id, name: 'C', slug: `c-${slug}`, path: `c-${slug}` },
    })
    const product = await prisma.product.create({
      data: {
        organizationId: org.id,
        categoryId: category.id,
        sku: `SKU-${slug}`,
        slug: `sku-${slug}`,
        name: 'P',
      },
    })
    return { org: org.id, user: user.id, product: product.id }
  }

  beforeAll(async () => {
    const a = await makeOrg(`${SLUG}-a`)
    const b = await makeOrg(`${SLUG}-b`)
    orgA = a.org
    productA = a.product
    orgB = b.org
    ctxA = { actorId: a.user, organizationId: orgA, requestId: 'resolve-it' }
    ctxB = { actorId: b.user, organizationId: orgB, requestId: 'resolve-it' }

    const mk = async (locode: string, name: string, cc: string, modes: string[]) =>
      (
        await prisma.port.upsert({
          where: { locode },
          update: {},
          create: { locode, name, countryCode: cc, modes: modes as never },
        })
      ).id
    inPort = await mk('YYIN1', 'Resolve Origin', 'IN', ['SEA_FCL', 'SEA_LCL'])
    aePort = await mk('YYAE1', 'Resolve Destination', 'AE', ['SEA_FCL', 'SEA_LCL'])
    box20 = (
      await prisma.containerType.upsert({
        where: { code: 'YY20' },
        update: {},
        create: { code: 'YY20', name: 'Resolve 20ft', teu: '1.00' },
      })
    ).id
  })

  const q1 = new Date('2027-01-01T00:00:00.000Z')
  const q2 = new Date('2027-04-01T00:00:00.000Z')
  const midQ1 = new Date('2027-02-15T00:00:00.000Z')
  const midQ2 = new Date('2027-05-15T00:00:00.000Z')

  const rateFor = (over: Record<string, unknown> = {}) => ({
    originPortId: inPort,
    destinationPortId: aePort,
    mode: 'SEA_FCL' as const,
    containerTypeId: box20,
    amount: '1850.0000',
    currency: 'USD',
    effectiveFrom: q1,
    effectiveTo: q2,
    ...over,
  })

  const lookup = (organizationId: string, effectiveAt: Date) =>
    resolveFreightRate(freightRateRepository, {
      organizationId,
      originPortId: inPort,
      destinationPortId: aePort,
      mode: 'SEA_FCL',
      containerTypeId: box20,
      effectiveAt,
    })

  it('resolves a rate that is live on the date', async () => {
    await freightRateRepository.create(ctxA, rateFor())
    const result = await lookup(orgA, midQ1)
    expect(result.status).toBe('RESOLVED')
    if (result.status === 'RESOLVED') {
      expect(Money.of(result.rate.amount).toFixed(4)).toBe('1850.0000')
      expect(result.rate.originPort.locode).toBe('YYIN1')
    }
  })

  it('does not resolve a rate whose window has passed', async () => {
    // The Q1 rate exists but Q2 is outside it, and nothing else covers Q2.
    expect(await lookup(orgA, midQ2)).toEqual({ status: 'UNRESOLVED', reason: 'NO_RATE' })
  })

  it('picks the right one of two adjacent windows', async () => {
    await freightRateRepository.create(
      ctxA,
      rateFor({ effectiveFrom: q2, effectiveTo: null, amount: '2100.0000' }),
    )
    const first = await lookup(orgA, midQ1)
    const second = await lookup(orgA, midQ2)
    expect(first.status).toBe('RESOLVED')
    expect(second.status).toBe('RESOLVED')
    if (first.status === 'RESOLVED')
      expect(Money.of(first.rate.amount).toFixed(4)).toBe('1850.0000')
    if (second.status === 'RESOLVED')
      expect(Money.of(second.rate.amount).toFixed(4)).toBe('2100.0000')
  })

  it('excludes a soft-deleted rate', async () => {
    const ctx = { ...ctxA, organizationId: (await makeOrg(`${SLUG}-del`)).org }
    const r = await freightRateRepository.create(ctx, rateFor())
    expect((await lookup(ctx.organizationId, midQ1)).status).toBe('RESOLVED')

    await freightRateRepository.softDelete(ctx, r.id, r.version)
    expect(await lookup(ctx.organizationId, midQ1)).toEqual({
      status: 'UNRESOLVED',
      reason: 'NO_RATE',
    })
  })

  describe('tenant isolation', () => {
    it('org B cannot resolve org A rate on the same corridor', async () => {
      // org A has rates for this corridor from the cases above; org B has none.
      expect(await lookup(orgB, midQ1)).toEqual({ status: 'UNRESOLVED', reason: 'NO_RATE' })
    })

    it('each organization resolves its own rate on an identical corridor', async () => {
      const one = { ...ctxA, organizationId: (await makeOrg(`${SLUG}-t1`)).org }
      const two = { ...ctxB, organizationId: (await makeOrg(`${SLUG}-t2`)).org }
      await freightRateRepository.create(one, rateFor({ amount: '1111.0000' }))
      await freightRateRepository.create(two, rateFor({ amount: '2222.0000' }))

      const a = await lookup(one.organizationId, midQ1)
      const b = await lookup(two.organizationId, midQ1)
      expect(a.status).toBe('RESOLVED')
      expect(b.status).toBe('RESOLVED')
      if (a.status === 'RESOLVED') expect(Money.of(a.rate.amount).toFixed(4)).toBe('1111.0000')
      if (b.status === 'RESOLVED') expect(Money.of(b.rate.amount).toFixed(4)).toBe('2222.0000')
    })
  })

  describe('LOCODE and Port FK coexist - V3.3 backward compatibility', () => {
    const scenario = (over: Record<string, unknown> = {}) => ({
      name: 'Resolution',
      productId: productA,
      quantity: '1000.0000',
      unit: 'KG',
      incoterm: 'FOB' as const,
      unitCost: '2.0000',
      currency: 'USD',
      baseCurrency: 'USD',
      ...over,
    })

    it('stores a scenario carrying only a LOCODE, exactly as V3.2 did', async () => {
      const s = await costScenarioRepository.create(
        ctxA,
        scenario({ originLocode: 'YYIN1', destinationLocode: 'YYAE1' }),
      )
      expect(s.originLocode).toBe('YYIN1')
      // The repository does not resolve - that is the service's job. The record
      // remains valid either way, which is what keeps historical rows working.
      expect(s.originPortId).toBeNull()
    })

    it('stores a scenario carrying Port ids', async () => {
      const s = await costScenarioRepository.create(
        ctxA,
        scenario({ originPortId: inPort, destinationPortId: aePort, containerTypeId: box20 }),
      )
      expect(s.originPortId).toBe(inPort)
      expect(s.originPort?.locode).toBe('YYIN1')
      expect(s.containerType?.code).toBe('YY20')
    })

    it('accepts a historical scenario with neither, and reports why no rate resolves', async () => {
      const s = await costScenarioRepository.create(ctxA, scenario())
      expect(s.originPortId).toBeNull()
      expect(s.ratesEffectiveOn).toBeNull()

      const result = await resolveFreightRate(freightRateRepository, {
        organizationId: orgA,
        originPortId: s.originPortId,
        destinationPortId: s.destinationPortId,
        mode: s.mode,
        containerTypeId: s.containerTypeId,
        effectiveAt: s.ratesEffectiveOn,
      })
      // Named, not a silent null - and specifically the FIRST missing thing.
      expect(result).toEqual({ status: 'UNRESOLVED', reason: 'MISSING_PORTS' })
    })

    it('persists the rates date and resolves the rate against it', async () => {
      // One tenant throughout: the product must belong to the scenario's org,
      // which the repository enforces and an earlier version of this fixture
      // tripped over.
      const own = await makeOrg(`${SLUG}-date`)
      const ctx = { actorId: own.user, organizationId: own.org, requestId: 'date' }
      await freightRateRepository.create(ctx, rateFor({ amount: '3333.0000' }))

      const stored = await costScenarioRepository.create(ctx, {
        ...scenario({
          originPortId: inPort,
          destinationPortId: aePort,
          containerTypeId: box20,
          mode: 'SEA_FCL',
          ratesEffectiveOn: midQ1,
        }),
        productId: own.product,
      })
      expect(stored.ratesEffectiveOn?.toISOString()).toBe(midQ1.toISOString())

      // End to end: the stored scenario's own fields select the rate.
      const result = await resolveFreightRate(freightRateRepository, {
        organizationId: ctx.organizationId,
        originPortId: stored.originPortId,
        destinationPortId: stored.destinationPortId,
        mode: stored.mode,
        containerTypeId: stored.containerTypeId,
        effectiveAt: stored.ratesEffectiveOn,
      })
      expect(result.status).toBe('RESOLVED')
      if (result.status === 'RESOLVED') {
        expect(Money.of(result.rate.amount).toFixed(4)).toBe('3333.0000')
      }
    })

    it('finds a curated port by LOCODE, and nothing for an unknown one', async () => {
      expect((await logisticsReferenceRepository.findPortByLocode('YYIN1'))?.id).toBe(inPort)
      // An unknown code is not an error: V3.3 kept the code columns precisely so
      // an uncurated corridor still works.
      expect(await logisticsReferenceRepository.findPortByLocode('ZZZZZ')).toBeNull()
    })
  })
})
