import type { NextAuthConfig } from 'next-auth'

// Public pages that never require a session.
const PUBLIC_PATHS = ['/', '/login', '/forgot-password', '/reset-password']

// Edge-safe base config (no Node-only deps). Used by middleware and extended by the
// Node instance in ./index.ts which adds the Credentials provider.
export const authConfig = {
  pages: { signIn: '/login' },
  session: { strategy: 'jwt', maxAge: 60 * 60 * 8 }, // 8 hours
  trustHost: true,
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const { pathname } = nextUrl

      if (PUBLIC_PATHS.includes(pathname)) return true
      if (!isLoggedIn) return false // -> redirect to signIn page

      // Admin-only area (route protection by role).
      if (pathname.startsWith('/admin')) {
        return auth.user.roles.includes('ADMIN')
      }
      return true
    },
  },
  providers: [],
} satisfies NextAuthConfig
