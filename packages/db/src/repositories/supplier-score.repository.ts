import { prisma } from '../client'

// Supplier scoring signals (TRY-BNP-SUPPLIER-MATCH).
//
// This file gathers FACTS. It does no arithmetic and holds no weights: the
// scoring policy lives in core, where it can be read, argued about and changed
// without touching a query. A repository that also decided what "good" means
// would make the weighting invisible to everyone except whoever wrote it.
//
// `SupplierPerformance` is deliberately not read here. That table exists and is
// indexed on `overallScore`, but nothing in the codebase writes to it, so every
// column is null — a score built on it would be null for every supplier. These
// signals come from records the system genuinely maintains.
//
// Six aggregates for a whole page, not six per supplier. At a page of 25 the
// N+1 version would be 150 round trips.

export interface SupplierScoreSignals {
  supplierId: string
  isVerified: boolean
  status: string
  activeCertifications: number
  expiringCertifications: number
  documents: number
  hasReachableContact: boolean
  activeOfferings: number
  rfqsInvited: number
  rfqsResponded: number
  quotationsSelected: number
  lastContactedAt: Date | null
}

/** Certificates lapsing inside this window count as a risk, not a strength. */
const EXPIRY_WINDOW_DAYS = 30

/**
 * Collects the scoring signals for a set of suppliers.
 *
 * Returned keyed by supplier id. A supplier with no rows anywhere still gets an
 * entry with zeroes, so the caller never has to distinguish "no data" from
 * "not asked for" — that distinction is where scoring bugs hide.
 */
export async function collectScoreSignals(
  organizationId: string,
  supplierIds: string[],
): Promise<Map<string, SupplierScoreSignals>> {
  const empty = new Map<string, SupplierScoreSignals>()
  if (supplierIds.length === 0) return empty

  const expiryThreshold = new Date(Date.now() + EXPIRY_WINDOW_DAYS * 86_400_000)
  const scope = { organizationId, supplierId: { in: supplierIds }, deletedAt: null }

  const [
    suppliers,
    certifications,
    expiring,
    documents,
    contacts,
    offerings,
    rfqs,
    selected,
    notes,
  ] = await Promise.all([
    prisma.supplier.findMany({
      where: { id: { in: supplierIds }, organizationId, deletedAt: null },
      select: { id: true, isVerified: true, status: true },
    }),
    prisma.supplierCertification.groupBy({
      by: ['supplierId'],
      where: { ...scope, status: 'ACTIVE' },
      _count: { _all: true },
    }),
    prisma.supplierCertification.groupBy({
      by: ['supplierId'],
      where: { ...scope, status: 'ACTIVE', expiryDate: { not: null, lte: expiryThreshold } },
      _count: { _all: true },
    }),
    prisma.supplierDocument.groupBy({
      by: ['supplierId'],
      where: scope,
      _count: { _all: true },
    }),
    // Reachable means a named person we can actually contact — a row with a
    // name and no channel is not a way in.
    prisma.supplierContact.findMany({
      where: {
        ...scope,
        OR: [{ email: { not: null } }, { phone: { not: null } }, { whatsapp: { not: null } }],
      },
      select: { supplierId: true },
      distinct: ['supplierId'],
    }),
    prisma.supplierProductOffering.groupBy({
      by: ['supplierId'],
      where: { ...scope, status: 'ACTIVE' },
      _count: { _all: true },
    }),
    prisma.rFQSupplier.groupBy({
      by: ['supplierId'],
      where: { organizationId, supplierId: { in: supplierIds }, deletedAt: null },
      _count: { _all: true },
    }),
    prisma.quotationSourceOption.groupBy({
      by: ['supplierId'],
      where: { organizationId, supplierId: { in: supplierIds }, deletedAt: null, isSelected: true },
      _count: { _all: true },
    }),
    prisma.supplierNote.groupBy({
      by: ['supplierId'],
      where: { organizationId, supplierId: { in: supplierIds }, deletedAt: null },
      _max: { createdAt: true },
    }),
  ])

  // Responded is counted separately: `respondedAt` being set is the fact, and
  // a status enum could be moved through without one.
  const responded = await prisma.rFQSupplier.groupBy({
    by: ['supplierId'],
    where: {
      organizationId,
      supplierId: { in: supplierIds },
      deletedAt: null,
      respondedAt: { not: null },
    },
    _count: { _all: true },
  })

  const count = (rows: Array<{ supplierId: string; _count: { _all: number } }>) =>
    new Map(rows.map((r) => [r.supplierId, r._count._all]))

  const activeCerts = count(certifications)
  const expiringCerts = count(expiring)
  const docs = count(documents)
  const offers = count(offerings)
  const invited = count(rfqs)
  const answered = count(responded)
  const won = count(selected)
  const reachable = new Set(contacts.map((c) => c.supplierId))
  const lastNote = new Map(notes.map((n) => [n.supplierId, n._max.createdAt]))

  for (const supplier of suppliers) {
    empty.set(supplier.id, {
      supplierId: supplier.id,
      isVerified: supplier.isVerified,
      status: supplier.status,
      activeCertifications: activeCerts.get(supplier.id) ?? 0,
      expiringCertifications: expiringCerts.get(supplier.id) ?? 0,
      documents: docs.get(supplier.id) ?? 0,
      hasReachableContact: reachable.has(supplier.id),
      activeOfferings: offers.get(supplier.id) ?? 0,
      rfqsInvited: invited.get(supplier.id) ?? 0,
      rfqsResponded: answered.get(supplier.id) ?? 0,
      quotationsSelected: won.get(supplier.id) ?? 0,
      lastContactedAt: lastNote.get(supplier.id) ?? null,
    })
  }

  return empty
}

export const supplierScoreRepository = { collectScoreSignals }
export type SupplierScoreRepository = typeof supplierScoreRepository
