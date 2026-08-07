import { ConflictError, ValidationError } from '@triyara/lib'

// The onboarding review state machine, shared by suppliers and buyers.
//
// Extracted rather than copied. Suppliers and accounts carry their own status
// enums — an Account is not a Supplier, and one enum named for the other would
// read as a mistake at every call site — but the STATES and the rules governing
// them are identical, and two copies of a workflow drift the moment one side is
// amended and the other is forgotten.
//
// Suppliers already ran this logic in supplier.service; the definitions moved
// here unchanged, so their behaviour is untouched and now has a second caller.

/** Which states may follow which. Anything unlisted is refused. */
export const REVIEW_TRANSITIONS: Record<string, readonly string[]> = {
  DRAFT: ['PENDING_REVIEW', 'INACTIVE'],
  PENDING_REVIEW: ['APPROVED', 'REJECTED', 'DRAFT'],
  APPROVED: ['BLOCKED', 'INACTIVE'],
  REJECTED: ['DRAFT', 'PENDING_REVIEW'],
  BLOCKED: ['APPROVED', 'INACTIVE'],
  INACTIVE: ['DRAFT'],
}

/** The state each decision moves the record to. */
export const REVIEW_DECISION_TARGET: Record<string, string> = {
  SUBMITTED: 'PENDING_REVIEW',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  BLOCKED: 'BLOCKED',
  UNBLOCKED: 'APPROVED',
  REOPENED: 'DRAFT',
}

/**
 * Resolves a decision to its target state and checks the move is legal.
 *
 * Throws rather than returning a result: every caller would otherwise have to
 * remember to check, and forgetting would walk the workflow into a state the
 * rest of the system does not expect. `noun` only shapes the message, so the
 * error names the thing the reader is looking at.
 */
export function resolveTransition(currentStatus: string, decision: string, noun: string): string {
  const target = REVIEW_DECISION_TARGET[decision]
  if (!target) throw new ValidationError(`Unsupported decision: ${decision}`)

  const allowed = REVIEW_TRANSITIONS[currentStatus] ?? []
  if (!allowed.includes(target)) {
    throw new ConflictError(
      `Cannot move a ${currentStatus} ${noun} to ${target}. Allowed: ${allowed.join(', ') || 'none'}.`,
    )
  }
  return target
}
