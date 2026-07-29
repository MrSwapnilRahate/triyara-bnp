import { z } from 'zod'

// Product Catalog contracts (TRY-BNP-CATALOG-S1).

export const PRODUCT_STATUSES = [
  'DRAFT',
  'PENDING_REVIEW',
  'ACTIVE',
  'DISCONTINUED',
  'ARCHIVED',
] as const
export const productStatusSchema = z.enum(PRODUCT_STATUSES)
export type ProductStatusName = z.infer<typeof productStatusSchema>

export const SPEC_DATA_TYPES = ['STRING', 'NUMBER', 'BOOLEAN', 'DATE', 'ENUM'] as const
export const specDataTypeSchema = z.enum(SPEC_DATA_TYPES)

const slug = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Must be lowercase words separated by hyphens.')

// ---- Category ----

export const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(200),
  slug: slug.optional(),
  description: z.string().trim().max(2000).optional(),
  parentId: z.string().min(1).optional(),
  sortOrder: z.coerce.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
})
export type CreateCategoryDto = z.infer<typeof createCategorySchema>

export const updateCategorySchema = createCategorySchema.partial().extend({
  /** Explicit null detaches the category to the root. */
  parentId: z.string().min(1).nullable().optional(),
})
export type UpdateCategoryDto = z.infer<typeof updateCategorySchema>

export const listCategoriesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
  parentId: z.string().optional(),
  /** Subtree filter, matched against the materialised path. */
  pathPrefix: z.string().optional(),
  isActive: z.enum(['true', 'false']).optional(),
  q: z.string().trim().optional(),
})
export type ListCategoriesQuery = z.infer<typeof listCategoriesQuerySchema>

// ---- Product specifications (EAV values supplied with a product) ----

export const productSpecificationInputSchema = z.object({
  definitionId: z.string().min(1),
  value: z.string().trim().min(1).max(500),
})
export type ProductSpecificationInput = z.infer<typeof productSpecificationInputSchema>

// ---- Product ----

const productShape = {
  sku: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(200),
  slug: slug.optional(),
  shortDescription: z.string().trim().max(500).optional(),
  description: z.string().trim().max(20000).optional(),
  categoryId: z.string().min(1),
  /** ISO 3166-1 alpha-2. */
  countryOfOrigin: z
    .string()
    .trim()
    .length(2)
    .regex(/^[A-Z]{2}$/, 'Must be an ISO 3166-1 alpha-2 code.')
    .optional(),
  brand: z.string().trim().max(120).optional(),
  /** HS/HSN, 6-12 digits, unformatted. */
  hsCode: z
    .string()
    .trim()
    .regex(/^\d{6,12}$/, 'Must be 6-12 digits.')
    .optional(),
  status: productStatusSchema.default('DRAFT'),
  isActive: z.boolean().default(true),
  specifications: z.array(productSpecificationInputSchema).max(100).optional(),
  tagIds: z.array(z.string().min(1)).max(50).optional(),
}

export const createProductSchema = z.object(productShape)
export type CreateProductDto = z.infer<typeof createProductSchema>

export const updateProductSchema = z.object({
  ...productShape,
  sku: z.string().trim().min(1).max(64).optional(),
  name: z.string().trim().min(1).max(200).optional(),
  categoryId: z.string().min(1).optional(),
  status: productStatusSchema.optional(),
  isActive: z.boolean().optional(),
})
export type UpdateProductDto = z.infer<typeof updateProductSchema>

export const listProductsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().optional(),
  /** Free text over name, sku, brand and short description. */
  q: z.string().trim().optional(),
  categoryId: z.string().optional(),
  /** Includes every descendant category, via the materialised path. */
  categoryPathPrefix: z.string().optional(),
  status: productStatusSchema.optional(),
  brand: z.string().trim().optional(),
  countryOfOrigin: z.string().trim().length(2).optional(),
  hsCode: z.string().trim().optional(),
  tagId: z.string().optional(),
  isActive: z.enum(['true', 'false']).optional(),
  includeDeleted: z.enum(['true', 'false']).optional(),
  sort: z.enum(['createdAt', '-createdAt', 'name', '-name', 'sku', '-sku']).optional(),
})
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>

// ---- Specification definitions (master data) ----

export const createSpecDefinitionSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: slug.optional(),
  unit: z.string().trim().max(32).optional(),
  dataType: specDataTypeSchema.default('STRING'),
  allowedValues: z.array(z.string().trim().min(1).max(120)).max(100).default([]),
  isFilterable: z.boolean().default(false),
  isRequired: z.boolean().default(false),
  sortOrder: z.coerce.number().int().min(0).default(0),
})
export type CreateSpecDefinitionDto = z.infer<typeof createSpecDefinitionSchema>
