import { beforeAll, describe, expect, it } from 'vitest'

import { prisma } from '../client'
import { accountRepository } from './account.repository'
import { rfqRepository } from './rfq.repository'

/**
 * `listForBuyer` against a real database.
 *
 * The portal read service is unit-tested with an in-memory table, which proves
 * the service passes the right scopes but says nothing about the query that
 * actually runs. Mutation testing showed the difference plainly: removing
 * `organizationId` from the real `where` broke no test in the entire suite,
 * because the only thing exercising `listForBuyer` was a fake standing in for
 * the repository.
 *
 * These cases talk to Postgres, so the scope has to be in the SQL to pass. Two
 * organizations and two accounts are set up precisely so that a dropped clause
 * returns somebody else's row rather than an empty list - a mistake that reads
 * as data appearing, not data missing.
 */
describe.skipIf(!process.env.DATABASE_URL)('rfqRepository buyer reads (integration)', () => {
  let orgA = ''
  let orgB = ''
  let actorA = ''
  let actorB = ''
  let buyer1 = ''
  let buyer2 = ''
  let buyerInB = ''
  const tag = Date.now().toString(36)

  beforeAll(async () => {
    const a = await prisma.organization.upsert({
      where: { slug: 'rfq-buyer-itest-a' },
      update: {},
      create: { name: 'RFQ Buyer IT A', slug: 'rfq-buyer-itest-a' },
    })
    const b = await prisma.organization.upsert({
      where: { slug: 'rfq-buyer-itest-b' },
      update: {},
      create: { name: 'RFQ Buyer IT B', slug: 'rfq-buyer-itest-b' },
    })
    orgA = a.id
    orgB = b.id

    const ua = await prisma.user.upsert({
      where: { email: 'rfq-buyer-it-a@triyara.test' },
      update: {},
      create: {
        organizationId: orgA,
        email: 'rfq-buyer-it-a@triyara.test',
        name: 'A',
        passwordHash: 'x',
      },
    })
    const ub = await prisma.user.upsert({
      where: { email: 'rfq-buyer-it-b@triyara.test' },
      update: {},
      create: {
        organizationId: orgB,
        email: 'rfq-buyer-it-b@triyara.test',
        name: 'B',
        passwordHash: 'x',
      },
    })
    actorA = ua.id
    actorB = ub.id

    const ctxA = { actorId: actorA, organizationId: orgA, requestId: 'r1' }
    const ctxB = { actorId: actorB, organizationId: orgB, requestId: 'r1' }

    buyer1 = (await accountRepository.create(ctxA, { legalName: `Buyer One ${tag}` })).id
    buyer2 = (await accountRepository.create(ctxA, { legalName: `Buyer Two ${tag}` })).id
    buyerInB = (await accountRepository.create(ctxB, { legalName: `Buyer Other Org ${tag}` })).id

    // One RFQ for each shape the query must tell apart.
    const rfq = (
      organizationId: string,
      buyerId: string | null,
      suffix: string,
      deletedAt: Date | null = null,
    ) => ({
      organizationId,
      rfqNumber: `RFQ-${tag}-${suffix}`,
      type: buyerId ? ('BUYER' as const) : ('INTERNAL' as const),
      buyerId,
      title: `Requirement ${suffix}`,
      status: 'DRAFT' as const,
      priority: 'NORMAL' as const,
      createdById: organizationId === orgA ? actorA : actorB,
      updatedById: organizationId === orgA ? actorA : actorB,
      deletedAt,
    })

    await prisma.rFQ.createMany({
      data: [
        rfq(orgA, buyer1, 'MINE'),
        rfq(orgA, buyer1, 'MINE2'),
        rfq(orgA, buyer2, 'OTHER-BUYER'),
        rfq(orgA, null, 'INTERNAL'),
        rfq(orgA, buyer1, 'DELETED', new Date()),
        rfq(orgB, buyerInB, 'OTHER-ORG'),
      ],
    })
  })

  describe('listForBuyer', () => {
    it('returns only the RFQs the buyer account owns', async () => {
      const { items } = await rfqRepository.listForBuyer(orgA, buyer1)
      expect(items.map((r) => r.rfqNumber).sort()).toEqual([`RFQ-${tag}-MINE`, `RFQ-${tag}-MINE2`])
    })

    it('excludes another buyer in the same organization', async () => {
      const { items } = await rfqRepository.listForBuyer(orgA, buyer1)
      expect(items.map((r) => r.rfqNumber)).not.toContain(`RFQ-${tag}-OTHER-BUYER`)
    })

    it('excludes INTERNAL RFQs, which carry no buyer', async () => {
      const { items } = await rfqRepository.listForBuyer(orgA, buyer1)
      expect(items.map((r) => r.rfqNumber)).not.toContain(`RFQ-${tag}-INTERNAL`)
    })

    it('excludes soft-deleted RFQs', async () => {
      const { items } = await rfqRepository.listForBuyer(orgA, buyer1)
      expect(items.map((r) => r.rfqNumber)).not.toContain(`RFQ-${tag}-DELETED`)
    })

    it('enforces the organization in the query, not afterwards', async () => {
      // Asking organization B for organization A's account must find nothing. If
      // the org clause were dropped, this returns buyer1's rows instead - which is
      // why the assertion is on emptiness rather than on a filtered result.
      const { items } = await rfqRepository.listForBuyer(orgB, buyer1)
      expect(items).toEqual([])
    })

    it('does not leak organization B&rsquo;s rows into an organization A query', async () => {
      const { items } = await rfqRepository.listForBuyer(orgA, buyerInB)
      expect(items).toEqual([])
    })

    it('selects no supplier, staff or audit column', async () => {
      // The projection is applied at the database, so these never enter the
      // process. Asserted on the returned row's own keys.
      const { items } = await rfqRepository.listForBuyer(orgA, buyer1)
      const row = items[0]!

      expect(Object.keys(row).sort()).toEqual([
        'createdAt',
        'currency',
        'destinationCountry',
        'destinationPort',
        'expectedShipmentDate',
        'incoterm',
        'priority',
        'quotationDeadline',
        'rfqNumber',
        'status',
        'title',
      ])
    })

    it('reports hasMore without handing back a cursor', async () => {
      const page = await rfqRepository.listForBuyer(orgA, buyer1, 1)
      expect(page.items).toHaveLength(1)
      expect(page.hasMore).toBe(true)
      expect(page).not.toHaveProperty('nextCursor')
    })
  })

  /**
   * `findForBuyer` against a real database.
   *
   * The same reasoning as the list cases above, and the same fixture: two
   * organizations, two accounts in one of them, an INTERNAL RFQ and a deleted one.
   * A dropped clause here returns a real row belonging to somebody else, not an
   * empty result - which is what makes these able to catch the mutation.
   *
   * One extra property this file can prove and the service unit tests cannot: the
   * projection is applied by Postgres, so forbidden columns are never fetched at
   * all rather than dropped afterwards.
   */
  describe('findForBuyer', () => {
    it('returns the requirement the buyer owns', async () => {
      const found = await rfqRepository.findForBuyer(orgA, buyer1, `RFQ-${tag}-MINE`)
      expect(found?.rfqNumber).toBe(`RFQ-${tag}-MINE`)
    })

    it('refuses another buyer&rsquo;s requirement in the same organization', async () => {
      // The row exists and the number is right; only the account differs. Drop the
      // buyer clause and this returns OTHER-BUYER instead of null.
      expect(await rfqRepository.findForBuyer(orgA, buyer1, `RFQ-${tag}-OTHER-BUYER`)).toBeNull()
    })

    it('refuses a requirement in another organization', async () => {
      expect(await rfqRepository.findForBuyer(orgA, buyerInB, `RFQ-${tag}-OTHER-ORG`)).toBeNull()
    })

    it('refuses when the organization does not match the account&rsquo;s own rows', async () => {
      // Asking organization B for organization A's account and number. Without the
      // organization clause this returns MINE.
      expect(await rfqRepository.findForBuyer(orgB, buyer1, `RFQ-${tag}-MINE`)).toBeNull()
    })

    it('refuses an INTERNAL requirement, which carries no buyer', async () => {
      expect(await rfqRepository.findForBuyer(orgA, buyer1, `RFQ-${tag}-INTERNAL`)).toBeNull()
    })

    it('refuses a soft-deleted requirement', async () => {
      expect(await rfqRepository.findForBuyer(orgA, buyer1, `RFQ-${tag}-DELETED`)).toBeNull()
    })

    it('refuses a number that does not exist', async () => {
      expect(await rfqRepository.findForBuyer(orgA, buyer1, `RFQ-${tag}-NOPE`)).toBeNull()
    })

    it('selects no supplier, staff, audit or description column', async () => {
      const found = await rfqRepository.findForBuyer(orgA, buyer1, `RFQ-${tag}-MINE`)

      expect(Object.keys(found!).sort()).toEqual([
        'createdAt',
        'currency',
        'destinationCountry',
        'destinationPort',
        'expectedShipmentDate',
        'incoterm',
        'items',
        'priority',
        'quotationDeadline',
        'rfqNumber',
        'status',
        'title',
      ])
    })

    it('selects only the approved columns on a requirement line', async () => {
      await prisma.rFQItem.create({
        data: {
          rfqId: (
            await prisma.rFQ.findFirstOrThrow({
              where: { organizationId: orgA, rfqNumber: `RFQ-${tag}-MINE` },
              select: { id: true },
            })
          ).id,
          organizationId: orgA,
          lineNumber: 1,
          customProductName: 'Sona Masoori, unpolished',
          quantity: 25,
          unit: 'MT',
          packaging: '25kg bags',
          remarks: 'operator remark that must not be selected',
        },
      })

      const found = await rfqRepository.findForBuyer(orgA, buyer1, `RFQ-${tag}-MINE`)
      const line = found!.items[0]!

      expect(Object.keys(line).sort()).toEqual([
        'customProductName',
        'lineNumber',
        'packaging',
        'product',
        'quantity',
        'requiredCertifications',
        'unit',
      ])
      // The column exists on the row and is deliberately not fetched.
      expect(JSON.stringify(found)).not.toContain('operator remark')
    })
  })

  /**
   * The overview count, against a real database.
   *
   * A count is only worth showing if it agrees with the page it links to, so
   * every assertion here compares it against the corresponding list rather than
   * a hard-coded figure - the two cannot drift apart as fixtures change, and a
   * count built from a different scope fails immediately.
   *
   * The fixture already holds a second buyer in this tenant and a third in
   * another, so a dropped predicate counts somebody else's rows rather than
   * returning zero.
   */
  describe('countForBuyer matches the requirements list', () => {
    it('counts exactly what the list returns', async () => {
      const { items } = await rfqRepository.listForBuyer(orgA, buyer1)
      expect(await rfqRepository.countForBuyer(orgA, buyer1)).toBe(items.length)
    })

    it('counts each buyer separately, never the tenant', async () => {
      const [oneList, twoList] = await Promise.all([
        rfqRepository.listForBuyer(orgA, buyer1),
        rfqRepository.listForBuyer(orgA, buyer2),
      ])
      const [oneCount, twoCount] = await Promise.all([
        rfqRepository.countForBuyer(orgA, buyer1),
        rfqRepository.countForBuyer(orgA, buyer2),
      ])

      expect(oneCount).toBe(oneList.items.length)
      expect(twoCount).toBe(twoList.items.length)
      // Both buyers hold rows in this tenant, so a count ignoring the buyer
      // clause would return the same larger number for both.
      expect(oneCount + twoCount).toBeGreaterThan(oneCount)
    })

    it('counts nothing across tenants', async () => {
      expect(await rfqRepository.countForBuyer(orgB, buyer1)).toBe(0)
      expect(await rfqRepository.countForBuyer(orgA, buyerInB)).toBe(0)
    })

    it('counts nothing for an empty buyer rather than the whole tenant', async () => {
      expect(await rfqRepository.countForBuyer(orgA, '')).toBe(0)
    })

    it('counts nothing for an empty organization', async () => {
      expect(await rfqRepository.countForBuyer('', buyer1)).toBe(0)
    })
  })
})
