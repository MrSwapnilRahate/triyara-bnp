import { RFQ_CERTIFICATION_TYPES } from '@triyara/validation'
import { z } from 'zod'

/**
 * The line-item form schema, declared once.
 *
 * Both hosts - RFQ create and the revise screen - validate against this, so a
 * rule cannot hold on one screen and not the other. It is a narrowed form of
 * the API's `rfqItemSchema`: the form collects a described line, and picking a
 * catalog product is a later enhancement, so `productId` is absent rather than
 * present-and-ignored.
 *
 * `requiredCertifications` defaults to `[]` here for the same reason the API
 * does: the output type is what gets posted, and an absent array would be a
 * missing required field rather than "none required".
 */
export const rfqLineSchema = z.object({
  customProductName: z.string().trim().min(1, 'Describe the line.').max(250),
  quantity: z.coerce.number().positive('Must be greater than zero.').finite(),
  unit: z.string().trim().min(1, 'Required.').max(16),
  targetPrice: z.coerce.number().nonnegative().finite().optional(),
  packaging: z.string().trim().max(500).optional(),
  remarks: z.string().trim().max(2000).optional(),
  requiredCertifications: z.array(z.enum(RFQ_CERTIFICATION_TYPES)).max(20).default([]),
})

export const rfqLinesSchema = z.object({
  items: z.array(rfqLineSchema).min(1, 'An RFQ needs at least one line.').max(200),
})

export type RfqLineInput = z.input<typeof rfqLineSchema>

/** A blank row, used for the initial line and by "Add line". */
export const emptyLine: RfqLineInput = {
  customProductName: '',
  quantity: '' as unknown as number,
  unit: '',
  requiredCertifications: [],
}
