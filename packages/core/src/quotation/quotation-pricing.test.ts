import { describe, expect, it } from 'vitest'

import { convert, priceQuotation, round4 } from './quotation-pricing'

const line = (ref: string, quantity: number, unitPrice: number, unitCost?: number) => ({
  ref,
  quantity,
  unitPrice,
  ...(unitCost === undefined ? {} : { unitCost }),
})

describe('priceQuotation', () => {
  it('sums line subtotals into the header subtotal', () => {
    const r = priceQuotation([line('1', 36, 2380), line('2', 18, 3150)], [], [])
    expect(r.lineTotals['1']).toEqual({ lineSubtotal: 85_680, lineTotal: 85_680 })
    expect(r.subtotal).toBe(142_380)
    expect(r.grandTotal).toBe(142_380)
  })

  it('applies a fixed header charge on top of the subtotal', () => {
    const r = priceQuotation(
      [line('1', 10, 100)],
      [{ basis: 'FIXED_AMOUNT', amount: 250, isDeduction: false, sequence: 0 }],
      [],
    )
    expect(r.chargesTotal).toBe(250)
    expect(r.grandTotal).toBe(1250)
  })

  it('resolves a percentage charge against the running total, not the raw subtotal', () => {
    const r = priceQuotation(
      [line('1', 10, 100)],
      [
        { basis: 'FIXED_AMOUNT', amount: 1000, isDeduction: false, sequence: 0 },
        // 10% of 2000, not of the 1000 subtotal.
        { basis: 'PERCENTAGE', rate: 10, isDeduction: false, sequence: 1 },
      ],
      [],
    )
    expect(r.charges.at(-1)?.resolvedAmount).toBe(200)
    expect(r.grandTotal).toBe(2200)
  })

  it('honours sequence: order of conditions changes the result', () => {
    const forward = priceQuotation(
      [line('1', 10, 100)],
      [
        { basis: 'PERCENTAGE', rate: 10, isDeduction: true, sequence: 0 },
        { basis: 'FIXED_AMOUNT', amount: 500, isDeduction: false, sequence: 1 },
      ],
      [],
    )
    const reversed = priceQuotation(
      [line('1', 10, 100)],
      [
        { basis: 'FIXED_AMOUNT', amount: 500, isDeduction: false, sequence: 0 },
        { basis: 'PERCENTAGE', rate: 10, isDeduction: true, sequence: 1 },
      ],
      [],
    )
    // Discount first: 1000 - 100 + 500 = 1400. Freight first: 1500 - 150 = 1350.
    expect(forward.grandTotal).toBe(1400)
    expect(reversed.grandTotal).toBe(1350)
  })

  it('separates deductions from additions in the roll-ups', () => {
    const r = priceQuotation(
      [line('1', 10, 100)],
      [
        { basis: 'FIXED_AMOUNT', amount: 300, isDeduction: false, sequence: 0 },
        { basis: 'FIXED_AMOUNT', amount: 120, isDeduction: true, sequence: 1 },
      ],
      [],
    )
    expect(r.chargesTotal).toBe(300)
    expect(r.discountTotal).toBe(120)
    expect(r.grandTotal).toBe(1180)
  })

  it('resolves a per-unit charge from total quantity at header scope', () => {
    const r = priceQuotation(
      [line('1', 24, 1490)],
      [{ basis: 'PER_UNIT', rate: 18, isDeduction: false, sequence: 0 }],
      [],
    )
    expect(r.chargesTotal).toBe(432)
  })

  it('applies a line-scoped charge to that line only', () => {
    const r = priceQuotation(
      [line('1', 10, 100), line('2', 10, 100)],
      [{ lineRef: '2', basis: 'FIXED_AMOUNT', amount: 50, isDeduction: false, sequence: 0 }],
      [],
    )
    expect(r.lineTotals['1']?.lineTotal).toBe(1000)
    expect(r.lineTotals['2']?.lineTotal).toBe(1050)
    expect(r.grandTotal).toBe(2050)
  })

  it('taxes the total after charges and discounts', () => {
    const r = priceQuotation(
      [line('1', 10, 100)],
      [{ basis: 'FIXED_AMOUNT', amount: 200, isDeduction: false, sequence: 0 }],
      [{ ratePercent: 18, isCompound: false, isReverseCharge: false, sequence: 0 }],
    )
    expect(r.taxes[0]?.resolvedTaxableAmount).toBe(1200)
    expect(r.taxTotal).toBe(216)
    expect(r.grandTotal).toBe(1416)
  })

  it('records a reverse-charge tax without collecting it', () => {
    const r = priceQuotation(
      [line('1', 10, 100)],
      [],
      [{ ratePercent: 19, isCompound: false, isReverseCharge: true, sequence: 0 }],
    )
    expect(r.taxes[0]?.resolvedAmount).toBe(190)
    expect(r.taxTotal).toBe(0)
    expect(r.grandTotal).toBe(1000)
  })

  it('levies a compound tax on a base that includes earlier tax', () => {
    const r = priceQuotation(
      [line('1', 10, 100)],
      [],
      [
        { ratePercent: 10, isCompound: false, isReverseCharge: false, sequence: 0 },
        { ratePercent: 10, isCompound: true, isReverseCharge: false, sequence: 1 },
      ],
    )
    // Second tax sees 1100, not 1000.
    expect(r.taxes[1]?.resolvedTaxableAmount).toBe(1100)
    expect(r.taxTotal).toBe(210)
  })

  it('computes margin only when every line carries a cost', () => {
    const costed = priceQuotation([line('1', 10, 100, 80)], [], [])
    expect(costed.costTotal).toBe(800)
    expect(costed.marginPercent).toBe(20)

    const partial = priceQuotation([line('1', 10, 100, 80), line('2', 10, 100)], [], [])
    expect(partial.costTotal).toBeNull()
    expect(partial.marginPercent).toBeNull()
  })

  it('reports a negative margin rather than clamping it', () => {
    const r = priceQuotation([line('1', 10, 100, 130)], [], [])
    expect(r.marginPercent).toBe(-30)
  })

  it('ignores a charge that targets a line which is not present', () => {
    const r = priceQuotation(
      [line('1', 10, 100)],
      [{ lineRef: 'ghost', basis: 'FIXED_AMOUNT', amount: 999, isDeduction: false, sequence: 0 }],
      [],
    )
    expect(r.chargesTotal).toBe(0)
    expect(r.grandTotal).toBe(1000)
  })

  it('returns zeroed totals for an empty quotation', () => {
    const r = priceQuotation([], [], [])
    expect(r.subtotal).toBe(0)
    expect(r.grandTotal).toBe(0)
    expect(r.costTotal).toBeNull()
  })

  it('reproduces the seeded QT-2026-0001 roll-ups exactly', () => {
    const r = priceQuotation(
      [line('1', 36, 2380, 1940), line('2', 18, 3150, 2610)],
      [
        { basis: 'FIXED_AMOUNT', amount: 2400, isDeduction: false, sequence: 0 },
        { basis: 'PERCENTAGE', rate: 0.35, isDeduction: false, sequence: 1 },
        { basis: 'FIXED_AMOUNT', amount: 450, isDeduction: false, sequence: 2 },
        { basis: 'PERCENTAGE', rate: 1.5, isDeduction: true, sequence: 3 },
      ],
      [{ ratePercent: 0, isCompound: false, isReverseCharge: false, sequence: 0 }],
    )
    expect(r.subtotal).toBe(142_380)
    expect(r.chargesTotal).toBe(3356.73)
    expect(r.discountTotal).toBe(2186.051)
    expect(r.grandTotal).toBe(143_550.679)
    expect(r.marginPercent).toBe(17.952)
  })
})

describe('round4', () => {
  it('rounds to four decimal places', () => {
    expect(round4(1.00005)).toBe(1.0001)
    expect(round4(2.000_04)).toBe(2)
  })
})

describe('convert', () => {
  it('multiplies by a frozen rate', () => {
    expect(convert(100, 83.45)).toBe(8345)
  })

  it('refuses to guess when no usable rate is supplied', () => {
    expect(convert(100, null)).toBeNull()
    expect(convert(100, 0)).toBeNull()
    expect(convert(100, -1)).toBeNull()
    expect(convert(100, Number.NaN)).toBeNull()
  })
})
