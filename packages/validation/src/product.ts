import { z } from 'zod'

export const PRODUCT_STATUSES = ['DRAFT', 'ACTIVE', 'ARCHIVED'] as const
export const productStatusSchema = z.enum(PRODUCT_STATUSES)
export type ProductStatus = z.infer<typeof productStatusSchema>

export const ATTRIBUTE_DATA_TYPES = ['STRING', 'NUMBER', 'BOOLEAN'] as const
export const attributeDataTypeSchema = z.enum(ATTRIBUTE_DATA_TYPES)
export type AttributeDataType = z.infer<typeof attributeDataTypeSchema>

const sku = z
  .string()
  .trim()
  .min(2)
  .max(64)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, 'SKU: letters, numbers, . _ -')
const slug = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug: lowercase kebab-case')

const attributeInput = z.object({
  attributeId: z.string().min(1),
  value: z.string().trim().max(200),
})

const productShape = {
  name: z.string().trim().min(1).max(200),
  shortDescription: z.string().trim().max(300).optional(),
  description: z.string().trim().max(4000).optional(),
  categoryId: z.string().min(1).nullable().optional(),
  hsCodeId: z.string().min(1).nullable().optional(),
  originCountryId: z.string().min(1).nullable().optional(),
  defaultUnitId: z.string().min(1).nullable().optional(),
  status: productStatusSchema.optional(),
  isActive: z.boolean().optional(),
  attributes: z.array(attributeInput).max(100).optional(),
  packagingTypeIds: z.array(z.string().min(1)).max(50).optional(),
}

export const createProductSchema = z.object({ sku, slug: slug.optional(), ...productShape })
export type CreateProductDto = z.infer<typeof createProductSchema>

export const updateProductSchema = z
  .object({
    sku: sku.optional(),
    slug: slug.optional(),
    ...productShape,
    name: z.string().trim().min(1).max(200).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' })
export type UpdateProductDto = z.infer<typeof updateProductSchema>

export const listProductsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().optional(),
  sort: z.string().optional(),
  q: z.string().trim().optional(),
  categoryId: z.string().optional(),
  hsCodeId: z.string().optional(),
  originCountryId: z.string().optional(),
  status: productStatusSchema.optional(),
  isActive: z.coerce.boolean().optional(),
  includeDeleted: z.coerce.boolean().optional(),
})
export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>

// Categories
export const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: slug.optional(),
  parentId: z.string().min(1).nullable().optional(),
  displayOrder: z.number().int().min(0).optional(),
})
export type CreateCategoryDto = z.infer<typeof createCategorySchema>

export const updateCategorySchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    slug: slug.optional(),
    parentId: z.string().min(1).nullable().optional(),
    displayOrder: z.number().int().min(0).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field is required' })
export type UpdateCategoryDto = z.infer<typeof updateCategorySchema>
