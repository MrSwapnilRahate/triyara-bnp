import { RFQ_CERTIFICATION_TYPES } from '@triyara/validation'
import { z } from 'zod'

/**
 * The line form schema, declared once and used by both hosts - quotation create
 * and the standalone line editor - so a rule cannot hold on one screen and not
 * the other.
 *
 * A narrowed form of the API's `quotationItemSchema`: the form collects a
 * described line at a price, and picking a catalog product or carrying RFQ
 * provenance is a later enhancement. Those fields are absent rather than
 * present-and-ignored.
 *
 * `unitCost` is optional and internal. It is what drives margin, and the API
 * redacts it from anyone who cannot `manage Account` - so a user who cannot see
 * it also should not be asked for it. The editor hides the field in that case
 * rather than sending back a value the server would have to reconcile.
 */
export const quotationLineSchema = z.object({
  customProductName: z.string().trim().min(1, 'Describe the line.').max(250),
  quantity: z.coerce.number().positive('Must be greater than zero.').finite(),
  unit: z.string().trim().min(1, 'Required.').max(16),
  unitPrice: z.coerce.number().nonnegative('Cannot be negative.').finite(),
  unitCost: z.coerce.number().nonnegative().finite().optional(),
  packaging: z.string().trim().max(500).optional(),
  hsCode: z
    .string()
    .trim()
    .regex(/^\d{6,12}$/, 'Must be 6-12 digits.')
    .optional(),
  // The same vocabulary the API enforces, not a loose string[] - so an
  // unknown code fails here rather than at the server.
  requiredCertifications: z.array(z.enum(RFQ_CERTIFICATION_TYPES)).max(20).default([]),
})

export const quotationLinesSchema = z.object({
  items: z.array(quotationLineSchema).min(1, 'A quotation needs at least one line.').max(200),
})

export type QuotationLineInput = z.input<typeof quotationLineSchema>

/** A blank row, used for the first line and by "Add line". */
export const emptyLine: QuotationLineInput = {
  customProductName: '',
  quantity: '' as unknown as number,
  unit: '',
  unitPrice: '' as unknown as number,
  requiredCertifications: [],
}
