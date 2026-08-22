import type { FreightRateRecord, FreightRateRepository } from '@triyara/db'

// Freight rate selection (V3.4, ADR-0012).
//
// Pure resolution: given a corridor, a mode, a container and a date, decide
// which organization-scoped rate applies. It computes nothing and writes
// nothing - a rate is REFERENCE DATA, and turning one into a charge on a
// scenario stays a separate, explicit decision (ADR-0012).
//
// Every outcome below is named. The one thing this must never do is pick an
// arbitrary row: V3.4 exists so a cost can be explained, and "the first match"
// is not an explanation.

/** Modes that must carry a container standard. Mirrors the V3.3 CHECK constraint. */
const CONTAINERISED = new Set(['SEA_FCL'])
/** Modes that must not. MULTIMODAL is in neither set - it permits either. */
const NON_CONTAINERISED = new Set(['SEA_LCL', 'AIR', 'ROAD', 'RAIL'])

/** Why resolution could not produce a rate. Never a silent null. */
export type FreightRateUnresolvedReason =
  /** The scenario has no origin or destination port yet. */
  | 'MISSING_PORTS'
  /** The scenario has no shipment mode, which a rate is always keyed by. */
  | 'MISSING_MODE'
  /** No `ratesEffectiveOn`. Deliberately not defaulted to today - see ADR-0012. */
  | 'MISSING_EFFECTIVE_DATE'
  /** SEA_FCL with no container, or a non-containerised mode carrying one. */
  | 'CONTAINER_MODE_MISMATCH'
  /** Everything was supplied; the organization simply has no rate for it. */
  | 'NO_RATE'
  /**
   * More than one live rate matched. The V3.3 exclusion constraint makes this
   * unreachable through the API, so reaching it means something wrote rows
   * around the constraint - and picking one anyway would hide that.
   */
  | 'AMBIGUOUS'

export type FreightRateResolution =
  | { status: 'RESOLVED'; rate: FreightRateRecord }
  | { status: 'UNRESOLVED'; reason: FreightRateUnresolvedReason; candidates?: number }

export interface ResolveFreightRateInput {
  organizationId: string
  originPortId?: string | null
  destinationPortId?: string | null
  mode?: string | null
  containerTypeId?: string | null
  effectiveAt?: Date | null
}

/**
 * Finds the single rate that applies, or says precisely why none does.
 *
 * Does NOT throw when no rate exists: a corridor an organization has not priced
 * yet is an ordinary state of the world, not an error. It throws nothing at
 * all - the caller decides what an unresolved rate means for its own screen.
 */
export async function resolveFreightRate(
  repo: FreightRateRepository,
  input: ResolveFreightRateInput,
): Promise<FreightRateResolution> {
  const { organizationId, originPortId, destinationPortId, mode, containerTypeId, effectiveAt } =
    input

  // Each precondition is reported on its own, so a user is told the one thing
  // to fix rather than a generic "no rate found".
  if (!originPortId || !destinationPortId) {
    return { status: 'UNRESOLVED', reason: 'MISSING_PORTS' }
  }
  if (!mode) return { status: 'UNRESOLVED', reason: 'MISSING_MODE' }
  if (!effectiveAt) return { status: 'UNRESOLVED', reason: 'MISSING_EFFECTIVE_DATE' }

  // The same rule the database enforces on the rate itself. Checked here too
  // so an incoherent scenario is named as such rather than quietly matching
  // nothing and looking like an unpriced corridor.
  if (CONTAINERISED.has(mode) && !containerTypeId) {
    return { status: 'UNRESOLVED', reason: 'CONTAINER_MODE_MISMATCH' }
  }
  if (NON_CONTAINERISED.has(mode) && containerTypeId) {
    return { status: 'UNRESOLVED', reason: 'CONTAINER_MODE_MISMATCH' }
  }

  const { items } = await repo.list({
    // Never optional. A rate is a commercial term, and a lookup without this
    // would read another tenant's negotiated price.
    organizationId,
    originPortId,
    destinationPortId,
    mode: mode as never,
    // Only narrow by container when the mode carries one; passing undefined for
    // a non-containerised mode would otherwise be indistinguishable from "any".
    ...(containerTypeId ? { containerTypeId } : {}),
    // `list` applies the window and excludes soft-deleted rows.
    effectiveOn: effectiveAt,
    limit: 10,
  })

  // A non-containerised mode must not match a rate that happens to carry a
  // container: the repository filter is only applied when we pass one, so the
  // shape is confirmed here rather than assumed.
  const exact = containerTypeId
    ? items.filter((r) => r.containerTypeId === containerTypeId)
    : items.filter((r) => r.containerTypeId === null)

  if (exact.length === 0) return { status: 'UNRESOLVED', reason: 'NO_RATE' }
  if (exact.length > 1) {
    return { status: 'UNRESOLVED', reason: 'AMBIGUOUS', candidates: exact.length }
  }
  return { status: 'RESOLVED', rate: exact[0]! }
}

/** Human-readable explanation, so a screen never has to invent the wording. */
export const FREIGHT_RATE_UNRESOLVED_MESSAGE: Record<FreightRateUnresolvedReason, string> = {
  MISSING_PORTS: 'Set an origin and destination port before a freight rate can be found.',
  MISSING_MODE: 'Set a shipment mode before a freight rate can be found.',
  MISSING_EFFECTIVE_DATE:
    'Set the date rates should apply from. It is not assumed, so the same scenario always resolves the same rate.',
  CONTAINER_MODE_MISMATCH:
    'SEA_FCL needs a container type, and the other modes must not carry one.',
  NO_RATE: 'No freight rate is on file for this corridor on that date.',
  AMBIGUOUS: 'More than one rate covers this corridor on that date. Close or adjust one.',
}
