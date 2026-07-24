import { z } from 'zod'

// MUST stay in sync with the Prisma enums in @triyara/db.
export const BUYER_TYPES = [
  'IMPORTER',
  'DISTRIBUTOR',
  'WHOLESALER',
  'RETAILER',
  'FOOD_PROCESSOR',
  'TRADER',
  'BRAND',
  'HORECA',
  'OTHER',
] as const
export const buyerTypeSchema = z.enum(BUYER_TYPES)
export type BuyerType = z.infer<typeof buyerTypeSchema>

export const IMPORT_EXPERIENCES = ['NEW', 'YEARS_1_3', 'YEARS_3_PLUS'] as const
export const importExperienceSchema = z.enum(IMPORT_EXPERIENCES)
export type ImportExperience = z.infer<typeof importExperienceSchema>

const strArray = z.array(z.string().trim().min(1).max(80)).max(100)

const buyerProfileShape = {
  businessType: buyerTypeSchema.optional(),
  annualRequirement: z.string().trim().max(120).optional(),
  annualBudgetBand: z.string().trim().max(60).optional(),
  importExperience: importExperienceSchema.optional(),
  destinationCountries: strArray.optional(),
  destinationPort: z.string().trim().max(120).optional(),
  incoterms: strArray.optional(),
  paymentTerms: strArray.optional(),
  certificationsRequired: strArray.optional(),
  languages: strArray.optional(),
  website: z.string().url().max(200).optional(),
  socialLinks: z.record(z.string(), z.string().max(200)).optional(),
  description: z.string().trim().max(2000).optional(),
}

export const createBuyerProfileSchema = z.object(buyerProfileShape)
export type CreateBuyerProfileDto = z.infer<typeof createBuyerProfileSchema>

export const updateBuyerProfileSchema = z
  .object(buyerProfileShape)
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' })
export type UpdateBuyerProfileDto = z.infer<typeof updateBuyerProfileSchema>

export const addBuyerProductSchema = z.object({
  product: z.string().trim().min(1).max(80),
  targetVolume: z.string().trim().max(60).optional(),
  targetPrice: z.string().trim().max(60).optional(),
  frequency: z.string().trim().max(60).optional(),
})
export type AddBuyerProductDto = z.infer<typeof addBuyerProductSchema>
