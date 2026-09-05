import http from 'k6/http'
import { check } from 'k6'

const BASE_URL = 'http://localhost:3000'

export const options = {
  vus: 50,
  duration: '30s',
}

export function setup() {
  // 1. Get CSRF token.
  const csrfRes = http.get(`${BASE_URL}/api/auth/csrf`)

  check(csrfRes, {
    'CSRF status is 200': (r) => r.status === 200,
  })

  const csrfToken = csrfRes.json('csrfToken')

  if (!csrfToken) {
    throw new Error('CSRF token was not returned')
  }

  // 2. Login.
  const loginRes = http.post(
    `${BASE_URL}/api/auth/callback/credentials`,
    {
      csrfToken,
      email: 'loadtest-readonly@triyara.test',
      password: 'LoadTest!123456',
      callbackUrl: `${BASE_URL}/dashboard`,
      json: 'true',
    },
    {
      redirects: 0,
    },
  )

  console.log('LOGIN STATUS:', loginRes.status)
  console.log('LOGIN LOCATION:', loginRes.headers.Location || '')

  check(loginRes, {
    'login returned redirect': (r) => r.status === 302 || r.status === 303,
  })

  // 3. Extract only the Auth.js session cookie.
  // Regex avoids problems caused by commas inside Expires=... attributes.
  //
  // The name differs by environment: development sets `authjs.session-token`,
  // production sets `__Host-authjs.session-token`. The whole `name=value` pair
  // is captured so the name Auth.js actually set is the one sent back - the
  // bare name matches as a substring of the prefixed one, so rebuilding the
  // cookie from a fixed name yields a valid value under a name production is
  // not looking for, and every request is silently unauthenticated.
  const setCookie = loginRes.headers['Set-Cookie'] || ''

  const match = setCookie.match(/(?:__Host-)?authjs\.session-token=[^;]+/)

  if (!match) {
    throw new Error(
      'No Auth.js session cookie in Set-Cookie. Expected authjs.session-token ' +
        `or __Host-authjs.session-token. Received: ${setCookie || '(empty)'}`,
    )
  }

  const sessionCookie = match[0]

  console.log('SESSION COOKIE FOUND:', sessionCookie.split('=')[0])

  // 4. Verify the cookie before starting the load test.
  const verifyRes = http.get(`${BASE_URL}/api/catalog/products?limit=25&sort=-createdAt`, {
    headers: {
      Cookie: sessionCookie,
    },
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
    headers: {
      Cookie: data.sessionCookie,
    },
  })

  check(res, {
    'catalog products status is 200': (r) => r.status === 200,
  })
}
