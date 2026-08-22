import { ValidationError } from '@triyara/lib'
import { describe, expect, it } from 'vitest'

import { Money, money, MONEY_SCALE } from './money'

/**
 * The kernel exists because float64 cannot hold money. These pin the two halves
 * of that claim: that native arithmetic really is wrong on ordinary export
 * figures, and that this kernel is right on the same inputs.
 */

describe('why float64 is unsafe - the regressions this kernel prevents', () => {
  it('gets right what native addition gets wrong', () => {
    // The canonical case, and not academic: 0.1 + 0.2 is a packing charge plus
    // a documentation charge.
    expect(0.1 + 0.2).not.toBe(0.3)
    expect(money('0.1').plus('0.2').toFixed(2)).toBe('0.30')
  })

  it('does not drift when a charge is added a thousand times', () => {
    let native = 0
    for (let i = 0; i < 1000; i++) native += 0.1
    expect(native).not.toBe(100)

    let exact = Money.zero()
    for (let i = 0; i < 1000; i++) exact = exact.plus('0.1')
    expect(exact.toFixed(MONEY_SCALE)).toBe('100.0000')
  })

  it('multiplies a unit price by a quantity without losing cents', () => {
    // 4.35 a unit, priced per 100: native lands on 434.99999999999994, which
    // truncates to 434 - a whole unit lost on one line.
    expect(4.35 * 100).not.toBe(435)
    expect(money('4.35').times(100).toFixed(2)).toBe('435.00')
    // 0.07 per unit is exact by luck at 1e6 but not at 100.
    expect(0.07 * 100).not.toBe(7)
    expect(money('0.07').times(100).toFixed(2)).toBe('7.00')
  })

  it('keeps a large freight total exact where float64 cannot', () => {
    // Beyond 2^53 the double grid is coarser than 1, so cents vanish.
    // eslint-disable-next-line no-loss-of-precision -- the lost precision IS the assertion
    expect(9_007_199_254_740_993).toBe(9_007_199_254_740_992)
    expect(money('9007199254740993.0001').toFixed(4)).toBe('9007199254740993.0001')
  })

  it('subtracts without the classic residue', () => {
    expect(1.0 - 0.9).not.toBe(0.1)
    expect(money('1.00').minus('0.90').toFixed(2)).toBe('0.10')
  })
})

describe('construction and parsing', () => {
  it('accepts plain decimal strings, integers and bigints', () => {
    expect(money('1234.5678').toFixed(4)).toBe('1234.5678')
    expect(money('-42.5').toFixed(2)).toBe('-42.50')
    expect(money('.5').toFixed(2)).toBe('0.50')
    expect(money(1500).toFixed(2)).toBe('1500.00')
    expect(money(-3).toFixed(2)).toBe('-3.00')
    expect(money(9007199254740993n).toString()).toBe('9007199254740993')
  })

  it('trims surrounding whitespace', () => {
    expect(money('  12.34  ').toFixed(2)).toBe('12.34')
  })

  it('is idempotent on an existing Money', () => {
    const m = money('7.77')
    expect(Money.of(m)).toBe(m)
  })

  it('accepts an object that stringifies to a decimal, e.g. a Prisma Decimal', () => {
    const prismaLike = { toString: () => '250.7500' }
    expect(money(prismaLike).toFixed(4)).toBe('250.7500')
  })

  it('refuses a fractional JS number rather than laundering its error', () => {
    // This is the central rule: 0.1 is ALREADY wrong by the time it arrives.
    expect(() => money(0.1)).toThrow(ValidationError)
    expect(() => money(0.1)).toThrow(/pass a string instead/)
  })

  it('refuses unsafe integers', () => {
    // eslint-disable-next-line no-loss-of-precision -- deliberately unsafe input
    expect(() => money(9007199254740993)).toThrow(/safe integer/)
  })

  it.each([
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
  ])('refuses %s', (_label, value) => {
    expect(() => money(value)).toThrow(/not a finite number/)
  })

  it.each([
    ['empty', ''],
    ['whitespace only', '   '],
    ['words', 'abc'],
    ['the string NaN', 'NaN'],
    ['the string Infinity', 'Infinity'],
    ['two points', '1.2.3'],
    ['trailing point', '12.'],
    ['thousands separators', '1,234.56'],
    ['currency symbol', '$12.34'],
    ['trailing unit', '12.34 USD'],
    ['exponential', '1e3'],
    ['hex', '0x10'],
    ['leading plus', '+12.34'],
  ])('refuses a malformed string: %s', (_label, value) => {
    expect(() => money(value)).toThrow(ValidationError)
  })

  it('names the offending value in the error', () => {
    expect(() => money('1,234')).toThrow(/"1,234"/)
  })
})

