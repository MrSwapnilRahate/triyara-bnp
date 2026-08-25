import type { Role } from '@triyara/auth'
import type { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      organizationId: string
      roles: Role[]
      /** External party this login belongs to; null for internal staff. */
      accountId: string | null
      /**
       * This session, as distinct from this user. Matches `UserSession.tokenId`
       * and is what makes revocation enforceable; null when the token predates
       * the claim and adoption has not yet succeeded.
       */
      sid: string | null
    } & DefaultSession['user']
  }

  interface User {
    organizationId: string
    roles: Role[]
    accountId: string | null
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    organizationId: string
    roles: Role[]
    accountId: string | null
    /**
     * Our own session identifier, minted at sign-in and carried unchanged
     * thereafter. Optional because a token issued before this claim existed has
     * none until it is adopted. Deliberately not `jti`: Auth.js re-mints that on
     * every re-encode, so a row keyed on it would be orphaned by the next
     * request.
     */
    sid?: string
  }
}
