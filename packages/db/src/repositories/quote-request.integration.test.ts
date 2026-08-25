import { randomUUID } from 'node:crypto'

import { beforeAll, describe, expect, it } from 'vitest'

import { prisma } from '../client'
import { quoteRequestRepository } from './quote-request.repository'

/**
 * Website enquiry intake against a real PostgreSQL (TRY-BNP-QR-01).
 *
 * Three things only a database can prove: that a public submission genuinely
 * lands as a row, that one tenant's enquiries are invisible to another, and
 * that the reference series really does hand out distinct values under
 * concurrent submissions - which is the whole reason it is a sequence.
 */

describe.skipIf(!process.env.DATABASE_URL)('quote request intake (integration)', () => {
  const SLUG = `qr-it-${randomUUID().slice(0, 8)}`
  let orgA = ''
  let orgB = ''

  const ctxFor = (organizationId: string) => ({
    actorId: 'system:public-quote-request',
    organizationId,
    requestId: 'qr-it',
  })

  const enquiry = (over: Record<string, unknown> = {}) => ({
    product: 'Dehydrated Onion',
    quantity: '2 x 40ft monthly',
    contactName: 'A Buyer',
    contactEmail: 'buyer@example.test',
    ...over,
  })

  beforeAll(async () => {
    const a = await prisma.organization.create({
      data: { name: `${SLUG}-a`, slug: `${SLUG}-a` },
    })
    const b = await prisma.organization.create({
      data: { name: `${SLUG}-b`, slug: `${SLUG}-b` },
    })
    orgA = a.id
    orgB = b.id
  })

  it('persists a public submission as a real row', async () => {
    // The claim the whole change rests on: an enquiry is no longer just an email.
    const created = await quoteRequestRepository.create(ctxFor(orgA), enquiry())

    expect(created.id).toBeTruthy()
    expect(created.status).toBe('NEW')
    expect(created.source).toBe('PUBLIC_WEBSITE')
    expect(created.reference).toMatch(/^QR-\d{4}-\d{6}$/)

    const readBack = await quoteRequestRepository.findById(orgA, created.id)
    expect(readBack?.contactEmail).toBe('buyer@example.test')
  })

  it('records the free-text quantity exactly as the buyer typed it', async () => {
    const created = await quoteRequestRepository.create(
      ctxFor(orgA),
      enquiry({ quantity: 'around 18 MT, maybe more in Q3' }),
    )
    expect(created.quantity).toBe('around 18 MT, maybe more in Q3')
  })

  it('writes an audit entry for a submission nobody signed in to make', async () => {
    const created = await quoteRequestRepository.create(ctxFor(orgA), enquiry())
    const audit = await prisma.auditLog.findFirst({
      where: { entityType: 'QuoteRequest', entityId: created.id },
    })
    expect(audit?.action).toBe('quote_request.submitted')
    expect(audit?.actorId).toBe('system:public-quote-request')
  })

  it('never repeats a reference, even for simultaneous submissions', async () => {
    // A sequence rather than MAX()+1 is the reason this holds without a lock.
    const many = await Promise.all(
      Array.from({ length: 8 }, () => quoteRequestRepository.create(ctxFor(orgA), enquiry())),
    )
    const references = many.map((r) => r.reference)
    expect(new Set(references).size).toBe(references.length)
  })

  describe('tenant isolation', () => {
    it('does not return one organization enquiry to another', async () => {
      const mine = await quoteRequestRepository.create(ctxFor(orgA), enquiry())
      expect(await quoteRequestRepository.findById(orgB, mine.id)).toBeNull()
    })

    it('lists only the caller own enquiries', async () => {
      await quoteRequestRepository.create(ctxFor(orgB), enquiry({ product: 'Turmeric' }))

      const listedForB = await quoteRequestRepository.list({ organizationId: orgB, limit: 50 })
      expect(listedForB.items.length).toBeGreaterThan(0)
      expect(listedForB.items.every((i) => i.organizationId === orgB)).toBe(true)

      const listedForA = await quoteRequestRepository.list({ organizationId: orgA, limit: 50 })
      expect(listedForA.items.some((i) => i.product === 'Turmeric')).toBe(false)
    })

    it('cannot triage another organization enquiry', async () => {
      const mine = await quoteRequestRepository.create(ctxFor(orgA), enquiry())
      const attempt = await quoteRequestRepository.review(ctxFor(orgB), mine.id, 1, {
        status: 'REJECTED',
      })
      expect(attempt).toBeNull()

      const untouched = await quoteRequestRepository.findById(orgA, mine.id)
      expect(untouched?.status).toBe('NEW')
    })
  })

  describe('triage', () => {
    it('records the decision and bumps the version', async () => {
      const created = await quoteRequestRepository.create(ctxFor(orgA), enquiry())
      const reviewed = await quoteRequestRepository.review(
        { ...ctxFor(orgA), actorId: 'user-1' },
        created.id,
        created.version,
        { status: 'QUALIFIED', reviewNotes: 'Real company, worth sourcing.' },
      )
      expect(reviewed?.status).toBe('QUALIFIED')
      expect(reviewed?.version).toBe(created.version + 1)
      expect(reviewed?.reviewedById).toBe('user-1')
    })

    it('refuses a stale version rather than overwriting', async () => {
      const created = await quoteRequestRepository.create(ctxFor(orgA), enquiry())
      await quoteRequestRepository.review(ctxFor(orgA), created.id, created.version, {
        status: 'IN_REVIEW',
      })
      // Second writer still holding version 1.
      expect(
        await quoteRequestRepository.review(ctxFor(orgA), created.id, created.version, {
          status: 'REJECTED',
        }),
      ).toBeNull()
    })
  })

  describe('the promoted-has-rfq constraint', () => {
    it('refuses a PROMOTED row with no RFQ', async () => {
      // The CHECK from migration 0022. PROMOTED asserts an RFQ exists, so the
      // row must name one - otherwise the status is a claim nothing backs.
      const created = await quoteRequestRepository.create(ctxFor(orgA), enquiry())
      await expect(
        prisma.quoteRequest.update({
          where: { id: created.id },
          data: { status: 'PROMOTED' },
        }),
      ).rejects.toThrow()
    })

    it('accepts PROMOTED once an RFQ is named', async () => {
      const created = await quoteRequestRepository.create(ctxFor(orgA), enquiry())
      const promoted = await quoteRequestRepository.markPromoted(
        ctxFor(orgA),
        created.id,
        created.version,
        `rfq-${randomUUID().slice(0, 8)}`,
        `acct-${randomUUID().slice(0, 8)}`,
      )
      expect(promoted?.status).toBe('PROMOTED')
      expect(promoted?.rfqId).toBeTruthy()
    })
  })

  /**
   * The buyer-portal reads, against a real database.
   *
   * `list` above is the trade desk's query: it takes `buyerAccountId` optionally
   * and spreads it conditionally, which is right there and would be a disaster
   * on a portal read, because a falsy account drops the clause and returns the
   * whole tenant. These prove the portal's own queries carry both scopes
   * unconditionally.
   *
   * The fixture puts two accounts in ONE organization and a third in another,
   * every one of them with an enquiry for the same product, so a dropped
   * predicate returns somebody else's row rather than an empty list - a mistake
   * that shows up as data appearing, which is far easier to miss.
   */
  describe('portal reads are scoped to one account', () => {
    const PRODUCT = 'Turmeric Fingers'
    const mine = `acct-mine-${randomUUID().slice(0, 8)}`
    const sibling = `acct-sibling-${randomUUID().slice(0, 8)}`
    const foreign = `acct-foreign-${randomUUID().slice(0, 8)}`

    beforeAll(async () => {
      // Mine: one pending, one promoted, one rejected.
      await quoteRequestRepository.create(
        ctxFor(orgA),
        enquiry({ product: PRODUCT, buyerAccountId: mine, source: 'BUYER_PORTAL' }),
      )
      const promoted = await quoteRequestRepository.create(
        ctxFor(orgA),
        enquiry({ product: 'Promoted Goods', buyerAccountId: mine }),
      )
      await quoteRequestRepository.markPromoted(
        ctxFor(orgA),
        promoted.id,
        promoted.version,
        `rfq-${randomUUID().slice(0, 8)}`,
        mine,
      )
      const rejected = await quoteRequestRepository.create(
        ctxFor(orgA),
        enquiry({ product: 'Rejected Goods', buyerAccountId: mine }),
      )
      await quoteRequestRepository.review(ctxFor(orgA), rejected.id, rejected.version, {
        status: 'REJECTED',
      })

      // Same tenant, different account. Same product on purpose.
      await quoteRequestRepository.create(
        ctxFor(orgA),
        enquiry({ product: PRODUCT, buyerAccountId: sibling }),
      )
      // Different tenant.
      await quoteRequestRepository.create(
        ctxFor(orgB),
        enquiry({ product: PRODUCT, buyerAccountId: foreign }),
      )
      // Unattached public submission in this tenant - belongs to nobody.
      await quoteRequestRepository.create(ctxFor(orgA), enquiry({ product: PRODUCT }))
    })

    it('persists the account and the channel', async () => {
      const { items } = await quoteRequestRepository.listPendingForBuyer(orgA, mine)
      expect(items.some((i) => i.product === PRODUCT)).toBe(true)

      const row = await prisma.quoteRequest.findFirst({
        where: { organizationId: orgA, buyerAccountId: mine, product: PRODUCT },
        select: { buyerAccountId: true, source: true, status: true },
      })
      expect(row?.buyerAccountId).toBe(mine)
      expect(row?.source).toBe('BUYER_PORTAL')
      expect(row?.status).toBe('NEW')
    })

    it('excludes another account in the same organization', async () => {
      const { items } = await quoteRequestRepository.listPendingForBuyer(orgA, sibling)
      const forMine = await quoteRequestRepository.listPendingForBuyer(orgA, mine)
      // Both exist and both are for the same product - the only thing telling
      // them apart is the account clause.
      expect(items).toHaveLength(1)
      expect(forMine.items.map((i) => i.product)).not.toContain('Rejected Goods')
    })

    it('excludes another organization', async () => {
      expect((await quoteRequestRepository.listPendingForBuyer(orgB, mine)).items).toEqual([])
      expect((await quoteRequestRepository.listPendingForBuyer(orgA, foreign)).items).toEqual([])
    })

    it('returns nothing for an empty account rather than the whole tenant', async () => {
      // Written as `...(buyerAccountId ? { buyerAccountId } : {})` this returns
      // every enquiry in the organization, including the unattached public one.
      expect((await quoteRequestRepository.listPendingForBuyer(orgA, '')).items).toEqual([])
    })

    it('returns nothing for an empty organization', async () => {
      expect((await quoteRequestRepository.listPendingForBuyer('', mine)).items).toEqual([])
    })

    it('never returns an unattached public enquiry', async () => {
      const { items } = await quoteRequestRepository.listPendingForBuyer(orgA, mine)
      // The unattached row has the same product; it is excluded because its
      // account is NULL, not because of anything about its contents.
      expect(items.filter((i) => i.product === PRODUCT)).toHaveLength(1)
    })

    it('drops a promoted enquiry, so the RFQ does not appear twice', async () => {
      const { items } = await quoteRequestRepository.listPendingForBuyer(orgA, mine)
      expect(items.map((i) => i.product)).not.toContain('Promoted Goods')
    })

    it('drops a rejected enquiry', async () => {
      const { items } = await quoteRequestRepository.listPendingForBuyer(orgA, mine)
      expect(items.map((i) => i.product)).not.toContain('Rejected Goods')
    })

    it('selects no internal or staff-only column', async () => {
      const { items } = await quoteRequestRepository.listPendingForBuyer(orgA, mine)
      expect(Object.keys(items[0]!).sort()).toEqual([
        'createdAt',
        'product',
        'quantity',
        'reference',
      ])
    })

    it('fetches no contact details, staff note or lead score', async () => {
      const { items } = await quoteRequestRepository.listPendingForBuyer(orgA, mine)
      const serialized = JSON.stringify(items)
      for (const leak of ['buyer@example.test', 'A Buyer', 'system:public-quote-request']) {
        expect(serialized).not.toContain(leak)
      }
    })

    it('counts exactly what the list returns', async () => {
      // The property that matters for the overview: the tile and the page it
      // links to must never disagree. Compared against the list rather than a
      // hard-coded figure, so the two cannot drift apart as fixtures change.
      const { items } = await quoteRequestRepository.listPendingForBuyer(orgA, mine)
      expect(await quoteRequestRepository.countPendingForBuyer(orgA, mine)).toBe(items.length)
    })

    it('counts each account separately, never the tenant', async () => {
      // Both accounts hold pending enquiries in this organization. Each count
      // must match that account's OWN list - dropping the account clause makes
      // both equal the tenant total instead, which is strictly larger than
      // either.
      const [mineList, siblingList] = await Promise.all([
        quoteRequestRepository.listPendingForBuyer(orgA, mine),
        quoteRequestRepository.listPendingForBuyer(orgA, sibling),
      ])
      const [mineCount, siblingCount] = await Promise.all([
        quoteRequestRepository.countPendingForBuyer(orgA, mine),
        quoteRequestRepository.countPendingForBuyer(orgA, sibling),
      ])

      expect(mineCount).toBe(mineList.items.length)
      expect(siblingCount).toBe(siblingList.items.length)

      // The tenant genuinely holds more than either account sees, so a count
      // that ignored the account could not pass both assertions above.
      const tenantTotal = await prisma.quoteRequest.count({
        where: { organizationId: orgA, status: { in: ['NEW', 'IN_REVIEW', 'QUALIFIED'] } },
      })
      expect(tenantTotal).toBeGreaterThan(mineCount)
      expect(tenantTotal).toBeGreaterThan(siblingCount)
    })

    it('counts nothing across tenants', async () => {
      expect(await quoteRequestRepository.countPendingForBuyer(orgB, mine)).toBe(0)
      expect(await quoteRequestRepository.countPendingForBuyer(orgA, foreign)).toBe(0)
    })

    it('counts nothing for an empty account rather than the whole tenant', async () => {
      // The fail-open shape: `...(buyerAccountId ? {...} : {})` counts every
      // enquiry in the organization, including other buyers' and the unattached
      // public ones.
      expect(await quoteRequestRepository.countPendingForBuyer(orgA, '')).toBe(0)
    })

    it('counts nothing for an empty organization', async () => {
      expect(await quoteRequestRepository.countPendingForBuyer('', mine)).toBe(0)
    })

    it('reports hasMore without handing back a cursor', async () => {
      const page = await quoteRequestRepository.listPendingForBuyer(orgA, mine, 1)
      expect(page.items).toHaveLength(1)
      expect(page).not.toHaveProperty('nextCursor')
    })
  })

  describe('the duplicate guard cannot reach across accounts', () => {
    const product = `Dup Goods ${randomUUID().slice(0, 8)}`
    const one = `acct-dup-a-${randomUUID().slice(0, 8)}`
    const two = `acct-dup-b-${randomUUID().slice(0, 8)}`
    const since = () => new Date(Date.now() - 2 * 60 * 1000)

    beforeAll(async () => {
      await quoteRequestRepository.create(
        ctxFor(orgA),
        enquiry({ product, buyerAccountId: one, source: 'BUYER_PORTAL' }),
      )
    })

    it('finds this account&rsquo;s own recent submission', async () => {
      const found = await quoteRequestRepository.findRecentDuplicateForBuyer(
        orgA,
        one,
        product,
        since(),
      )
      expect(found?.reference).toMatch(/^QR-/)
    })

    it('does not let one buyer&rsquo;s enquiry suppress another&rsquo;s', async () => {
      // Same tenant, same product, different account. If this matched, the
      // second buyer would be told their requirement was already submitted and
      // no row would be written for them.
      const found = await quoteRequestRepository.findRecentDuplicateForBuyer(
        orgA,
        two,
        product,
        since(),
      )
      expect(found).toBeNull()
    })

    it('does not reach across tenants', async () => {
      expect(
        await quoteRequestRepository.findRecentDuplicateForBuyer(orgB, one, product, since()),
      ).toBeNull()
    })

    it('does not match an empty account', async () => {
      expect(
        await quoteRequestRepository.findRecentDuplicateForBuyer(orgA, '', product, since()),
      ).toBeNull()
    })

    it('ignores a submission older than the window', async () => {
      const future = new Date(Date.now() + 60 * 1000)
      expect(
        await quoteRequestRepository.findRecentDuplicateForBuyer(orgA, one, product, future),
      ).toBeNull()
    })

    it('does not match a different product', async () => {
      expect(
        await quoteRequestRepository.findRecentDuplicateForBuyer(
          orgA,
          one,
          'Something Else Entirely',
          since(),
        ),
      ).toBeNull()
    })
  })
})
