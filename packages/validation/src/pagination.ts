import { z } from 'zod'

// Generic cursor-pagination query (TRY-BNP-API-01). Never offset-based.
export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().optional(),
  sort: z.string().optional(),
})
export type PaginationQuery = z.infer<typeof paginationQuerySchema>
