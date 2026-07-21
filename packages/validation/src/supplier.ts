import { z } from 'zod'

// MUST stay in sync with the Prisma ManufacturingType enum in @triyara/db.
export const MANUFACTURING_TYPES = [
  'MANUFACTURER',
  'PROCESSOR',
  'TRADER',
  'FARMER_PRODUCER',
  'CONTRACT_MANUFACTURER',
  'OTHER',
] as const
export const manufacturingTypeSchema = z.enum(MANUFACTURING_TYPES)
export type ManufacturingType = z.infer<typeof manufacturingTypeSchema>

const strArray = z.array(z.string().trim().min(1).max(80)).max(100)
const nonNegInt = z.number().int().min(0)

const supplierProfileShape = {
  manufacturingType: manufacturingTypeSchema.optional(),
  businessType: z.string().trim().max(120).optional(),
  factorySizeSqm: nonNegInt.optional(),
  employees: nonNegInt.optional(),
  productionCapacity: z.string().trim().max(120).optional(),
  annualTurnoverBand: z.string().trim().max(60).optional(),
  exportExperienceYears: z.number().int().min(0).max(100).optional(),
  primaryMarkets: strArray.optional(),
  exportCountries: strArray.optional(),
  languages: strArray.optional(),
  incoterms: strArray.optional(),
  paymentTerms: strArray.optional(),
  supportedDocuments: strArray.optional(),
  certifications: strArray.optional(),
  leadTimeDays: nonNegInt.optional(),
  moq: z.string().trim().max(60).optional(),
  packaging: z.string().trim().max(200).optional(),
  oem: z.boolean().optional(),
  odm: z.boolean().optional(),
  privateLabel: z.boolean().optional(),
  website: z.string().url().max(200).optional(),
  socialLinks: z.record(z.string(), z.string().max(200)).optional(),
  description: z.string().trim().max(2000).optional(),
}

export const createSupplierProfileSchema = z.object(supplierProfileShape)
export type CreateSupplierProfileDto = z.infer<typeof createSupplierProfileSchema>

export const updateSupplierProfileSchema = z
  .object(supplierProfileShape)
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' })
export type UpdateSupplierProfileDto = z.infer<typeof updateSupplierProfileSchema>

export const addSupplierProductSchema = z.object({
  product: z.string().trim().min(1).max(80),
  capacityPerMonth: z.string().trim().max(60).optional(),
  moq: z.string().trim().max(60).optional(),
  leadTimeDays: nonNegInt.optional(),
})
export type AddSupplierProductDto = z.infer<typeof addSupplierProductSchema>
