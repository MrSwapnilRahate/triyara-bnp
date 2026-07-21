import NextAuth from 'next-auth'

import { authConfig } from './auth/config'

// Edge middleware: verifies the JWT and applies the `authorized` callback for
// public / protected / admin route protection. No Node-only deps here.
export const { auth: middleware } = NextAuth(authConfig)

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
}
