import type { Role } from '@triyara/auth'
import type { NextAuthConfig } from 'next-auth'

// Public pages that never require a session.
const PUBLIC_PATHS = [
  '/',
  '/login',
  '/forgot-password',
  '/reset-password',
  // Supplier self-registration. A supplier we have never met has no account, so
  // sending them to /login would defeat the entire point of the form.
  '/register/supplier',
  '/register/supplier/thank-you',
  '/register/buyer',
  '/register/buyer/thank-you',
  // Where a newly registered buyer is sent to describe their first
  // requirement. They have no account, so this must not ask for one.
  '/register/buyer/requirement',
  // Linked from the public footer. A policy page behind a login is useless.
  '/privacy',
  '/terms',
]

// Edge-safe base config (no Node-only deps). Used by middleware and extended by the
// Node instance in ./index.ts which adds the Credentials provider.
export const authConfig = {
  pages: { signIn: '/login' },
  session: { strategy: 'jwt', maxAge: 60 * 60 * 8 }, // 8 hours
  trustHost: true,
  callbacks: {
    /**
     * Maps the JWT onto the session. This lives in the EDGE config, not just in
     * the Node instance, because middleware runs here and `authorized` below
     * reads `auth.user.roles`. Defining it only alongside the Credentials
     * provider left `roles` undefined in middleware, so every /admin path threw
     * rather than being allowed or refused.
     *
     * The JWT carries an `unknown` index signature, so the shapes we control are
     * asserted at this boundary.
     */
    session({ session, token }) {
      session.user.id = token.sub ?? ''
      session.user.organizationId = (token.organizationId as string | undefined) ?? ''
      session.user.roles = (token.roles as Role[] | undefined) ?? []
      return session
    },

    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const { pathname } = nextUrl

      if (PUBLIC_PATHS.includes(pathname)) return true
      if (!isLoggedIn) return false // -> redirect to signIn page

      // Admin-only area (route protection by role).
      if (pathname.startsWith('/admin')) {
        // `?? []` rather than a bare access: a token without the claim must
        // refuse the route, not crash the middleware for every visitor.
        return (auth.user.roles ?? []).includes('ADMIN')
      }
      return true
    },
  },
  providers: [],
} satisfies NextAuthConfig
