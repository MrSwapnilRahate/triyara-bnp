import { ValidationError } from '@triyara/lib'
import DecimalJs from 'decimal.js'

/**
 * Decimal-safe monetary arithmetic (ADR-0012).
 *
 * The quotation engine computes in float64 and rounds after every step, which
 * compounds error rather than containing it. This is the replacement kernel for
 * V3: precision is carried at full width through the whole chain and rounded
 * ONCE, at the presentation boundary. `quotation-pricing.ts` is untouched - see
 * ADR-0012 for why a sent quotation's arithmetic must not change underneath it.
 *
 * `Money` is unit-agnostic on purpose. Currency lives beside the amount in the
 * schema (`Decimal(18,4)` + `Char(3)`), so pairing an amount with a currency -
 * and refusing to add USD to INR - is the domain layer's job, not the kernel's.
 * Keeping it out here is what lets the same type carry a percentage.
 */

/**
 * A private Decimal constructor.
 *
 * decimal.js configuration is GLOBAL: any dependency calling `Decimal.set()`
 * would silently change our arithmetic. Cloning gives this kernel a constructor
 * nothing else can reach.
 *
 *  - precision 34   decimal128-class significant digits, so division has room
 *                   to be meaningful before the single presentation rounding
 *  - ROUND_HALF_UP  the contract in ADR-0012; on a tie the magnitude grows, so
 *                   -0.5 rounds to -1 (half away from zero)
 *  - toExpNeg/Pos   pushed to the extremes so `toString()` NEVER returns
 *                   exponential notation. Money crosses the API as a string;
 *                   "1e+21" reaching a caller would be a parsing bug.
 */
const D = DecimalJs.clone({
  precision: 34,
  rounding: DecimalJs.ROUND_HALF_UP,
  toExpNeg: -9e15,
  toExpPos: 9e15,
})

type DecimalInstance = InstanceType<typeof D>

/** Scale of `Decimal(18,4)` in the schema, and the default presentation scale. */
export const MONEY_SCALE = 4

/** Decimal places `round`/`toFixed` accept. Anything else is rejected. */
export const SUPPORTED_SCALES = [0, 1, 2, 3, 4, 5, 6, 7, 8] as const
export type Scale = (typeof SUPPORTED_SCALES)[number]

/**
 * Accepted string form: an optional sign, then digits with at most one point.
 *
 * Exponential notation is deliberately refused. `"1e400"` is `Infinity` the
 * moment anything treats it as a number, and no genuine monetary input arrives
 * in that form - so accepting it buys nothing and hides a class of bug.
 */
const NUMERIC = /^-?(?:\d+(?:\.\d+)?|\.\d+)$/

/** What `Money.of` accepts. Note `number` is restricted - see `fromNumber`. */
export type MoneyInput = Money | string | number | bigint | { toString(): string }

/** A multiplier or divisor. Never a `Money`: money times money has no meaning. */
export type ScalarInput = string | number | bigint | { toString(): string }

function invalid(value: unknown, why: string): never {
  const shown = typeof value === 'string' ? JSON.stringify(value) : String(value)
  throw new ValidationError(`Invalid monetary value ${shown}: ${why}`)
}

/**
 * `number` is accepted ONLY as a safe integer.
 *
 * A fractional double is already imprecise before it reaches us - `0.1` is not
 * one tenth - so accepting it would launder exactly the error this kernel
 * exists to prevent. Callers with a fraction must pass a string, which is
 * lossless.
 */
function fromNumber(value: number): DecimalInstance {
  if (!Number.isFinite(value)) invalid(value, 'not a finite number')
  if (!Number.isInteger(value)) {
    invalid(value, 'a fractional number is already imprecise - pass a string instead')
  }
  if (!Number.isSafeInteger(value)) invalid(value, 'outside the safe integer range')
  return new D(value)
}

function toDecimal(value: MoneyInput | ScalarInput, label: string): DecimalInstance {
  if (value instanceof Money) return value.decimal
  if (typeof value === 'number') return fromNumber(value)
  if (typeof value === 'bigint') return new D(value.toString())

  const text = typeof value === 'string' ? value.trim() : String(value).trim()
  if (text === '') invalid(value, `${label} is empty`)
  if (!NUMERIC.test(text)) {
    invalid(value, 'expected a plain decimal string, e.g. "1234.5600"')
  }

  const d = new D(text)
  // Belt and braces: the regex already excludes these, but a NaN or Infinity
  // reaching the arithmetic would propagate silently through every total.
  if (!d.isFinite()) invalid(value, 'not finite')
  return d
}

function assertScale(dp: number): asserts dp is Scale {
  if (!(SUPPORTED_SCALES as readonly number[]).includes(dp)) {
    throw new ValidationError(
      `Unsupported scale ${dp}: expected one of ${SUPPORTED_SCALES.join(', ')}`,
    )
  }
}

/**
 * A precise decimal amount.
 *
 * Immutable: every operation returns a new instance, so a running total can
 * never be mutated out from under a caller holding an earlier value.
 */
