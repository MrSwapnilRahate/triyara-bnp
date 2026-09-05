import http from 'k6/http'

// Auth.js credentials login, shared by the load-test scripts.
//
// The session cookie name differs by environment: development sets
// `authjs.session-token`, production sets `__Host-authjs.session-token`. The
// whole `name=value` pair is returned so the name Auth.js actually set is the
// one sent back - the bare name matches as a substring of the prefixed one, so
// rebuilding the cookie from a fixed name yields a valid value under a name
// production is not looking for, and every request is silently unauthenticated.
export function login(baseUrl) {
  const csrfRes = http.get(`${baseUrl}/api/auth/csrf`)
  const csrfToken = csrfRes.json('csrfToken')

  if (!csrfToken) {
    throw new Error(`CSRF token was not returned (status ${csrfRes.status})`)
  }

  const loginRes = http.post(
    `${baseUrl}/api/auth/callback/credentials`,
    {
      csrfToken,
      email: 'loadtest-readonly@triyara.test',
      password: 'LoadTest!123456',
      callbackUrl: `${baseUrl}/dashboard`,
      json: 'true',
    },
    { redirects: 0 },
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