describe('arithmetic', () => {
  it('adds, subtracts, negates and takes absolutes', () => {
    expect(money('10.25').plus('4.75').toFixed(2)).toBe('15.00')
    expect(money('10.25').minus('4.75').toFixed(2)).toBe('5.50')
    expect(money('10.25').negated().toFixed(2)).toBe('-10.25')
    expect(money('-10.25').abs().toFixed(2)).toBe('10.25')
  })

  it('multiplies by a quantity', () => {
    expect(money('12.3456').times(3).toFixed(4)).toBe('37.0368')
    expect(money('1850.00').times('2').toFixed(2)).toBe('3700.00')
  })

  it('divides to a per-unit figure', () => {
    expect(money('1000.00').dividedBy(8).toFixed(2)).toBe('125.00')
  })

  it('refuses division by zero instead of yielding Infinity', () => {
    expect(() => money('10').dividedBy(0)).toThrow(/Division by zero/)
    expect(() => money('10').dividedBy('0.0')).toThrow(/Division by zero/)
  })

  it('keeps a non-terminating quotient precise, then rounds once', () => {
    const third = money('100').dividedBy(3)
    expect(third.toString().startsWith('33.333333333333')).toBe(true)
    // The value only becomes 4dp when asked - not before.
    expect(third.toFixed(4)).toBe('33.3333')
    // Recombining before rounding recovers the original exactly.
    expect(third.times(3).toFixed(2)).toBe('100.00')
  })

  it('computes a percentage charge', () => {
    // Insurance at 0.5% of a 45,000 CIF value.
    expect(money('45000').percentOf('0.5').toFixed(2)).toBe('225.00')
    expect(money('1234.5678').percentOf('12.5').toFixed(4)).toBe('154.3210')
  })

  it('computes a margin percentage, and refuses to invent one', () => {
    const margin = Money.percentage(money('250'), money('1000'))
    expect(margin?.toFixed(2)).toBe('25.00')
    // A margin on zero revenue is undefined; 0 would be a lie.
    expect(Money.percentage(money('250'), money('0'))).toBeNull()
  })

  it('sums a series, and treats an empty series as zero', () => {
    expect(Money.sum(['1.10', '2.20', '3.30']).toFixed(2)).toBe('6.60')
    expect(Money.sum([]).toFixed(2)).toBe('0.00')
  })

  it('rejects a malformed scalar as firmly as a malformed amount', () => {
    expect(() => money('10').times('abc')).toThrow(ValidationError)
    expect(() => money('10').times(0.5)).toThrow(/pass a string instead/)
    expect(() => money('10').percentOf('')).toThrow(ValidationError)
  })
})

describe('comparison and zero', () => {
  it('orders values', () => {
    expect(money('10').compare('20')).toBe(-1)
    expect(money('20').compare('10')).toBe(1)
    expect(money('10').compare('10.0000')).toBe(0)
    expect(money('10.5').greaterThan('10.4999')).toBe(true)
    expect(money('10.5').lessThan('10.5001')).toBe(true)
    expect(money('10').greaterThanOrEqual('10')).toBe(true)
    expect(money('10').lessThanOrEqual('10')).toBe(true)
    expect(money('1.10').equals('1.1')).toBe(true)
  })

  it('compares at full precision, not at presentation scale', () => {
    // Both render as 1.0000 at 4dp; they are NOT equal.
    const a = money('1.00001')
    const b = money('1.00002')
    expect(a.toFixed(4)).toBe(b.toFixed(4))
    expect(a.equals(b)).toBe(false)
  })

  it('classifies zero, positive and negative', () => {
    expect(Money.zero().isZero()).toBe(true)
    expect(money('0.0000').isZero()).toBe(true)
    expect(money('-0').isZero()).toBe(true)
    expect(money('-0').isNegative()).toBe(false)
    expect(money('-0.0001').isNegative()).toBe(true)
    expect(money('0.0001').isPositive()).toBe(true)
    expect(Money.zero().isPositive()).toBe(false)
    expect(Money.zero().isNegative()).toBe(false)
  })

  it('supports negative amounts, which deductions need', () => {
    expect(money('100').minus('150').toFixed(2)).toBe('-50.00')
    expect(money('-50').plus('20').toFixed(2)).toBe('-30.00')
  })
})

