// Decimal-safe monetary arithmetic for V3 cost intelligence (ADR-0012).
//
// The V3 calculation engine builds on this. The existing quotation engine at
// packages/core/src/quotation/quotation-pricing.ts is deliberately NOT migrated
// onto it - see ADR-0012.

export {
  Money,
  money,
  MONEY_SCALE,
  type MoneyInput,
  type ScalarInput,
  type Scale,
  SUPPORTED_SCALES,
} from './money'
