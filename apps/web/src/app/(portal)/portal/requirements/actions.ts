'use server'

import { AppError } from '@triyara/lib'
import { portalRequirementSchema } from '@triyara/validation'
import { revalidatePath } from 'next/cache'

import { requireAuth } from '@/auth/context'
import { enforceWriteLimit } from '@/lib/api'
import { buyerPortalService } from '@/lib/buyer-portal-service'
import { portalContextService } from '@/lib/portal-context-service'

export interface SubmitRequirementState {
  /** The QR reference, once it has landed. */
  readonly reference?: string
  /** True when this matched something the buyer had just sent. */
  readonly alreadySubmitted?: boolean
  readonly error?: string
  /** Field name -> first message, for inline display. */
  readonly fieldErrors?: Record<string, string>
}

/**
 * The fields the form is allowed to send.
 *
 * Read by name rather than by iterating the FormData. A loop over the submitted
 * keys would carry whatever the browser posted into the parse step, and while
 * the schema is `.strict()` and would reject an extra key, the reason it never
 * arrives should not depend on a second line of defence. Identity and ownership
 * are not on this list because they are not the buyer's to state.
 */
const FIELDS = [
  'product',
  'quantity',
  'monthlyVolume',
  'packaging',
  'targetPrice',
  'destinationPort',
  'timeline',
  'requirements',
] as const

/**
 * Records a requirement typed by a signed-in buyer.
 *
 * The portal's first write, and the order of the first three lines is the whole
 * security argument. `requireAuth` proves there is a live session - which, since
 * A2, means one that has not been revoked. `resolve` proves the party is an
 * approved buyer in this tenant and yields the only account this request may
 * write against. Only then is anything read from the form.
 *
 * A Server Action rather than a route handler: it is same-origin and carries
 * Next's own CSRF protection, and it keeps this off `/api/v1/public/*`, where
 * the CORS allowlist exists to let the marketing site post. An authenticated
 * write has no business sharing that surface.
 *
 * Nothing here takes `params` or `searchParams`. There is no input through which
 * a URL could name a different account.
 */
export async function submitRequirementAction(
  _prev: SubmitRequirementState,
  formData: FormData,
): Promise<SubmitRequirementState> {
  // Outside the guard below, deliberately. A missing or revoked session is not
  // a form problem and must not be answered with a sentence inside the form -
  // it belongs to the sign-in flow, so it is left to propagate.
  const auth = await requireAuth()

  try {
    const party = await portalContextService.resolve(auth)

    // Keyed on the resolved user, so one buyer hammering the form cannot spend
    // another buyer's allowance.
    enforceWriteLimit(party.userId)

    const raw: Record<string, string> = {}
    for (const field of FIELDS) {
      const value = formData.get(field)
      // Empty strings are dropped rather than sent as "". The optional fields
      // are absent-or-text, and "" is neither.
      if (typeof value === 'string' && value.trim() !== '') raw[field] = value
    }

    const parsed = portalRequirementSchema.safeParse(raw)
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const key = issue.path[0]
        if (typeof key === 'string' && !fieldErrors[key]) fieldErrors[key] = issue.message
      }
      return { error: 'Please check the highlighted fields.', fieldErrors }
    }

    const receipt = await buyerPortalService.submitRequirement(party, parsed.data)

    // So the new item is on the list the moment they go back to it.
    revalidatePath('/portal/requirements')

    return { reference: receipt.reference, alreadySubmitted: receipt.alreadySubmitted }
  } catch (error) {
    // Domain refusals carry a message written for the person reading it, and a
    // refused party, an exhausted rate limit and a service refusal are the same
    // kind of answer - so they are shown the same way rather than one of them
    // arbitrarily hitting the error boundary instead.
    //
    // Anything else is rethrown. An internal failure explained in detail is a
    // description of our internals handed to whoever provoked it.
    if (error instanceof AppError) return { error: error.message }
    throw error
  }
}
