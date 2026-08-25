import type { Role } from '@triyara/auth'
import { NextResponse } from 'next/server'
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

/**
 * Where each audience lives. Named so the policy below reads as two namespaces
 * rather than two string literals, and so a rename cannot update one mention
 * and miss the other.
 */
const PORTAL_HOME = '/portal'
const INTERNAL_HOME = '/dashboard'

// Edge-safe base config (no Node-only deps). Used by middleware and extended by the
// Node instance in ./index.ts which adds the Credentials provider.
/**
 * Whether cookies may carry the Secure attribute.
 *
 * `__Host-` and `Secure` require HTTPS. Setting them in local development over
 * http would mean the browser silently discards the session cookie and nobody
 * can sign in, so the prefix follows the protocol rather than being hardcoded.
 */
const useSecureCookies = process.env.NODE_ENV === 'production'
const sessionCookieName = useSecureCookies
  ? // `__Host-` is the strongest prefix: the browser refuses the cookie unless
    // it is Secure, path=/ and carries no Domain, which makes it impossible for
    // a subdomain to overwrite the session.
    '__Host-authjs.session-token'
  : 'authjs.session-token'

/**
 * How long a session lives, in seconds.
 *
 * Named because two places need the same figure: the cookie's lifetime, and the
 * `expiresAt` written on the session row at sign-in. Two literals would drift.
 */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8 // 8 hours

export const authConfig = {
  pages: { signIn: '/login' },
  session: { strategy: 'jwt', maxAge: SESSION_MAX_AGE_SECONDS },
  trustHost: true,
  useSecureCookies,
  cookies: {
    sessionToken: {
      name: sessionCookieName,
      options: {
        httpOnly: true,
        // `lax` rather than `strict`: the sign-in redirect is a cross-site
        // top-level navigation, and `strict` would drop the cookie on it and
        // bounce the user straight back to the login page.
        sameSite: 'lax',
        path: '/',
        secure: useSecureCookies,
      },
    },
  },
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
      // Only the identifier. No name, no contact details, no profile - a
      // session is not a place to cache an Account.
      session.user.accountId = (token.accountId as string | null | undefined) ?? null
      // Which session this is, as opposed to which user. Carried so the server
      // can ask whether it has been revoked; `null` when the claim is missing,
      // which is a session that cannot be checked and so is not trusted.
      session.user.sid = (token.sid as string | undefined) ?? null
      return session
    },

    /**
     * Which namespace a signed-in identity belongs to.
     *
     * This used to end in `return true` - authenticated meant allowed anywhere
     * outside /admin. That was correct while every user was internal staff. It
     * stopped being correct the moment EXTERNAL_PARTY could sign in: a buyer
     * would have rendered the internal application shell, because
     * `(app)/layout.tsx` asks only for a session. Their data calls would have
     * failed on CASL, so nothing would have leaked, but "the page loads and
     * every panel errors" is not a security boundary.
     *
     * So the rule is an allow-list per namespace, and the fallthrough denies.
     * Route separation is deliberately NOT a CASL question - ADMIN holds
     * `manage all` and is still refused /portal, because the portal is a
     * different audience rather than a higher privilege.
     */
    authorized({ auth, request: { nextUrl } }) {
      const { pathname } = nextUrl

      if (PUBLIC_PATHS.includes(pathname)) return true

      const user = auth?.user
      if (!user) return false // -> redirect to signIn page

      // `?? []` rather than a bare access: a token without the claim must
      // refuse the route, not crash the middleware for every visitor.
      const roles = user.roles ?? []

      // Checked before any namespace routing, not after. Signed in holding no
      // role at all - a token whose claims were stripped because the user was
      // deleted, or one minted before roles existed - belongs to no namespace,
      // so it gets none. Left until the end, this session was redirected to
      // /dashboard on its way to being refused there, which is a redirect
      // issued on behalf of an identity that should already have been turned
      // away.
      if (roles.length === 0) return false

      const isExternal = roles.includes('EXTERNAL_PARTY')
      const isPortal = pathname === PORTAL_HOME || pathname.startsWith(`${PORTAL_HOME}/`)

      if (isExternal) {
        // An external party lives in /portal and nowhere else. Redirected
        // rather than refused: they are signed in, so bouncing them to /login
        // would show a login form to somebody already logged in, and returning
        // false does exactly that.
        return isPortal ? true : NextResponse.redirect(new URL(PORTAL_HOME, nextUrl))
      }

      // Internal staff, kept out of the portal for the mirror-image reason.
      if (isPortal) return NextResponse.redirect(new URL(INTERNAL_HOME, nextUrl))

      if (pathname.startsWith('/admin')) return roles.includes('ADMIN')

      return true
    },
  },
  providers: [],
} satisfies NextAuthConfig
