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
})