export class Money {
  /** @internal Full-precision value. Never rounded until asked. */
  readonly decimal: DecimalInstance

  private constructor(decimal: DecimalInstance) {
    this.decimal = decimal
  }

  /** Parses any accepted input. Throws `ValidationError` on anything else. */
  static of(value: MoneyInput): Money {
    if (value instanceof Money) return value
    return new Money(toDecimal(value, 'value'))
  }

  static zero(): Money {
    return new Money(new D(0))
  }

  static isMoney(value: unknown): value is Money {
    return value instanceof Money
  }

  /** Adds a series in one pass. Empty input is zero, not an error. */
  static sum(values: Iterable<MoneyInput>): Money {
    let total = new D(0)
    for (const v of values) total = total.plus(Money.of(v).decimal)
    return new Money(total)
  }

  /**
   * `part` as a percentage of `whole`, e.g. margin.
   *
   * Returns a `Money` carrying a percentage rather than currency - the kernel
   * is unit-agnostic. `null` when `whole` is zero, because a margin on nothing
   * is undefined and returning 0 would state something untrue.
   */
  static percentage(part: MoneyInput, whole: MoneyInput): Money | null {
    const w = Money.of(whole).decimal
    if (w.isZero()) return null
    return new Money(Money.of(part).decimal.div(w).times(100))
  }

  // ---- arithmetic -------------------------------------------------------

  plus(other: MoneyInput): Money {
    return new Money(this.decimal.plus(Money.of(other).decimal))
  }

  minus(other: MoneyInput): Money {
    return new Money(this.decimal.minus(Money.of(other).decimal))
  }

  /** Scales by a quantity or factor. Not by another `Money`. */
  times(scalar: ScalarInput): Money {
    return new Money(this.decimal.times(toDecimal(scalar, 'scalar')))
  }

  /** Divides by a quantity or factor. Division by zero is refused, not Infinity. */
  dividedBy(scalar: ScalarInput): Money {
    const d = toDecimal(scalar, 'divisor')
    if (d.isZero()) throw new ValidationError('Division by zero')
    return new Money(this.decimal.div(d))
  }

  /** `ratePercent` percent OF this amount - the PERCENTAGE charge basis. */
  percentOf(ratePercent: ScalarInput): Money {
    return new Money(this.decimal.times(toDecimal(ratePercent, 'rate')).div(100))
  }

  negated(): Money {
    return new Money(this.decimal.negated())
  }

  abs(): Money {
    return new Money(this.decimal.abs())
  }

  // ---- comparison -------------------------------------------------------

  /** -1, 0 or 1. Compares at full precision, not at presentation scale. */
  compare(other: MoneyInput): -1 | 0 | 1 {
    return this.decimal.cmp(Money.of(other).decimal) as -1 | 0 | 1
  }

  equals(other: MoneyInput): boolean {
    return this.compare(other) === 0
  }
  lessThan(other: MoneyInput): boolean {
    return this.compare(other) < 0
  }
  lessThanOrEqual(other: MoneyInput): boolean {
    return this.compare(other) <= 0
  }
  greaterThan(other: MoneyInput): boolean {
    return this.compare(other) > 0
  }
  greaterThanOrEqual(other: MoneyInput): boolean {
    return this.compare(other) >= 0
  }

  isZero(): boolean {
    return this.decimal.isZero()
  }
  isNegative(): boolean {
    return this.decimal.isNegative() && !this.decimal.isZero()
  }
  isPositive(): boolean {
    return this.decimal.greaterThan(0)
  }

  // ---- rounding and output ---------------------------------------------

  /**
   * Rounds half-up to `dp`. Explicit, because rounding is a decision.
   *
   * Call this once, at the boundary. Rounding intermediate steps is what makes
   * the existing quotation engine drift.
   */
  round(dp: number = MONEY_SCALE): Money {
    assertScale(dp)
    return new Money(this.decimal.toDecimalPlaces(dp, DecimalJs.ROUND_HALF_UP))
  }

  /** Fixed-point presentation string, half-up, always exactly `dp` places. */
  toFixed(dp: number = MONEY_SCALE): string {
    assertScale(dp)
    return this.decimal.toFixed(dp, DecimalJs.ROUND_HALF_UP)
  }

  /** Full internal precision, never exponential. Not for display. */
  toString(): string {
    return this.decimal.toFixed()
  }

  /**
   * Money crosses JSON as a STRING at the schema's scale.
   *
   * A JSON `number` silently loses precision past 2^53, and the loss is
   * invisible at the point it happens.
   */
  toJSON(): string {
    return this.toFixed(MONEY_SCALE)
  }

  /** The underlying decimal, for persistence via Prisma. */
  toDecimal(): DecimalInstance {
    return this.decimal
  }
}

/** Convenience matching the class helper, for readable call sites. */
export const money = (value: MoneyInput): Money => Money.of(value)
