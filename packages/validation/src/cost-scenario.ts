import { Money } from '@triyara/money'
import { z } from 'zod'

// Cost scenario validation (V3, ADR-0012).
//
// Money is a decimal STRING here, not `z.coerce.number()` as the quotation
// schemas use. That difference is the point of V3: a JSON number has already
// lost precision by the time zod sees it, and ADR-0012 requires monetary values
// to cross the boundary as strings. The quotation schemas are left exactly as
// they are - they belong to the frozen engine.

/**
 * A monetary or decimal string, validated by the money kernel itself.
 *
 * Parsing through `Money.of` rather than re-implementing a regex here means
 * there is ONE definition of what a valid monetary value is. A second copy in
 * this file would drift from the kernel the first time either changed.
 */
const decimalString = (opts: { positive?: boolean; nonNegative?: boolean } = {}) =>
  z
    .string()
    .trim()
    .min(1)
    .superRefine((value, ctx) => {
      let parsed: Money
      try {
        parsed = Money.of(value)
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Expected a plain decimal string, e.g. "1234.5600"',
        })
        return
      }
      if (opts.positive && !parsed.isPositive()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Must be greater than zero' })
      }
      if (opts.nonNegative && parsed.isNegative()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Must not be negative' })
      }
    })

const iso4217 = z.string().trim().length(3).toUpperCase()
const iso3166 = z.string().trim().length(2).toUpperCase()
/** UN/LOCODE: two-letter country plus a three-character location code. */
const locode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}[A-Z0-9]{3}$/, 'Expected a UN/LOCODE, e.g. "INNSA"')

export const incotermSchema = z.enum([
  'EXW',
  'FCA',
  'FAS',
  'FOB',
  'CFR',
  'CIF',
  'CPT',
  'CIP',
  'DAP',
  'DPU',
  'DDP',
])

export const shipmentModeSchema = z.enum([
  'SEA_FCL',
  'SEA_LCL',
  'AIR',
  'ROAD',
  'RAIL',
  'MULTIMODAL',
])

/** Reused verbatim from the quotation domain - see ADR-0012. */
export const costChargeTypeSchema = z.enum([
  'FREIGHT',
  'INSURANCE',
  'PACKING',
  'SAMPLING',
  'HANDLING',
  'INSPECTION',
  'CERTIFICATION',
  'DOCUMENTATION',
  'BANK_CHARGES',
  'DISCOUNT',
  'SURCHARGE',
  'OTHER',
])

export const costChargeBasisSchema = z.enum([
  'FIXED_AMOUNT',
  'PERCENTAGE',
  'PER_UNIT',
  'PER_WEIGHT',
  'PER_CONTAINER',
])

export const costScenarioChargeSchema = z.object({
  type: costChargeTypeSchema,
  basis: costChargeBasisSchema.default('FIXED_AMOUNT'),
  label: z.string().trim().max(160).optional(),
  /** Percentage for PERCENTAGE; the per-unit/kg/container figure otherwise. */
  rate: decimalString().optional(),
  amount: decimalString({ nonNegative: true }),
  currency: iso4217,
  isDeduction: z.boolean().default(false),
  sequence: z.coerce.number().int().min(0).optional(),
  notes: z.string().trim().max(1000).optional(),
})
export type CostScenarioChargeDto = z.infer<typeof costScenarioChargeSchema>

const scenarioShape = {
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(4000).optional(),

  productId: z.string().min(1),
  quantity: decimalString({ positive: true }),
  unit: z.string().trim().min(1).max(24),

  /** Optional by design: a scenario need not belong to a buyer. */
  buyerId: z.string().min(1).nullable().optional(),

  incoterm: incotermSchema,
  originLocode: locode.optional(),
  destinationLocode: locode.optional(),
  destinationCountry: iso3166.optional(),
  mode: shipmentModeSchema.optional(),

  grossWeightKg: decimalString({ nonNegative: true }).optional(),
  volumeCbm: decimalString({ nonNegative: true }).optional(),
  containerCount: z.coerce.number().int().min(0).max(10_000).optional(),

  unitCost: decimalString({ nonNegative: true }),

  currency: iso4217,
  baseCurrency: iso4217,
  fxRate: decimalString({ positive: true }).optional(),
  fxRateDate: z.coerce.date().optional(),

  sellingPricePerUnit: decimalString({ nonNegative: true }).optional(),

  charges: z.array(costScenarioChargeSchema).max(100).optional(),
}

export const createCostScenarioSchema = z.object(scenarioShape)
export type CreateCostScenarioDto = z.infer<typeof createCostScenarioSchema>

/** Every field optional; an empty body is refused rather than silently no-op. */
export const updateCostScenarioSchema = z
  .object(scenarioShape)
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' })
export type UpdateCostScenarioDto = z.infer<typeof updateCostScenarioSchema>

export const listCostScenariosQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().optional(),
  q: z.string().trim().max(160).optional(),
  productId: z.string().min(1).optional(),
  buyerId: z.string().min(1).optional(),
  incoterm: incotermSchema.optional(),
  includeDeleted: z.enum(['true', 'false']).optional(),
})
export type ListCostScenariosQuery = z.infer<typeof listCostScenariosQuerySchema>
