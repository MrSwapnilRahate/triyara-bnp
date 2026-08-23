import type { Role } from './roles'

// The identity carried in the JWT and resolved on every request.
export interface AuthUser {
  readonly id: string
  readonly organizationId: string
  readonly email: string
  readonly name: string
  readonly roles: Role[]
  /**
   * The external party this login belongs to, or null for internal staff.
   *
   * Present so a later batch can scope records to one Buyer or Supplier.
   * Nothing reads it for an authorization decision yet, and carrying it grants
   * nothing on its own.
   *
   * OPTIONAL rather than required, deliberately. Every production path
   * populates it - `authorize`, the jwt refresh, `loadContext` and
   * `currentUser` all do - but requiring it here would force `accountId: null`
   * into twenty-two unrelated service-test fixtures that have nothing to say
   * about external identity. A later batch that actually reads this for an
   * authorization decision is the right moment to tighten it, because that is
   * when a missing value would mean something.
   */
  readonly accountId?: string | null
}

export interface SessionLike {
  readonly user?: AuthUser | null
}
