import { randomUUID } from 'node:crypto'

import { beforeAll, describe, expect, it } from 'vitest'

import { prisma } from '../client'
import { quotationRepository } from './quotation.repository'
import { rfqRepository } from './rfq.repository'

/**
 * The tenant boundary on foreign keys the client chooses.
 *
 * An RFQ or quotation is filed under the caller's own organization, so the row
 * looks correct while a productId or buyerId inside it can point at another
 * tenant. The read path joins `product`, which is how a foreign SKU and name
 * come back through a record the caller is entitled to see.
 *
 * Written against the repositories because that is where the check lives -
 * inside the same transaction as the write, so no gap opens between them.
 */
describe.skipIf(!process.env.DATABASE_URL)('cross-tenant references (integration)', () => {
  const uniq = () => randomUUID().replace(/-/g, '').slice(0, 10)
  const num = (p: string) => `${p}-${uniq().toUpperCase()}`

  let ctx = { actorId: '', organizationId: '', requestId: 'xt-it' }
  let ownProductId = ''
  let ownBuyerId = ''
  /** Belongs to a different tenant. Must never be reachable from ours. */
  let foreignProductId = ''
  let foreignBuyerId = ''
  let foreignSku = ''

  async function tenant(slug: string) {
    const org = await prisma.organization.upsert({
      where: { slug },
      update: {},
      create: { name: slug, slug },
    })
    const user = await prisma.user.upsert({
      where: { email: `${slug}@triyara.test` },
      update: {},
      create: {
        organizationId: org.id,
        email: `${slug}@triyara.test`,
        name: slug,
        passwordHash: 'x',
      },
    })
    const category = await prisma.category.create({
      data: { organizationId: org.id, name: `Cat ${uniq()}`, slug: `cat-${uniq()}`, path: 'c' },
    })
    const product = await prisma.product.create({
      data: {
        organizationId: org.id,
        categoryId: category.id,
        sku: num('SKU'),
        name: `Product ${uniq()}`,
        slug: `p-${uniq()}`,
        status: 'ACTIVE',
      },
    })
    const account = await prisma.account.create({
      data: {
        organizationId: org.id,
        legalName: `Buyer ${uniq()}`,
        createdById: user.id,
        updatedById: user.id,
      },
    })
    return { org, user, product, account }
  }

  beforeAll(async () => {
    const mine = await tenant('xt-mine')
    const theirs = await tenant('xt-theirs')

    ctx = { actorId: mine.user.id, organizationId: mine.org.id, requestId: 'xt-it' }
    ownProductId = mine.product.id
    ownBuyerId = mine.account.id
    foreignProductId = theirs.product.id
    foreignBuyerId = theirs.account.id
    foreignSku = theirs.product.sku
  })

  const rfqHeader = (over: Record<string, unknown> = {}) => ({
    rfqNumber: num('RFQ'),
    type: 'INTERNAL' as const,
    title: 'Cross-tenant probe',
    status: 'DRAFT' as const,
    ...over,
  })

  const line = (productId: string | null) => ({
    productId,
    customProductName: productId ? null : 'Free text',
    quantity: 1,
    unit: 'KG',
  })

  describe('RFQ refuses a reference from another tenant', () => {
    it('rejects a foreign productId on create, and writes nothing', async () => {
      const rfqNumber = num('RFQ')
      await expect(
        rfqRepository.create(
          ctx,
          rfqHeader({ rfqNumber }) as never,
          [line(foreignProductId)] as never,
        ),
      ).rejects.toThrow(/Product not found/)

      // The whole transaction is refused, not just the line.
      expect(await prisma.rFQ.findFirst({ where: { rfqNumber } })).toBeNull()
    })

    it('rejects a foreign buyerId on create', async () => {
      const rfqNumber = num('RFQ')
      await expect(
        rfqRepository.create(
          ctx,
          rfqHeader({ rfqNumber, type: 'BUYER', buyerId: foreignBuyerId }) as never,
          [line(null)] as never,
        ),
      ).rejects.toThrow(/Buyer not found/)
      expect(await prisma.rFQ.findFirst({ where: { rfqNumber } })).toBeNull()
    })

    it('rejects a foreign productId when replacing items', async () => {
      const created = await rfqRepository.create(
        ctx,
        rfqHeader() as never,
        [line(ownProductId)] as never,
      )

      await expect(
        rfqRepository.replaceItems(ctx, created.id, created.version, [
          line(foreignProductId),
        ] as never),
      ).rejects.toThrow(/Product not found/)

      // The original line survives: a refused revision changes nothing.
      const after = await prisma.rFQItem.findMany({ where: { rfqId: created.id } })
      expect(after.map((i) => i.productId)).toEqual([ownProductId])
    })

    it('rejects a foreign buyerId on update', async () => {
      const created = await rfqRepository.create(ctx, rfqHeader() as never, [line(null)] as never)

      await expect(
        rfqRepository.mutate(ctx, created.id, created.version, {
          buyerId: foreignBuyerId,
        } as never),
      ).rejects.toThrow(/Buyer not found/)
    })

    it('still accepts references from its own tenant', async () => {
      const created = await rfqRepository.create(
        ctx,
        rfqHeader({ type: 'BUYER', buyerId: ownBuyerId }) as never,
        [line(ownProductId)] as never,
      )
      expect(created.buyerId).toBe(ownBuyerId)
      expect(created.items[0]?.productId).toBe(ownProductId)
    })
  })

  describe('Quotation refuses a reference from another tenant', () => {
    const qHeader = (over: Record<string, unknown> = {}) => ({
      quotationNumber: num('Q'),
      type: 'FIRM' as const,
      title: 'Cross-tenant probe',
      buyerId: ownBuyerId,
      currency: 'USD',
      baseCurrency: 'USD',
      validUntil: new Date(Date.now() + 86_400_000),
      ...over,
    })
    const qLine = (productId: string | null) => ({
      productId,
      description: 'Line',
      quantity: 1,
      unit: 'KG',
      unitPrice: 10,
      lineTotal: 10,
    })
    const totals = () => ({ subtotal: 10, chargesTotal: 0, taxTotal: 0, grandTotal: 10 })

    it('rejects a foreign productId on create, and writes nothing', async () => {
      const quotationNumber = num('Q')
      await expect(
        quotationRepository.create(
          ctx,
          qHeader({ quotationNumber, buyerId: ownBuyerId }) as never,
          [qLine(foreignProductId)] as never,
          totals() as never,
        ),
      ).rejects.toThrow(/Product not found/)
      expect(await prisma.quotation.findFirst({ where: { quotationNumber } })).toBeNull()
    })

    it('rejects a foreign buyerId on create', async () => {
      const quotationNumber = num('Q')
      await expect(
        quotationRepository.create(
          ctx,
          qHeader({ quotationNumber, buyerId: foreignBuyerId }) as never,
          [qLine(null)] as never,
          totals() as never,
        ),
      ).rejects.toThrow(/Buyer not found/)
      expect(await prisma.quotation.findFirst({ where: { quotationNumber } })).toBeNull()
    })

    it('rejects a foreign productId when replacing items', async () => {
      const created = await quotationRepository.create(
        ctx,
        qHeader() as never,
        [qLine(ownProductId)] as never,
        totals() as never,
      )

      await expect(
        quotationRepository.replaceItems(
          ctx,
          created.id,
          created.version,
          [qLine(foreignProductId)] as never,
          totals() as never,
        ),
      ).rejects.toThrow(/Product not found/)
    })

    it('still accepts references from its own tenant', async () => {
      const created = await quotationRepository.create(
        ctx,
        qHeader() as never,
        [qLine(ownProductId)] as never,
        totals() as never,
      )
      expect(created.buyerId).toBe(ownBuyerId)
    })
  })

  it('never returns the foreign record’s details', async () => {
    // The leak this fixes: the refusal names only the id that was sent, which
    // the caller already had. Nothing about the record behind it comes back.
    const rfqNumber = num('RFQ')
    const error = await rfqRepository
      .create(ctx, rfqHeader({ rfqNumber }) as never, [line(foreignProductId)] as never)
      .catch((e: Error) => e)

    const message = (error as Error).message
    expect(message).toContain(foreignProductId)
    expect(message).not.toContain(foreignSku)
    expect(message).not.toMatch(/Tenant|confidential|xt-theirs/i)
  })
})
