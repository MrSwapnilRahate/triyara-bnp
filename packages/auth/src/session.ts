import type { Role } from './roles'

// The identity carried in the JWT and resolved on every request.
export interface AuthUser {
  readonly id: string
  readonly organizationId: string
  readonly email: string
  readonly name: string
  readonly roles: Role[]
}

export interface SessionLike {
  readonly user?: AuthUser | null
}
