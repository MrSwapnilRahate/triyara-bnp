import { ForbiddenError } from '@triyara/lib'

/**
 * Who may approve an Admin Access Request.
 *
 * ADMIN resolves to `manage all` in CASL, so granting it hands over the whole
 * platform. That decision is reserved for the Super Admin, and who the Super
 * Admin is comes from configuration rather than from data - it cannot be
 * widened by anything a request carries, nor by an ADMIN editing a row.
 *
 * Modelled as a list from the outset even though Stage-1 has exactly one. A
 * singular `SUPER_ADMIN_EMAIL` would make Stage-2 an architecture change:
 * every call site would move from equality to membership. This way Stage-2 is
 * one more entry in an environment variable.
 *
 * Resolved once at module load. Re-reading process.env per check would let a
 * mid-process change alter the answer between a check and the write it guards.
 */

export const NOT_SUPER_ADMIN_MESSAGE =
  'Only the super administrator may decide admin access requests.'

export const ADMIN_MUST_BE_REQUESTED_MESSAGE =
  'The ADMIN role cannot be assigned directly. Ask this person to submit an admin access request.'

/**
 * Stage-1 default, used when SUPER_ADMIN_EMAILS is unset.
 *
 * Present so development and the seeded database work without configuration.
 * It is the same address as the configured Stage-1 Super Admin, so an unset
 * variable in production degrades to the intended person rather than to
 * nobody - a platform with no Super Admin can never grant ADMIN again.
 */
const STAGE_1_DEFAULT = ['swapnilrahate6598@gmail.com']

/** Comma-separated, trimmed, lowercased, blanks dropped, duplicates removed. */
export function parseSuperAdminEmails(raw: string | undefined): string[] {
  if (!raw) return []
  const seen = new Set<string>()
  for (const entry of raw.split(',')) {
    const email = entry.trim().toLowerCase()
    if (email) seen.add(email)
  }
  return [...seen]
}

const CONFIGURED = (() => {
  const parsed = parseSuperAdminEmails(process.env.SUPER_ADMIN_EMAILS)
  return parsed.length > 0 ? parsed : STAGE_1_DEFAULT
})()

/** The configured addresses, lowercased. A copy, so a caller cannot widen it. */
export function getSuperAdminEmails(): string[] {
  return [...CONFIGURED]
}

/**
 * Whether this address is a Super Admin.
 *
 * Case-insensitive and whitespace-tolerant: the same person is the same person
 * whether the address was typed, pasted with a trailing space, or capitalised.
 */
export function isSuperAdmin(email: string | null | undefined): boolean {
  if (!email) return false
  return CONFIGURED.includes(email.trim().toLowerCase())
}

/** Guards a decision endpoint. Throws 403 for everyone else, ADMIN included. */
export function assertSuperAdmin(email: string | null | undefined): void {
  if (!isSuperAdmin(email)) throw new ForbiddenError(NOT_SUPER_ADMIN_MESSAGE)
}

/**
 * Whether revoking ADMIN from this person would leave the platform with no
 * Super Admin who still holds it.
 *
 * Stage-1 has one, so this is effectively "never remove it". Stage-2 gains
 * more entries and the same function starts permitting removals, without any
 * call site changing.
 */
export function isLastSuperAdminHolder(
  email: string | null | undefined,
  otherAdminEmails: string[],
): boolean {
  if (!isSuperAdmin(email)) return false
  return !otherAdminEmails.some((other) => isSuperAdmin(other))
}
