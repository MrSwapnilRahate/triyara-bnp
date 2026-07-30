// Quotation pricing engine (TRY-BNP-QUOTE-01).
//
// Pure functions: no I/O, no Prisma. The service calls these and persists the
// result, because a sent quotation is a commercial commitment and its
// arithmetic must be frozen, not recomputed on read.
//
// Charges are evaluated as ORDERED CONDITIONS (the SAP condition technique):
// each condition resolves against a base that may already include earlier
// conditions, so `sequence` is significant. Discounts are charges with
// isDeduction, not a separate concept.

export type ChargeBasis =
  'FIXED_AMOUNT' | 'PERCENTAGE' | 'PER_UNIT' | 'PER_WEIGHT' | 'PER_CONTAINER'

export interface PricingLine {
  /** Stable key so charges and taxes can target a specific line. */
  ref: string
  quantity: number
  unitPrice: number
  unitCost?: number
}

export interface PricingCharge {
  /** Null for a header charge; a line ref for a line charge. */
  lineRef?: string | null
  basis: ChargeBasis
  /** Percentage when basis is PERCENTAGE, else the per-unit or fixed figure. */
  rate?: number
  /** Pre-resolved amount. Used directly when basis is FIXED_AMOUNT. */
  amount?: number
  isDeduction: boolean
  sequence: number
}

export interface PricingTax {
  lineRef?: string | null
  ratePercent: number
  /** Explicit taxable base; defaults to the running total when omitted. */
  taxableAmount?: number
  isCompound: boolean
  isReverseCharge: boolean
  sequence: number
}

export interface ResolvedCharge extends PricingCharge {
  resolvedAmount: number
}

export interface ResolvedTax extends PricingTax {
  resolvedTaxableAmount: number
  resolvedAmount: number
}

export interface PricingResult {
  lineTotals: Record<string, { lineSubtotal: number; lineTotal: number }>
  subtotal: number
  chargesTotal: number
  discountTotal: number
  taxTotal: number
  grandTotal: number
  costTotal: number | null
  marginPercent: number | null
  charges: ResolvedCharge[]
  taxes: ResolvedTax[]
}

/** Money is rounded to 4 decimal places, matching Decimal(18,4) in the schema. */
export function round4(n: number): number {
  return Math.round((n + Number.EPSILON) * 10_000) / 10_000
}

function resolveCharge(c: PricingCharge, base: number, quantity: number): number {
  switch (c.basis) {
    case 'PERCENTAGE':
      return round4((base * (c.rate ?? 0)) / 100)
    case 'PER_UNIT':
      return round4((c.rate ?? 0) * quantity)
    // PER_WEIGHT and PER_CONTAINER carry their own pre-computed amount: weight
    // and container count are not properties of a quotation line.
    case 'PER_WEIGHT':
    case 'PER_CONTAINER':
    case 'FIXED_AMOUNT':
    default:
      return round4(c.amount ?? c.rate ?? 0)
  }
}

/**
 * Computes every stored monetary roll-up for a quotation.
 *
 * Order of evaluation:
 *   1. line subtotals               quantity x unitPrice
 *   2. line-scoped charges          in `sequence` order, compounding
 *   3. header-scoped charges        in `sequence` order, on the running subtotal
 *   4. taxes                        line-scoped first, then header; compound
 *                                   taxes see a base that includes earlier tax
 *   5. margin                       from unitCost where every line supplies one
 */
export function priceQuotation(
  lines: PricingLine[],
  charges: PricingCharge[],
  taxes: PricingTax[],
): PricingResult {
  const lineTotals: PricingResult['lineTotals'] = {}
  let subtotal = 0

  for (const l of lines) {
    const s = round4(l.quantity * l.unitPrice)
    lineTotals[l.ref] = { lineSubtotal: s, lineTotal: s }
    subtotal = round4(subtotal + s)
  }

  const resolvedCharges: ResolvedCharge[] = []
  let chargesTotal = 0
  let discountTotal = 0

  const bySequence = <T extends { sequence: number }>(a: T, b: T) => a.sequence - b.sequence

  // 2. line-scoped charges
  for (const c of charges.filter((c) => c.lineRef).sort(bySequence)) {
    const line = lines.find((l) => l.ref === c.lineRef)
    const bucket = c.lineRef ? lineTotals[c.lineRef] : undefined
    if (!line || !bucket) continue
    const amount = resolveCharge(c, bucket.lineTotal, line.quantity)
    const signed = c.isDeduction ? -amount : amount
    bucket.lineTotal = round4(bucket.lineTotal + signed)
    if (c.isDeduction) discountTotal = round4(discountTotal + amount)
    else chargesTotal = round4(chargesTotal + amount)
    resolvedCharges.push({ ...c, resolvedAmount: amount })
  }

  // Line charges shift the subtotal the header charges are computed against.
  let running = round4(Object.values(lineTotals).reduce((sum, b) => sum + b.lineTotal, 0))

  // 3. header-scoped charges
  const totalQuantity = lines.reduce((sum, l) => sum + l.quantity, 0)
  for (const c of charges.filter((c) => !c.lineRef).sort(bySequence)) {
    const amount = resolveCharge(c, running, totalQuantity)
    const signed = c.isDeduction ? -amount : amount
    running = round4(running + signed)
    if (c.isDeduction) discountTotal = round4(discountTotal + amount)
    else chargesTotal = round4(chargesTotal + amount)
    resolvedCharges.push({ ...c, resolvedAmount: amount })
  }

  // 4. taxes
  const resolvedTaxes: ResolvedTax[] = []
  let taxTotal = 0
  for (const t of [...taxes].sort(bySequence)) {
    const lineBase = t.lineRef ? lineTotals[t.lineRef]?.lineTotal : undefined
    // A compound tax is levied on a base that already includes earlier tax.
    const base =
      t.taxableAmount ?? lineBase ?? (t.isCompound ? round4(running + taxTotal) : running)
    const amount = round4((base * t.ratePercent) / 100)
    // Reverse charge shifts liability to the buyer: recorded, not added.
    if (!t.isReverseCharge) taxTotal = round4(taxTotal + amount)
    resolvedTaxes.push({ ...t, resolvedTaxableAmount: base, resolvedAmount: amount })
  }

  const grandTotal = round4(running + taxTotal)

  // 5. margin - only when every line carries a cost, otherwise it would be a
  // half-informed number presented as fact.
  const allCosted = lines.length > 0 && lines.every((l) => typeof l.unitCost === 'number')
  const costTotal = allCosted
    ? round4(lines.reduce((sum, l) => sum + l.quantity * (l.unitCost ?? 0), 0))
    : null
  const marginPercent =
    costTotal !== null && subtotal > 0
      ? Math.round(((subtotal - costTotal) / subtotal) * 100 * 10_000) / 10_000
      : null

  return {
    lineTotals,
    subtotal,
    chargesTotal,
    discountTotal,
    taxTotal,
    grandTotal,
    costTotal,
    marginPercent,
    charges: resolvedCharges,
    taxes: resolvedTaxes,
  }
}

/** Converts an amount using a frozen rate. Returns null when no rate applies. */
export function convert(amount: number, rate: number | null | undefined): number | null {
  if (rate === null || rate === undefined || !Number.isFinite(rate) || rate <= 0) return null
  return round4(amount * rate)
}
