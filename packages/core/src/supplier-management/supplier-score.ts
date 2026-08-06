import type { SupplierScoreSignals } from '@triyara/db'

// Supplier scoring policy (TRY-BNP-SUPPLIER-MATCH).
//
// Deliberately here and not in a repository: these weights are a business
// judgement about what makes a supplier worth calling first, and they will be
// argued about. Kept as data so the argument can be had by reading one table
// rather than tracing a query.
//
// It scores READINESS, not quality. Every signal is something the system
// genuinely knows — verified, certified, documented, reachable, responsive.
// None of it claims to know whether the goods are good; nothing in the platform
// records that yet, and a score that implied otherwise would be worse than no
// score at all.
//
// `SupplierPerformance` exists in the schema with exactly the columns a quality
// score would need, and nothing writes to them. When something does, it belongs
// here alongside these — not instead of them.

export interface ScoreComponent {
  key: string
  label: string
  /** What this component contributed. */
  points: number
  /** The most it could have contributed. */
  max: number
  /** Why it scored what it did, in words a reader can act on. */
  detail: string
}

export interface SupplierScore {
  supplierId: string
  /** 0-100. */
  score: number
  band: 'ready' | 'usable' | 'incomplete'
  components: ScoreComponent[]
}

const WEIGHTS = {
  verification: 25,
  certifications: 20,
  documents: 15,
  reachability: 10,
  coverage: 15,
  responsiveness: 15,
} as const

/** Enough certificates to be credible; more adds nothing to readiness. */
const CERTS_FOR_FULL_MARKS = 3
const DOCS_FOR_FULL_MARKS = 4
const OFFERINGS_FOR_FULL_MARKS = 5

/** Below this, an RFQ record is too thin to read anything into. */
const MIN_RFQS_FOR_RESPONSIVENESS = 2

const clamp = (value: number, max: number) => Math.max(0, Math.min(max, value))
const scaled = (count: number, target: number, weight: number) =>
  clamp(Math.round((Math.min(count, target) / target) * weight), weight)

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`
}

/**
 * Turns signals into a score and the reasons for it.
 *
 * Always returns every component, including the ones worth zero. A shortlist
 * that shows only what a supplier has leaves the reader guessing at what it
 * lacks, which is the more useful half when choosing between two.
 */
export function scoreSupplier(signals: SupplierScoreSignals): SupplierScore {
  const components: ScoreComponent[] = []

  // Verification. Approved AND verified is the whole mark; approved alone is
  // most of it; anything else is not a supplier we should be shortlisting.
  const approved = signals.status === 'APPROVED'
  const verificationPoints =
    signals.isVerified && approved
      ? WEIGHTS.verification
      : approved
        ? Math.round(WEIGHTS.verification * 0.6)
        : 0
  components.push({
    key: 'verification',
    label: 'Verification',
    points: verificationPoints,
    max: WEIGHTS.verification,
    detail:
      signals.isVerified && approved
        ? 'Approved and verified.'
        : approved
          ? 'Approved, but not verified.'
          : `Not approved (${signals.status.toLowerCase().replace(/_/g, ' ')}).`,
  })

  // Certifications. A certificate lapsing inside the month is a risk to raise
  // now, so it is deducted rather than quietly counted as a strength.
  const certBase = scaled(
    signals.activeCertifications,
    CERTS_FOR_FULL_MARKS,
    WEIGHTS.certifications,
  )
  const certPenalty = Math.min(certBase, signals.expiringCertifications * 4)
  components.push({
    key: 'certifications',
    label: 'Certifications',
    points: certBase - certPenalty,
    max: WEIGHTS.certifications,
    detail:
      signals.activeCertifications === 0
        ? 'None on file.'
        : signals.expiringCertifications > 0
          ? `${plural(signals.activeCertifications, 'active certificate')}, ${signals.expiringCertifications} expiring within 30 days.`
          : `${plural(signals.activeCertifications, 'active certificate')}.`,
  })

  components.push({
    key: 'documents',
    label: 'Documents',
    points: scaled(signals.documents, DOCS_FOR_FULL_MARKS, WEIGHTS.documents),
    max: WEIGHTS.documents,
    detail:
      signals.documents === 0
        ? 'Nothing on file.'
        : `${plural(signals.documents, 'document')} on file.`,
  })

  components.push({
    key: 'reachability',
    label: 'Reachable',
    points: signals.hasReachableContact ? WEIGHTS.reachability : 0,
    max: WEIGHTS.reachability,
    detail: signals.hasReachableContact
      ? 'A named contact with a way to reach them.'
      : 'No contact with an email, phone or WhatsApp.',
  })

  components.push({
    key: 'coverage',
    label: 'Product coverage',
    points: scaled(signals.activeOfferings, OFFERINGS_FOR_FULL_MARKS, WEIGHTS.coverage),
    max: WEIGHTS.coverage,
    detail:
      signals.activeOfferings === 0
        ? 'No products listed against them.'
        : `${plural(signals.activeOfferings, 'active offering')}.`,
  })

  // Responsiveness. An untested supplier scores the middle, not zero: never
  // having been asked is not the same as having been asked and ignoring us,
  // and starting them at nothing would keep new suppliers permanently at the
  // bottom of every shortlist.
  let responsivenessPoints: number
  let responsivenessDetail: string
  if (signals.rfqsInvited < MIN_RFQS_FOR_RESPONSIVENESS) {
    responsivenessPoints = Math.round(WEIGHTS.responsiveness * 0.5)
    responsivenessDetail =
      signals.rfqsInvited === 0
        ? 'Never sent an RFQ — untested, not unresponsive.'
        : 'Only one RFQ so far; too little to judge.'
  } else {
    const rate = signals.rfqsResponded / signals.rfqsInvited
    responsivenessPoints = clamp(Math.round(rate * WEIGHTS.responsiveness), WEIGHTS.responsiveness)
    responsivenessDetail = `Replied to ${signals.rfqsResponded} of ${plural(signals.rfqsInvited, 'RFQ')}${
      signals.quotationsSelected > 0
        ? `; chosen on ${plural(signals.quotationsSelected, 'quotation')}.`
        : '.'
    }`
  }
  components.push({
    key: 'responsiveness',
    label: 'Responsiveness',
    points: responsivenessPoints,
    max: WEIGHTS.responsiveness,
    detail: responsivenessDetail,
  })

  const score = clamp(
    components.reduce((total, c) => total + c.points, 0),
    100,
  )

  return {
    supplierId: signals.supplierId,
    score,
    band: score >= 75 ? 'ready' : score >= 45 ? 'usable' : 'incomplete',
    components,
  }
}

/** The maximum a supplier can score, so a UI can render a scale it did not invent. */
export const MAX_SUPPLIER_SCORE = Object.values(WEIGHTS).reduce((a, b) => a + b, 0)
