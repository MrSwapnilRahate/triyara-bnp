/**
 * SCREAMING_SNAKE to sentence case: PENDING_APPROVAL -> Pending approval.
 *
 * `humaniseStatus` in @triyara/ui does the same for statuses; this is the same
 * rule applied to the other enum vocabularies (type, priority, incoterm) so a
 * screen never inlines its own `.toLowerCase().replace(...)` chain.
 */
export function humanise(value: string): string {
  const lower = value.toLowerCase().replace(/_/g, ' ')
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}
