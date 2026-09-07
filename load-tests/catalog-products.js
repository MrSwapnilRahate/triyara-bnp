import http from 'k6/http'
import { check } from 'k6'

import { login, requestHeaders } from './lib/session.js'

/**
 * The target, supplied by the environment.
 *
 * Deliberately no default. `http://localhost:3000` was hardcoded here, which
 * meant this script could only ever measure a laptop - and a default naming any
 * other host would be worse: a load generator that picks its own target when
 * you forget to say is how the wrong environment gets hammered.
 *
 * Thrown from the init context, so every VU fails immediately rather than the
 * run starting and reporting connection errors as if they were results.
 */
const BASE_URL = __ENV.BASE_URL

if (!BASE_URL) {
  throw new Error(
    'BASE_URL is not set. Name the target explicitly, e.g. `k6 run ' +
      '-e BASE_URL=https://… -e LOADTEST_EMAIL=… -e LOADTEST_PASSWORD=… ' +
      'load-tests/catalog-products.js`.',
  )
}

export const options = {
  vus: 50,
  duration: '30s',
}

export function setup() {
  // 1. Sign in, through the same helper mixed/soak/stress-ramp use.
  //
  // This replaces a near-identical copy of the flow that used to live here.
  // The duplicate mattered: the helper carries the reason the WHOLE cookie
  // `name=value` pair is captured rather than rebuilt from a fixed name -
  // development sets `authjs.session-token`, production sets the `__Host-`
  // prefixed one, and getting that wrong leaves every request silently
  // unauthenticated. One copy of that subtlety is the right number.
  //
  // It throws on a missing CSRF token or a missing session cookie, which aborts
  // setup rather than letting the run proceed unauthenticated - stricter than
  // the two `check()` calls it replaces, which recorded a failure and carried on.
  const sessionCookie = login(BASE_URL)

  // 2. Verify the cookie before starting the load test.
  //
  // Same headers as every other request: the session cookie AND the Vercel
  // protection bypass. Without the bypass this would measure the SSO page,
  // which answers 200 - so the check below would pass while proving nothing.
  const verifyRes = http.get(`${BASE_URL}/api/catalog/products?limit=25&sort=-createdAt`, {
    headers: requestHeaders(BASE_URL, sessionCookie),
  })

  console.log('SETUP API STATUS:', verifyRes.status)

  check(verifyRes, {
    'setup catalog products status is 200': (r) => r.status === 200,
  })

  return {
    sessionCookie,
  }
}

export default function (data) {
  const res = http.get(`${BASE_URL}/api/catalog/products?limit=25&sort=-createdAt`, {
    headers: requestHeaders(BASE_URL, data.sessionCookie),
  })

  check(res, {
    'catalog products status is 200': (r) => r.status === 200,
  })
}
