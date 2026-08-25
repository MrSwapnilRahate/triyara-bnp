import { z } from 'zod'

import { paginationQuerySchema } from './pagination'
import { optionalText } from './registration-primitives'

// Public quote request intake (TRY-BNP-QR-01).
//
// The contract the marketing site's Request Quote form posts against, plus the
// internal triage contracts.
//
// Two rules shape the public half, and they are the same two the registration
// forms follow. Only what an enquiry is genuinely useless without is required -
// a rejected submission is a lost buyer, and this is the first thing a prospect
// touches. And every ceiling is explicit, because the endpoint is
// unauthenticated.
//
// Almost everything is free text on purpose. "2 x 40ft a month", "around $1,850
// CIF Jebel Ali", "Q2 if pricing works" are the answers people actually give,
// and coercing them into enums at the door would either reject the enquiry or
// silently discard the nuance a sourcing manager needs. Structure is imposed
// later, by a human, during qualification.

/** Cap on any single free-text answer. Generous, but not unbounded. */
const ANSWER = 500

export const quoteRequestStatusSchema = z.enum([
  'NEW',
  'IN_REVIEW',
  'QUALIFIED',
  'PROMOTED',
  'REJECTED',
])

/**
 * What the public form may send.
 *
 * `product`, `quantity`, `contactName` and `contactEmail` are the four fields
 * without which nobody can act on the enquiry: what, how much, who, and how to
 * reply. Everything else is optional.
 *
 * Email is required here, unlike the registration forms which accept a phone or
 * WhatsApp instead. A quote goes back in writing, and there is no account to
 * fall back on - so a route back that carries a document is the minimum.
 */
export const publicQuoteRequestSchema = z.object({
  // ---- what they need ----
  product: z.string().trim().min(1, 'Tell us which product you need.').max(200),
  quantity: z.string().trim().min(1, 'Tell us roughly how much you need.').max(200),
  monthlyVolume: optionalText(200),
  packaging: optionalText(ANSWER),
  targetPrice: optionalText(200),
  destinationPort: optionalText(200),
  timeline: optionalText(120),
  requirements: optionalText(2000),

  // ---- who they are ----
  companyName: optionalText(200),
  businessType: optionalText(120),
  // Free text, NOT iso2. The public form offers a country name, and rejecting
  // "United Arab Emirates" because it is not "AE" would lose the enquiry over a
  // formatting detail. Qualification maps it to a real country code.
  country: optionalText(120),
  importExperience: optionalText(120),

  // ---- how to reach them ----
  contactName: z.string().trim().min(1, 'Tell us your name.').max(200),
  contactEmail: z.string().trim().email('Enter a valid email address.').max(320),
  contactPhone: optionalText(32),
  preferredContact: optionalText(60),

  /**
   * Prioritisation hint from the submitting form.
   *
   * ADVISORY ONLY. It is computed in the browser, so it is caller-controlled and
   * must never influence authorization, routing or whether the row is written -
   * it is a sort key for the trade desk and nothing more. Bounded to stop it
   * being used as a free text channel.
   */
  leadScore: z.enum(['Hot', 'Warm', 'Cold']).optional(),
})

export type PublicQuoteRequestDto = z.infer<typeof publicQuoteRequestSchema>

/**
 * A requirement submitted from inside the buyer portal.
 *
 * What the buyer is asking for, and nothing about who they are. Every identity
 * and ownership field the row needs - organization, account, contact name,
 * contact email, company, country, source - is filled from the resolved session
 * on the server. None of them appears here, so there is no key for a crafted
 * payload to set and no code path that reads one.
 *
 * `.strict()` rather than the default: Zod would otherwise drop unknown keys
 * silently, and silence is the wrong answer to a request carrying
 * `buyerAccountId`. Someone sending that is either probing or has misunderstood
 * the contract, and both deserve a refusal rather than a quiet success that
 * looks to them like it worked.
 *
 * `leadScore` is absent too. It is computed in the browser on the public form,
 * which is exactly why an authenticated surface must not accept it - a buyer who
 * can set their own priority has set their own priority.
 */
export const portalRequirementSchema = z
  .object({
    product: z.string().trim().min(1, 'Tell us which product you need.').max(200),
    quantity: z.string().trim().min(1, 'Tell us roughly how much you need.').max(200),
    monthlyVolume: optionalText(200),
    packaging: optionalText(ANSWER),
    targetPrice: optionalText(200),
    destinationPort: optionalText(200),
    timeline: optionalText(120),
    requirements: optionalText(2000),
  })
  .strict()

export type PortalRequirementDto = z.infer<typeof portalRequirementSchema>

/**
 * Internal triage.
 *
 * Deliberately narrow: an operator moves the enquiry through its lifecycle,
 * records why, and may attach it to a buyer Account. What the buyer actually
 * asked for is NOT editable - it is what they said, and a record of their words
 * that staff can rewrite is not evidence of anything.
 */
export const reviewQuoteRequestSchema = z
  .object({
    status: quoteRequestStatusSchema.exclude(['PROMOTED']).optional(),
    reviewNotes: optionalText(2000),
    /** Attach to an existing buyer account, or `null` to detach. */
    buyerAccountId: z.string().cuid().nullable().optional(),
  })
  .refine((v) => v.status !== undefined || v.reviewNotes !== undefined || 'buyerAccountId' in v, {
    message: 'Nothing to update.',
  })

export type ReviewQuoteRequestDto = z.infer<typeof reviewQuoteRequestSchema>

/**
 * Promotion to a real RFQ.
 *
 * `rfqNumber` is supplied by the operator rather than generated: the commercial
 * series is theirs to manage, and the RFQ service already rejects a duplicate.
 * `buyerId` is required because the RFQ table's own CHECK constraint
 * (`RFQ_buyer_matches_type`, migration 0007) requires a BUYER-type RFQ to name
 * an Account - promotion is exactly the moment an anonymous enquiry acquires one.
 */
export const promoteQuoteRequestSchema = z.object({
  rfqNumber: z
    .string()
    .trim()
    .min(1, 'An RFQ number is required.')
    .max(40)
    .regex(/^[A-Z0-9-]+$/, 'Uppercase letters, digits and hyphens only.'),
  buyerId: z.string().cuid('Select the buyer account this RFQ belongs to.'),
  title: optionalText(250),
  currency: z
    .string()
    .trim()
    .length(3)
    .regex(/^[A-Z]{3}$/, 'Must be a 3-letter ISO 4217 code.')
    .optional(),
  /**
   * The buyer's free-text quantity, translated by the operator.
   *
   * Required, and deliberately NOT derived from `QuoteRequest.quantity`. That
   * field holds whatever the buyer typed - "2 x 40ft monthly", "a trial
   * container" - and an RFQ line needs a real number and a real unit. Guessing
   * one would put a fabricated figure in front of suppliers; the person
   * promoting the enquiry has it open and can read it.
   */
  quantity: z.coerce.number().positive('Quantity must be greater than zero.').finite(),
  unit: z.string().trim().min(1, 'A unit is required.').max(16),
})

export type PromoteQuoteRequestDto = z.infer<typeof promoteQuoteRequestSchema>

export const listQuoteRequestsQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(200).optional(),
  status: quoteRequestStatusSchema.optional(),
  buyerAccountId: z.string().cuid().optional(),
})

export type ListQuoteRequestsQuery = z.infer<typeof listQuoteRequestsQuerySchema>
