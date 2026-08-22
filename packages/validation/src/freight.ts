import { z } from 'zod'

import { decimalString, iso4217, shipmentModeSchema } from './cost-scenario'

// Freight and logistics validation (V3.3, ADR-0012).
//
// Money is a decimal STRING validated by the money kernel, exactly as the cost
// scenario schemas do - never z.coerce.number(). See cost-scenario.ts.

/** Modes that carry a container, and therefore require one. */
const CONTAINERISED = new Set(['SEA_FCL'])
/** Modes that never carry a container, and must not name one. */
const NON_CONTAINERISED = new Set(['SEA_LCL', 'AIR', 'ROAD', 'RAIL'])

const freightShape = {
  originPortId: z.string().min(1),
  destinationPortId: z.string().min(1),
  mode: shipmentModeSchema,
  containerTypeId: z.string().min(1).nullable().optional(),
  amount: decimalString({ nonNegative: true }),
  currency: iso4217,
  source: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(1000).optional(),
  effectiveFrom: z.coerce.date(),
  effectiveTo: z.coerce.date().nullable().optional(),
}

/**
 * The three cross-field rules, applied to whatever the payload actually
 * carries. The database enforces the same three; this exists so a user gets a
 * field-level message instead of a constraint name.
 */
function refineFreight<T extends z.ZodTypeAny>(schema: T) {
  return schema.superRefine((v: Record<string, unknown>, ctx: z.RefinementCtx) => {
    const mode = v.mode as string | undefined
    const container = v.containerTypeId as string | null | undefined

    if (mode && CONTAINERISED.has(mode) && !container) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['containerTypeId'],
        message: `A container type is required for ${mode}.`,
      })
    }
    if (mode && NON_CONTAINERISED.has(mode) && container) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['containerTypeId'],
        message: `${mode} does not carry a container type.`,
      })
    }

    const from = v.effectiveFrom as Date | undefined
    const to = v.effectiveTo as Date | null | undefined
    if (from && to && to <= from) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['effectiveTo'],
        message: 'The validity period must end after it starts.',
      })
    }

    const origin = v.originPortId as string | undefined
    const destination = v.destinationPortId as string | undefined
    if (origin && destination && origin === destination) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['destinationPortId'],
        message: 'Origin and destination must be different ports.',
      })
    }
  })
}

export const createFreightRateSchema = refineFreight(z.object(freightShape))
export type CreateFreightRateDto = z.infer<typeof createFreightRateSchema>

export const updateFreightRateSchema = refineFreight(
  z
    .object(freightShape)
    .partial()
    .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' }),
)
export type UpdateFreightRateDto = z.infer<typeof updateFreightRateSchema>

export const listFreightRatesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().optional(),
  originPortId: z.string().min(1).optional(),
  destinationPortId: z.string().min(1).optional(),
  mode: shipmentModeSchema.optional(),
  containerTypeId: z.string().min(1).optional(),
  effectiveOn: z.coerce.date().optional(),
  includeDeleted: z.enum(['true', 'false']).optional(),
})
export type ListFreightRatesQuery = z.infer<typeof listFreightRatesQuerySchema>

export const listPortsQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  countryCode: z.string().trim().length(2).toUpperCase().optional(),
  mode: shipmentModeSchema.optional(),
  includeInactive: z.enum(['true', 'false']).optional(),
})
export type ListPortsQuery = z.infer<typeof listPortsQuerySchema>

export const listContainerTypesQuerySchema = z.object({
  includeInactive: z.enum(['true', 'false']).optional(),
})
export type ListContainerTypesQuery = z.infer<typeof listContainerTypesQuerySchema>
