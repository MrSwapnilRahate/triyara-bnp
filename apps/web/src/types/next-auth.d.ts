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
  }
}
