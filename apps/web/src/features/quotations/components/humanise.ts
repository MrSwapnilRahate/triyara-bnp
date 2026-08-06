/**
 * SCREAMING_SNAKE to sentence case: PENDING_APPROVAL -> Pending approval.
 *
 * `humaniseStatus` in @triyara/ui does this for statuses; this is the same rule
 * for the other enum vocabularies (type, charge type, tax type) so no screen
 * inlines its own `.toLowerCase().replace(...)` chain.
 */
export function humanise(value: string): string {
  const lower = value.toLowerCase().replace(/_/g, ' ')
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}
