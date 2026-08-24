import { beforeAll, describe, expect, it } from 'vitest'

import { prisma } from '../client'
import { accountRepository } from './account.repository'
import { quotationRepository } from './quotation.repository'

/**
 * `listQuotationsForBuyer` against a real database.
 *
 * The portal read service is unit-tested with an in-memory table, which proves
 * the service passes the right scopes but says nothing about the query that
 * actually runs. Batch E showed the difference plainly: removing
 * `organizationId` from the real `where` of the RFQ read broke no test in the
 * entire suite, because the only thing exercising it was a fake standing in for
 * the repository.
 *
 * These cases talk to Postgres, so the scope has to be in the SQL to pass. Two
 * organizations and two accounts are set up precisely so that a dropped clause
 * returns somebody else's offer rather than an empty list - a mistake that reads
 * as data appearing, not data missing.
 *
 * A quotation is the sharper case of the two. An RFQ is the buyer's own record;
 * a quotation is priced from what a supplier quoted us, so the same row carries
 * `costTotal`, `marginPercent` and, through `items`, supplier identity. What is
 * asserted here is not only whose rows come back but which columns Postgres was
 * ever asked for.
 */
describe.skipIf(!process.env.DATABASE_URL)('quotationRepository buyer reads (integration)', () => {
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
      where: { slug: 'qt-buyer-itest-a' },
      update: {},
      create: { name: 'QT Buyer IT A', slug: 'qt-buyer-itest-a' },
    })
    const b = await prisma.organization.upsert({
      where: { slug: 'qt-buyer-itest-b' },
      update: {},
      create: { name: 'QT Buyer IT B', slug: 'qt-buyer-itest-b' },
    })
    orgA = a.id
    orgB = b.id

    const ua = await prisma.user.upsert({
      where: { email: 'qt-buyer-it-a@triyara.test' },
      update: {},
      create: {
        organizationId: orgA,
        email: 'qt-buyer-it-a@triyara.test',
        name: 'A',
        passwordHash: 'x',
      },
    })
    const ub = await prisma.user.upsert({
      where: { email: 'qt-buyer-it-b@triyara.test' },
      update: {},
      create: {
        organizationId: orgB,
        email: 'qt-buyer-it-b@triyara.test',
        name: 'B',
        passwordHash: 'x',
      },
    })
    actorA = ua.id
    actorB = ub.id

    const ctxA = { actorId: actorA, organizationId: orgA, requestId: 'r1' }
    const ctxB = { actorId: actorB, organizationId: orgB, requestId: 'r1' }

    buyer1 = (await accountRepository.create(ctxA, { legalName: `QT Buyer One ${tag}` })).id
    buyer2 = (await accountRepository.create(ctxA, { legalName: `QT Buyer Two ${tag}` })).id
    buyerInB = (await accountRepository.create(ctxB, { legalName: `QT Buyer Other Org ${tag}` })).id

    // One quotation for each shape the query must tell apart.
    const quotation = (
      organizationId: string,
      buyerId: string,
      suffix: string,
      status:
        | 'DRAFT'
        | 'PENDING_APPROVAL'
        | 'APPROVED'
        | 'SENT'
        | 'UNDER_NEGOTIATION'
        | 'ACCEPTED'
        | 'REJECTED'
        | 'EXPIRED'
        | 'WITHDRAWN'
        | 'SUPERSEDED',
      sentAt: Date | null,
      deletedAt: Date | null = null,
    ) => ({
      organizationId,
      quotationNumber: `QT-${tag}-${suffix}`,
      revisionNumber: 1,
      buyerId,
      currency: 'USD',
      baseCurrency: 'INR',
      status,
      sentAt,
      grandTotal: '12500.0000',
      // INTERNAL. Present on the row on purpose: the projection has to be the
      // thing that keeps them out, not their absence from the fixture.
      costTotal: '9111.1111',
      marginPercent: '27.5000',
      createdById: organizationId === orgA ? actorA : actorB,
      deletedAt,
    })

    await prisma.quotation.createMany({
      data: [
        // One row for every status the buyer is entitled to see. All five are
        // here on purpose: with only SENT and ACCEPTED present, the visible set
        // could be quietly narrowed and no test would notice - a buyer would
        // simply stop being shown offers we had already made them.
        quotation(orgA, buyer1, 'SENT', 'SENT', new Date('2026-08-20')),
        quotation(orgA, buyer1, 'UNDER-NEGOTIATION', 'UNDER_NEGOTIATION', new Date('2026-08-16')),
        quotation(orgA, buyer1, 'ACCEPTED', 'ACCEPTED', new Date('2026-08-10')),
        quotation(orgA, buyer1, 'REJECTED', 'REJECTED', new Date('2026-08-08')),
        quotation(orgA, buyer1, 'EXPIRED', 'EXPIRED', new Date('2026-08-06')),
        quotation(orgA, buyer1, 'DRAFT', 'DRAFT', null),
        quotation(orgA, buyer1, 'APPROVED', 'APPROVED', null),
        quotation(orgA, buyer1, 'SUPERSEDED', 'SUPERSEDED', new Date('2026-08-05')),
        quotation(orgA, buyer1, 'WITHDRAWN', 'WITHDRAWN', new Date('2026-08-04')),
        quotation(orgA, buyer1, 'DELETED', 'SENT', new Date('2026-08-19'), new Date()),
        quotation(orgA, buyer2, 'OTHER-BUYER', 'SENT', new Date('2026-08-18')),
        quotation(orgB, buyerInB, 'OTHER-ORG', 'SENT', new Date('2026-08-17')),
      ],
    })
  })

  describe('whose offers come back', () => {
    it('returns only the quotations sent to the buyer account', async () => {
      const { items } = await quotationRepository.listQuotationsForBuyer(orgA, buyer1)
      expect(items.map((q) => q.quotationNumber).sort()).toEqual([
        `QT-${tag}-ACCEPTED`,
        `QT-${tag}-EXPIRED`,
        `QT-${tag}-REJECTED`,
        `QT-${tag}-SENT`,
        `QT-${tag}-UNDER-NEGOTIATION`,
      ])
    })

    it('excludes another buyer in the same organization', async () => {
      const { items } = await quotationRepository.listQuotationsForBuyer(orgA, buyer1)
      expect(items.map((q) => q.quotationNumber)).not.toContain(`QT-${tag}-OTHER-BUYER`)
    })

    it('enforces the organization in the query, not afterwards', async () => {
      // Asking organization B for organization A's account must find nothing. If
      // the org clause were dropped this returns buyer1's offers instead, which
      // is why the assertion is on emptiness rather than on a filtered result.
      const { items } = await quotationRepository.listQuotationsForBuyer(orgB, buyer1)
      expect(items).toEqual([])
    })

    it('does not leak organization B&rsquo;s rows into an organization A query', async () => {
      const { items } = await quotationRepository.listQuotationsForBuyer(orgA, buyerInB)
      expect(items).toEqual([])
    })

    it('excludes soft-deleted quotations', async () => {
      const { items } = await quotationRepository.listQuotationsForBuyer(orgA, buyer1)
      expect(items.map((q) => q.quotationNumber)).not.toContain(`QT-${tag}-DELETED`)
    })
  })

  describe('which offers a buyer is allowed to see at all', () => {
    it.each([
      ['SENT', 'we have made them the offer'],
      ['UNDER-NEGOTIATION', 'they are talking to us about it'],
      ['ACCEPTED', 'they took it'],
      ['REJECTED', 'they turned it down and may want the record'],
      ['EXPIRED', 'it lapsed, and a lapsed offer is still one we made'],
    ])('includes %s, because %s', async (suffix) => {
      // Every buyer-visible status has a row, so narrowing the visible set is
      // a failing test rather than a silent change in what a buyer is shown.
      const { items } = await quotationRepository.listQuotationsForBuyer(orgA, buyer1)
      expect(items.map((q) => q.quotationNumber)).toContain(`QT-${tag}-${suffix}`)
    })

    it.each([
      ['DRAFT', 'we have not finished pricing it'],
      ['APPROVED', 'it passed internal approval but was never sent'],
      ['WITHDRAWN', 'we pulled it back'],
      ['SUPERSEDED', 'a later revision replaced it'],
    ])('excludes %s, because %s', async (suffix) => {
      const { items } = await quotationRepository.listQuotationsForBuyer(orgA, buyer1)
      expect(items.map((q) => q.quotationNumber)).not.toContain(`QT-${tag}-${suffix}`)
    })

    it('filters status in the query rather than after fetching', async () => {
      // Exactly the five visible rows, against nine non-deleted rows for this
      // account. If the status filter ran in JavaScript the take would have been
      // spent on rows the buyer may not see - DRAFT and APPROVED sort first,
      // since Postgres puts NULL `sentAt` first on a DESC order - and this page
      // would come back short.
      const page = await quotationRepository.listQuotationsForBuyer(orgA, buyer1, 5)
      expect(page.items).toHaveLength(5)
      expect(page.hasMore).toBe(false)
    })
  })

  describe('what each row carries', () => {
    it('selects no supplier, cost, margin or internal column', async () => {
      // The projection is applied at the database, so these never enter the
      // process. Asserted on the returned row's own keys.
      const { items } = await quotationRepository.listQuotationsForBuyer(orgA, buyer1)
      const row = items[0]!

      expect(Object.keys(row).sort()).toEqual([
        'currency',
        'grandTotal',
        'quotationNumber',
        'revisionNumber',
        'sentAt',
        'status',
        'validUntil',
      ])
    })

    it('fetches neither the sourced cost nor the realised margin', async () => {
      // Both columns hold a value on every fixture row. They are absent because
      // they were never asked for.
      const { items } = await quotationRepository.listQuotationsForBuyer(orgA, buyer1)
      const serialized = JSON.stringify(items)

      expect(serialized).not.toContain('9111.1111')
      expect(serialized).not.toContain('27.5')
    })

    it('carries the price we quoted', async () => {
      const { items } = await quotationRepository.listQuotationsForBuyer(orgA, buyer1)
      expect(items[0]!.grandTotal?.toString()).toBe('12500')
    })

    it('shows the most recently sent offer first', async () => {
      const { items } = await quotationRepository.listQuotationsForBuyer(orgA, buyer1)
      expect(items.map((q) => q.quotationNumber)).toEqual([
        `QT-${tag}-SENT`,
        `QT-${tag}-UNDER-NEGOTIATION`,
        `QT-${tag}-ACCEPTED`,
        `QT-${tag}-REJECTED`,
        `QT-${tag}-EXPIRED`,
      ])
    })
  })

  describe('paging', () => {
    it('reports hasMore without handing back a cursor', async () => {
      const page = await quotationRepository.listQuotationsForBuyer(orgA, buyer1, 1)
      expect(page.items).toHaveLength(1)
      expect(page.hasMore).toBe(true)
      // `encodeCursor` is base64url of the row id, so a cursor would put the
      // database id back into a buyer-facing payload.
      expect(page).not.toHaveProperty('nextCursor')
    })

    it('does not report more when the page holds everything', async () => {
      const page = await quotationRepository.listQuotationsForBuyer(orgA, buyer1, 50)
      expect(page.hasMore).toBe(false)
    })
  })
})
