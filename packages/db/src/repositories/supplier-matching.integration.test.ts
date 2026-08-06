import { randomUUID } from 'node:crypto'

import { beforeAll, describe, expect, it } from 'vitest'

import { prisma } from '../client'
import { supplierRepository } from './supplier.repository'
import { supplierHistoryRepository } from './supplier-history.repository'
import { collectScoreSignals } from './supplier-score.repository'

// Supplier matching (TRY-BNP-SUPPLIER-MATCH) against a real database.
//
// Fixtures namespaced to this file: vitest runs files in parallel and `upsert`
// is select-then-insert, so a shared organization slug races on a cold database.
describe.skipIf(!process.env.DATABASE_URL)('supplier matching (integration)', () => {
  let organizationId = ''
  let ctx = { actorId: '', organizationId: '', requestId: 'match-it' }
  let turmericId = ''
  let pepperId = ''

  const uniq = () => randomUUID().replace(/-/g, '').slice(0, 10)
  const code = () => `MATCH-${uniq().toUpperCase()}`

  async function makeSupplier(over: Record<string, unknown> = {}) {
    return prisma.supplier.create({
      data: {
        organizationId,
        supplierCode: code(),
        companyName: 'Matching Co',
        legalName: 'Matching Co Pvt Ltd',
        businessType: 'MANUFACTURER',
        country: 'IN',
        ...over,
      },
      select: { id: true },
    })
  }

  async function addOffering(supplierId: string, productId: string, moq: number | null) {
    return prisma.supplierProductOffering.create({
      data: {
        supplierId,
        organizationId,
        productId,
        status: 'ACTIVE',
        ...(moq === null ? {} : { moq }),
      },
    })
  }

  const list = (params: Record<string, unknown>) =>
    supplierRepository.list({ organizationId, limit: 50, ...params })

  beforeAll(async () => {
    const org = await prisma.organization.upsert({
      where: { slug: 'match-itest' },
      update: {},
      create: { name: 'Match IT', slug: 'match-itest' },
    })
    organizationId = org.id
    const user = await prisma.user.upsert({
      where: { email: 'match-it@triyara.test' },
      update: {},
      create: { organizationId, email: 'match-it@triyara.test', name: 'IT', passwordHash: 'x' },
    })
    ctx = { actorId: user.id, organizationId, requestId: 'match-it' }

    const category = await prisma.category.upsert({
      where: { organizationId_slug: { organizationId, slug: 'match-cat' } },
      update: {},
      create: {
        organizationId,
        name: 'Match Cat',
        slug: 'match-cat',
        path: '/match-cat',
        depth: 0,
      },
    })
    const turmeric = await prisma.product.create({
      data: {
        organizationId,
        categoryId: category.id,
        sku: `P-${uniq()}`,
        name: 'Turmeric',
        slug: `turmeric-${uniq()}`,
      },
    })
    const pepper = await prisma.product.create({
      data: {
        organizationId,
        categoryId: category.id,
        sku: `P-${uniq()}`,
        name: 'Pepper',
        slug: `pepper-${uniq()}`,
      },
    })
    turmericId = turmeric.id
    pepperId = pepper.id
  })

  describe('filters', () => {
    it('finds suppliers holding a current certification', async () => {
      const holder = await makeSupplier()
      const lapsed = await makeSupplier()
      await prisma.supplierCertification.createMany({
        data: [
          {
            supplierId: holder.id,
            organizationId,
            type: 'FSSAI',
            certificateNumber: 'F-1',
            status: 'ACTIVE',
          },
          // Held once, no longer current. A sourcing filter asking "who is
          // certified" must not return this one.
          {
            supplierId: lapsed.id,
            organizationId,
            type: 'FSSAI',
            certificateNumber: 'F-2',
            status: 'EXPIRED',
          },
        ],
      })

      const ids = (await list({ certification: 'FSSAI' })).items.map((s) => s.id)
      expect(ids).toContain(holder.id)
      expect(ids).not.toContain(lapsed.id)
    })

    it('matches export markets exactly, not by substring', async () => {
      const uae = await makeSupplier({ exportCountries: ['AE', 'US'] })
      const other = await makeSupplier({ exportCountries: ['SA'] })

      const ids = (await list({ exportCountry: 'AE' })).items.map((s) => s.id)
      expect(ids).toContain(uae.id)
      expect(ids).not.toContain(other.id)
    })

    it('matches packaging and payment terms as free text', async () => {
      const target = await makeSupplier({
        packaging: '25kg PP bags, palletised',
        paymentTerms: '30% advance, balance against BL',
      })
      const bulk = await makeSupplier({ packaging: 'Bulk vessel', paymentTerms: 'LC at sight' })

      const packagingIds = (await list({ packaging: 'pp bags' })).items.map((s) => s.id)
      expect(packagingIds).toContain(target.id)
      // Case-insensitive both ways, and it must EXCLUDE the non-match rather
      // than merely include the match.
      expect(packagingIds).not.toContain(bulk.id)
      expect((await list({ paymentTerms: 'ADVANCE' })).items.map((s) => s.id)).toContain(target.id)
      expect((await list({ paymentTerms: 'ADVANCE' })).items.map((s) => s.id)).not.toContain(
        bulk.id,
      )
    })

    it('filters on the offering MOQ, ignoring offerings with none stated', async () => {
      const low = await makeSupplier()
      const high = await makeSupplier()
      const unstated = await makeSupplier()
      await addOffering(low.id, turmericId, 5)
      await addOffering(high.id, turmericId, 500)
      await addOffering(unstated.id, turmericId, null)

      const ids = (await list({ productId: turmericId, maxMoq: 10 })).items.map((s) => s.id)
      expect(ids).toContain(low.id)
      expect(ids).not.toContain(high.id)
      // No stated MOQ is not evidence of meeting one.
      expect(ids).not.toContain(unstated.id)
    })

    it('requires the product and the MOQ to hold on the SAME offering', async () => {
      // This supplier sells turmeric only at 500, and pepper at 5. Asking for
      // turmeric at or below 10 must not match it just because SOME offering
      // is cheap — that would shortlist them for a product they cannot supply
      // at that quantity, which is the whole failure this filter exists to
      // avoid.
      const mixed = await makeSupplier()
      await addOffering(mixed.id, turmericId, 500)
      await addOffering(mixed.id, pepperId, 5)

      const ids = (await list({ productId: turmericId, maxMoq: 10 })).items.map((s) => s.id)
      expect(ids).not.toContain(mixed.id)

      // The same supplier IS a match for pepper at that quantity.
      const pepperIds = (await list({ productId: pepperId, maxMoq: 10 })).items.map((s) => s.id)
      expect(pepperIds).toContain(mixed.id)
    })

    it('combines filters rather than widening the result', async () => {
      const match = await makeSupplier({ country: 'IN', exportCountries: ['AE'], isVerified: true })
      const wrongCountry = await makeSupplier({
        country: 'VN',
        exportCountries: ['AE'],
        isVerified: true,
      })
      const unverified = await makeSupplier({ country: 'IN', exportCountries: ['AE'] })

      const ids = (await list({ country: 'IN', exportCountry: 'AE', isVerified: true })).items.map(
        (s) => s.id,
      )
      expect(ids).toContain(match.id)
      expect(ids).not.toContain(wrongCountry.id)
      expect(ids).not.toContain(unverified.id)
    })
  })

  describe('score signals', () => {
    it('reports zeroes for a supplier with nothing on file', async () => {
      const bare = await makeSupplier()
      const signals = await collectScoreSignals(organizationId, [bare.id])
      const s = signals.get(bare.id)

      expect(s).toBeDefined()
      expect(s).toMatchObject({
        activeCertifications: 0,
        documents: 0,
        hasReachableContact: false,
        activeOfferings: 0,
        rfqsInvited: 0,
        rfqsResponded: 0,
      })
    })

    it('counts only contacts we can actually reach', async () => {
      const nameOnly = await makeSupplier()
      const reachable = await makeSupplier()
      await prisma.supplierContact.create({
        data: { supplierId: nameOnly.id, organizationId, name: 'No channel' },
      })
      await prisma.supplierContact.create({
        data: {
          supplierId: reachable.id,
          organizationId,
          name: 'On WhatsApp',
          whatsapp: '+91 90000 00000',
        },
      })

      const signals = await collectScoreSignals(organizationId, [nameOnly.id, reachable.id])
      // A row with a name and no way to contact them is not a way in.
      expect(signals.get(nameOnly.id)?.hasReachableContact).toBe(false)
      expect(signals.get(reachable.id)?.hasReachableContact).toBe(true)
    })

    it('separates certifications that are lapsing from those that are not', async () => {
      const supplier = await makeSupplier()
      const soon = new Date(Date.now() + 10 * 86_400_000)
      const later = new Date(Date.now() + 365 * 86_400_000)
      await prisma.supplierCertification.createMany({
        data: [
          {
            supplierId: supplier.id,
            organizationId,
            type: 'FSSAI',
            certificateNumber: 'A',
            status: 'ACTIVE',
            expiryDate: soon,
          },
          {
            supplierId: supplier.id,
            organizationId,
            type: 'ISO',
            certificateNumber: 'B',
            status: 'ACTIVE',
            expiryDate: later,
          },
        ],
      })

      const signals = await collectScoreSignals(organizationId, [supplier.id])
      expect(signals.get(supplier.id)?.activeCertifications).toBe(2)
      expect(signals.get(supplier.id)?.expiringCertifications).toBe(1)
    })

    it('returns an entry for every supplier asked about, in one pass', async () => {
      const a = await makeSupplier()
      const b = await makeSupplier()
      const c = await makeSupplier()

      const signals = await collectScoreSignals(organizationId, [a.id, b.id, c.id])
      // No entry missing means the caller never has to tell "no data" apart
      // from "not asked for" — which is where scoring bugs hide.
      expect([...signals.keys()].sort()).toEqual([a.id, b.id, c.id].sort())
    })

    it('ignores suppliers belonging to another organization', async () => {
      const other = await prisma.organization.upsert({
        where: { slug: 'match-itest-other' },
        update: {},
        create: { name: 'Match Other', slug: 'match-itest-other' },
      })
      const theirs = await prisma.supplier.create({
        data: {
          organizationId: other.id,
          supplierCode: code(),
          companyName: 'Theirs',
          legalName: 'Theirs Ltd',
          businessType: 'TRADER',
        },
        select: { id: true },
      })

      const signals = await collectScoreSignals(organizationId, [theirs.id])
      expect(signals.size).toBe(0)
    })
  })

  describe('history', () => {
    it('lists the RFQs a supplier was invited to, newest first', async () => {
      const supplier = await makeSupplier()
      // A BUYER-type RFQ must carry a buyerId: `RFQ_buyer_matches_type` is a
      // raw-SQL CHECK constraint from 0007_rfq_constraints, invisible to the
      // Prisma schema, and it fires on insert.
      const buyer = await prisma.account.create({
        data: {
          organizationId,
          legalName: `Buyer ${uniq()}`,
          createdById: ctx.actorId,
          updatedById: ctx.actorId,
        },
        select: { id: true },
      })

      for (const [n, invitedAt] of [
        ['older', new Date('2026-01-01')],
        ['newer', new Date('2026-06-01')],
      ] as const) {
        const rfq = await prisma.rFQ.create({
          data: {
            organizationId,
            buyerId: buyer.id,
            rfqNumber: `RFQ-${uniq()}`,
            title: `Requirement ${n}`,
            createdById: ctx.actorId,
          },
        })
        await prisma.rFQSupplier.create({
          data: {
            rfqId: rfq.id,
            supplierId: supplier.id,
            organizationId,
            invitedById: ctx.actorId,
            invitedAt,
          },
        })
      }

      const page = await supplierHistoryRepository.rfqs({
        organizationId,
        supplierId: supplier.id,
        limit: 25,
      })
      expect(page.items).toHaveLength(2)
      expect(page.items[0]?.rfq.title).toBe('Requirement newer')
    })

    it('shows a supplier no history from another organization', async () => {
      const supplier = await makeSupplier()
      const page = await supplierHistoryRepository.rfqs({
        organizationId: 'some-other-org',
        supplierId: supplier.id,
        limit: 25,
      })
      expect(page.items).toHaveLength(0)
    })

    it('treats an invisible supplier as absent rather than empty', async () => {
      await expect(
        supplierHistoryRepository.assertVisible(organizationId, 'no-such-supplier'),
      ).rejects.toThrow(/not found/i)
    })
  })
})
