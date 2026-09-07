import http from 'k6/http'

/**
 * The load-test identity, supplied by the environment.
 *
 * Deliberately no fallback. These used to be literals in this file, which meant
 * a working credential for a real environment sat in version control - and a
 * default would put it straight back, just less visibly. Failing loudly when it
 * is unset is the point: a run that silently authenticated as somebody else
 * would measure the wrong thing at best.
 *
 * k6 does not read process.env; `__ENV` is populated from `-e` flags or the
 * environment k6 itself was started with.
 */
export function credentials() {
  const email = __ENV.LOADTEST_EMAIL
  const password = __ENV.LOADTEST_PASSWORD

  const missing = [
    ['LOADTEST_EMAIL', email],
    ['LOADTEST_PASSWORD', password],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name)

  if (missing.length > 0) {
    throw new Error(
      `${missing.join(' and ')} ${missing.length === 1 ? 'is' : 'are'} not set. ` +
        'Pass the load-test identity explicitly, e.g. ' +
        '`k6 run -e LOADTEST_EMAIL=… -e LOADTEST_PASSWORD=… …`.',
    )
  }

  return { email, password }
}

/**
 * Targets that sit behind nothing, so no bypass is needed or wanted.
 *
 * A string test rather than `new URL(...)`: k6's runtime is goja, and relying on
 * a WHATWG URL implementation being present is a needless bet when the question
 * is only "is this a loopback address".
 */
const LOCAL_TARGET = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i

/**
 * Vercel Deployment Protection bypass, for targets that are behind it.
 *
 * WHY THIS IS NEEDED: a protected deployment answers `/api/auth/csrf` with a 302
 * to `vercel.com/sso-api`. k6 follows it and gets a perfectly good HTTP 200 that
 * contains no `csrfToken` - so the failure surfaces as "CSRF token was not
 * returned" and looks like an application bug. A browser does not hit this
 * because it is already signed in to Vercel. The header is the mechanism Vercel
 * provides for exactly this case; it does not disable protection for anyone else.
 *
 * Required for any non-loopback target and never defaulted. Local runs need no
 * secret, so a laptop run stays frictionless; anything remote fails loudly
 * rather than silently measuring Vercel's SSO redirect.
 */
export function protectionHeaders(baseUrl) {
  const secret = __ENV.VERCEL_AUTOMATION_BYPASS_SECRET

  if (secret) return { 'x-vercel-protection-bypass': secret }

  if (LOCAL_TARGET.test(baseUrl)) return {}

  throw new Error(
    'VERCEL_AUTOMATION_BYPASS_SECRET is not set, and the target is not local.\n' +
      `  target: ${baseUrl}\n` +
      'A protected deployment redirects /api/auth/csrf to Vercel SSO, which k6 ' +
      'follows and reads as a 200 with no csrfToken. Pass the bypass secret, e.g. ' +
      '`k6 run -e VERCEL_AUTOMATION_BYPASS_SECRET=… …`. Find it under Vercel → ' +
      'Project → Settings → Deployment Protection → Protection Bypass for Automation.',
  )
}

/**
 * Headers for a request this suite makes: the protection bypass, plus the
 * session cookie when the caller has one.
 *
 * Exported so every script sends the same set. A request that reaches Vercel's
 * SSO page instead of the application still returns 200, so a missed header
 * does not fail - it quietly measures the wrong thing.
 *
 * Built with plain assignment rather than object spread: goja's support for
 * spread in object literals varies by k6 version, and this is not the place to
 * find that out.
 */
export function requestHeaders(baseUrl, sessionCookie) {
  const headers = protectionHeaders(baseUrl)
  if (sessionCookie) headers.Cookie = sessionCookie
  return headers
}

// Auth.js credentials login, shared by the load-test scripts.
//
// The session cookie name differs by environment: development sets
// `authjs.session-token`, production sets `__Host-authjs.session-token`. The
// whole `name=value` pair is returned so the name Auth.js actually set is the
// one sent back - the bare name matches as a substring of the prefixed one, so
// rebuilding the cookie from a fixed name yields a valid value under a name
// production is not looking for, and every request is silently unauthenticated.
export function login(baseUrl) {
  // Both resolved before the first request, so a missing variable fails
  // immediately rather than after an unauthenticated round trip.
  const { email, password } = credentials()
  const headers = protectionHeaders(baseUrl)

  const csrfRes = http.get(`${baseUrl}/api/auth/csrf`, { headers })
  const csrfToken = csrfRes.json('csrfToken')

  if (!csrfToken) {
    // The most likely cause is worth naming here rather than leaving the reader
    // to discover it: a 200 with no token is what Vercel's SSO page looks like
    // once k6 has followed the redirect a protected deployment answers with.
    throw new Error(
      `CSRF token was not returned (status ${csrfRes.status}). ` +
        'If the target is a protected Vercel deployment, check that ' +
        'VERCEL_AUTOMATION_BYPASS_SECRET is correct - an invalid secret is not ' +
        'rejected, it is simply not honoured, and the SSO page answers 200.',
    )
  }

  const loginRes = http.post(
    `${baseUrl}/api/auth/callback/credentials`,
    {
      csrfToken,
      email,
      password,
      callbackUrl: `${baseUrl}/dashboard`,
      json: 'true',
    },
    { headers, redirects: 0 },
  )

  const setCookie = loginRes.headers['Set-Cookie'] || ''
  const match = setCookie.match(/(?:__Host-)?authjs\.session-token=[^;]+/)

  if (!match) {
    throw new Error(
      'No Auth.js session cookie in Set-Cookie. Expected authjs.session-token ' +
        `or __Host-authjs.session-token. Received: ${setCookie || '(empty)'}`,
    )
  }

  console.log('SESSION COOKIE FOUND:', match[0].split('=')[0])
  return match[0]
}
