/** Intake lifecycle. Mirrors the Prisma `QuoteRequestStatus` enum. */
export type QuoteRequestStatus = 'NEW' | 'IN_REVIEW' | 'QUALIFIED' | 'PROMOTED' | 'REJECTED'

/**
 * A website enquiry as the API returns it.
 *
 * Nearly every field is a nullable string because the public form asks for very
 * little: an enquiry that reaches us half-answered is still worth acting on, and
 * the screens below have to render that honestly rather than pretending blanks
 * are zeroes.
 */
export interface QuoteRequest {
  id: string
  reference: string
  status: QuoteRequestStatus
  source: string

  product: string
  quantity: string
  monthlyVolume: string | null
  packaging: string | null
  targetPrice: string | null
  destinationPort: string | null
  timeline: string | null
  requirements: string | null

  companyName: string | null
  businessType: string | null
  country: string | null
  importExperience: string | null

  contactName: string
  contactEmail: string
  contactPhone: string | null
  preferredContact: string | null

  leadScore: string | null

  buyerAccountId: string | null
  rfqId: string | null
  reviewedById: string | null
  reviewedAt: string | null
  reviewNotes: string | null

  version: number
  createdAt: string
  updatedAt: string
}