describe('rounding', () => {
  it('rounds half UP at the boundary', () => {
    expect(money('2.5').round(0).toFixed(0)).toBe('3')
    expect(money('3.5').round(0).toFixed(0)).toBe('4') // not banker's rounding
    expect(money('1.00005').toFixed(4)).toBe('1.0001')
    expect(money('1.00004').toFixed(4)).toBe('1.0000')
  })

  it('rounds negative halves away from zero', () => {
    expect(money('-2.5').toFixed(0)).toBe('-3')
    expect(money('-1.00005').toFixed(4)).toBe('-1.0001')
  })

  it('defaults to the schema scale of 4', () => {
    expect(MONEY_SCALE).toBe(4)
    expect(money('1.23456789').toFixed()).toBe('1.2346')
    expect(money('1.23456789').round().toString()).toBe('1.2346')
  })

  it('supports every declared scale and rejects the rest', () => {
    for (const dp of [0, 1, 2, 3, 4, 5, 6, 7, 8]) {
      expect(() => money('1.123456789').toFixed(dp)).not.toThrow()
    }
    expect(() => money('1').toFixed(9)).toThrow(/Unsupported scale/)
    expect(() => money('1').toFixed(-1)).toThrow(/Unsupported scale/)
    expect(() => money('1').round(2.5)).toThrow(/Unsupported scale/)
  })

  it('rounds once at the end, not at every step', () => {
    // Three thirds of a cent: rounding each step gives 0.00, the whole gives 0.01.
    const perStep = ['0.0033', '0.0033', '0.0034'].map((v) => money(v).round(2))
    expect(Money.sum(perStep).toFixed(2)).toBe('0.00')

    const atEnd = Money.sum(['0.0033', '0.0033', '0.0034'])
    expect(atEnd.toFixed(2)).toBe('0.01')
  })

  it('pads to exactly the requested scale', () => {
    expect(money('5').toFixed(4)).toBe('5.0000')
    expect(money('5').toFixed(0)).toBe('5')
  })
})

describe('serialization', () => {
  it('serializes as a STRING inside JSON, never a number', () => {
    const payload = JSON.stringify({ total: money('1234.5') })
    expect(payload).toBe('{"total":"1234.5000"}')
    expect(payload).not.toContain('1234.5,')
    expect(typeof JSON.parse(payload).total).toBe('string')
  })

  it('survives a JSON round trip exactly', () => {
    const original = money('9007199254740993.0001')
    const revived = money(JSON.parse(JSON.stringify({ v: original })).v)
    expect(revived.toFixed(4)).toBe('9007199254740993.0001')
  })

  it('never emits exponential notation, however large or small', () => {
    expect(money('1000000000000000000000').toString()).toBe('1000000000000000000000')
    expect(money('0.00000001').toString()).toBe('0.00000001')
    expect(money('1000000000000000000000').toString()).not.toContain('e')
  })

  it('exposes a Decimal for persistence', () => {
    expect(money('12.3400').toDecimal().toFixed(4)).toBe('12.3400')
  })

  it('hands out a Decimal that also refuses exponential notation', () => {
    // `toDecimal()` is the escape hatch: the caller holds a raw Decimal and may
    // stringify it on the way to the database. Money's own toString/toJSON use
    // toFixed and are immune, so ONLY this path proves the toExpNeg/toExpPos
    // bounds on the private constructor are doing anything. Without them these
    // are "1e+21" and "1.23e-8", and a Decimal(18,4) column would reject them.
    expect(money('1000000000000000000000').toDecimal().toString()).toBe('1000000000000000000000')
    expect(money('0.0000000123').toDecimal().toString()).toBe('0.0000000123')
  })
})

describe('immutability and identity', () => {
  it('never mutates the receiver', () => {
    const base = money('100.00')
    base.plus('50')
    base.times(3)
    base.round(0)
    expect(base.toFixed(2)).toBe('100.00')
  })

  it('recognises its own instances', () => {
    expect(Money.isMoney(money('1'))).toBe(true)
    expect(Money.isMoney('1')).toBe(false)
    expect(Money.isMoney(null)).toBe(false)
  })
})

describe('a realistic export cost chain', () => {
  it('carries precision through the chain and rounds once', () => {
    // 12,500 kg at 3.47/kg, +2.5% packing, +1,850 freight, +0.5% insurance.
    const goods = money('3.47').times(12_500)
    const packing = goods.percentOf('2.5')
    const fob = goods.plus(packing)
    const freight = money('1850.00')
    const cfr = fob.plus(freight)
    const insurance = cfr.percentOf('0.5')
    const cif = cfr.plus(insurance)

    expect(goods.toFixed(2)).toBe('43375.00')
    expect(fob.toFixed(2)).toBe('44459.38') // 43375 + 1084.375, rounded once
    expect(cfr.toFixed(2)).toBe('46309.38')
    expect(insurance.toFixed(6)).toBe('231.546875')
    expect(cif.toString()).toBe('46540.921875') // full precision retained
    expect(cif.toFixed(2)).toBe('46540.92')

    // Per unit, from the unrounded CIF - not from the displayed one.
    expect(cif.dividedBy(12_500).toFixed(4)).toBe('3.7233')
  })

  it('reports margin from unrounded inputs', () => {
    // Continues the chain above: the CIF carried at full precision, not 46540.92.
    const cost = money('46540.921875')
    const selling = money('52000.00')
    const profit = selling.minus(cost)
    expect(profit.toString()).toBe('5459.078125')
    expect(profit.toFixed(2)).toBe('5459.08')
    expect(Money.percentage(profit, selling)?.toFixed(4)).toBe('10.4982')
  })
})
