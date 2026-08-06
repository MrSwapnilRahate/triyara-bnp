import type { SupplierScoreSignals } from '@triyara/db'
import { describe, expect, it } from 'vitest'

import { MAX_SUPPLIER_SCORE, scoreSupplier } from './supplier-score'

// The scoring POLICY. A pure function over signals, so these tests are about
// what the business considers a good supplier — not about queries.

const signals = (over: Partial<SupplierScoreSignals> = {}): SupplierScoreSignals => ({
  supplierId: 's1',
  isVerified: false,
  status: 'DRAFT',
  activeCertifications: 0,
  expiringCertifications: 0,
  documents: 0,
  hasReachableContact: false,
  activeOfferings: 0,
  rfqsInvited: 0,
  rfqsResponded: 0,
  quotationsSelected: 0,
  lastContactedAt: null,
  ...over,
})

const perfect = (): SupplierScoreSignals =>
  signals({
    isVerified: true,
    status: 'APPROVED',
    activeCertifications: 5,
    documents: 10,
    hasReachableContact: true,
    activeOfferings: 10,
    rfqsInvited: 10,
    rfqsResponded: 10,
    quotationsSelected: 4,
  })

const componentPoints = (s: ReturnType<typeof scoreSupplier>, key: string) =>
  s.components.find((c) => c.key === key)?.points

describe('scoreSupplier', () => {
  it('scores a fully prepared supplier at the maximum', () => {
    const result = scoreSupplier(perfect())
    expect(result.score).toBe(MAX_SUPPLIER_SCORE)
    expect(result.score).toBe(100)
    expect(result.band).toBe('ready')
  })

  it('never exceeds the maximum however good the signals', () => {
    const result = scoreSupplier(
      signals({
        isVerified: true,
        status: 'APPROVED',
        activeCertifications: 500,
        documents: 500,
        hasReachableContact: true,
        activeOfferings: 500,
        rfqsInvited: 500,
        rfqsResponded: 500,
      }),
    )
    expect(result.score).toBe(100)
  })

  it('gives an unapproved supplier nothing for verification', () => {
    const result = scoreSupplier(signals({ status: 'REJECTED', isVerified: false }))
    expect(componentPoints(result, 'verification')).toBe(0)
    expect(result.band).toBe('incomplete')
  })

  it('distinguishes approved-but-unverified from fully verified', () => {
    const approved = scoreSupplier(signals({ status: 'APPROVED', isVerified: false }))
    const verified = scoreSupplier(signals({ status: 'APPROVED', isVerified: true }))

    const a = componentPoints(approved, 'verification')!
    const v = componentPoints(verified, 'verification')!
    expect(a).toBeGreaterThan(0)
    expect(v).toBeGreaterThan(a)
  })

  it('deducts for certifications that are about to lapse', () => {
    const sound = scoreSupplier(signals({ activeCertifications: 3 }))
    const lapsing = scoreSupplier(signals({ activeCertifications: 3, expiringCertifications: 2 }))

    // A certificate expiring inside the month is a thing to raise now, not a
    // strength to count.
    expect(componentPoints(lapsing, 'certifications')!).toBeLessThan(
      componentPoints(sound, 'certifications')!,
    )
    expect(componentPoints(lapsing, 'certifications')!).toBeGreaterThanOrEqual(0)
  })

  it('never lets the certification deduction go negative', () => {
    const result = scoreSupplier(signals({ activeCertifications: 1, expiringCertifications: 20 }))
    expect(componentPoints(result, 'certifications')).toBeGreaterThanOrEqual(0)
  })

  it('treats an untested supplier as untested, not unresponsive', () => {
    const never = scoreSupplier(signals({ rfqsInvited: 0 }))
    const ignored = scoreSupplier(signals({ rfqsInvited: 8, rfqsResponded: 0 }))

    // Starting new suppliers at zero would keep them permanently at the bottom
    // of every shortlist, which is how a supplier never gets a first chance.
    expect(componentPoints(never, 'responsiveness')!).toBeGreaterThan(
      componentPoints(ignored, 'responsiveness')!,
    )
    expect(never.components.find((c) => c.key === 'responsiveness')?.detail).toMatch(/untested/i)
  })

  it('rewards a supplier that answers what it is asked', () => {
    const responsive = scoreSupplier(signals({ rfqsInvited: 10, rfqsResponded: 10 }))
    const patchy = scoreSupplier(signals({ rfqsInvited: 10, rfqsResponded: 3 }))

    expect(componentPoints(responsive, 'responsiveness')!).toBeGreaterThan(
      componentPoints(patchy, 'responsiveness')!,
    )
  })

  it('requires a contact we can actually reach', () => {
    expect(
      componentPoints(scoreSupplier(signals({ hasReachableContact: false })), 'reachability'),
    ).toBe(0)
    expect(
      componentPoints(scoreSupplier(signals({ hasReachableContact: true })), 'reachability'),
    ).toBeGreaterThan(0)
  })

  it('returns every component, including the ones worth nothing', () => {
    const result = scoreSupplier(signals())
    // A shortlist that shows only what a supplier HAS leaves the reader
    // guessing at what it lacks — the more useful half when choosing between
    // two.
    expect(result.components.map((c) => c.key).sort()).toEqual([
      'certifications',
      'coverage',
      'documents',
      'reachability',
      'responsiveness',
      'verification',
    ])
    expect(
      result.components.every((c) => typeof c.detail === 'string' && c.detail.length > 0),
    ).toBe(true)
  })

  it('explains itself in words a reader can act on', () => {
    const result = scoreSupplier(
      signals({ activeCertifications: 2, expiringCertifications: 1, documents: 1 }),
    )
    expect(result.components.find((c) => c.key === 'certifications')?.detail).toContain(
      'expiring within 30 days',
    )
    // Singular and plural both read correctly; "1 documents" is the kind of
    // detail that makes a screen look unfinished.
    expect(result.components.find((c) => c.key === 'documents')?.detail).toBe('1 document on file.')
  })

  it('bands a bare record as incomplete and a solid one as ready', () => {
    expect(scoreSupplier(signals()).band).toBe('incomplete')
    expect(scoreSupplier(perfect()).band).toBe('ready')
  })

  it('components never sum to more than their declared maximums', () => {
    const result = scoreSupplier(perfect())
    for (const component of result.components) {
      expect(component.points).toBeLessThanOrEqual(component.max)
      expect(component.points).toBeGreaterThanOrEqual(0)
    }
    expect(result.components.reduce((t, c) => t + c.max, 0)).toBe(MAX_SUPPLIER_SCORE)
  })
})
