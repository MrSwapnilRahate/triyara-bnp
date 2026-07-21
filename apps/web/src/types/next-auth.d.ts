import type { Role } from '@triyara/auth'
import type { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      organizationId: string
      roles: Role[]
    } & DefaultSession['user']
  }

  interface User {
    organizationId: string
    roles: Role[]
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    organizationId: string
    roles: Role[]
  }
}
