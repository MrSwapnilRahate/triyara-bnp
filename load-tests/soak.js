import http from 'k6/http'

import { check } from 'k6'

import { login, requestHeaders } from './lib/session.js'

const BASE_URL = __ENV.BASE_URL

if (!BASE_URL) {
  throw new Error('BASE_URL is required. Example: -e BASE_URL=https://...')
}

const LOADTEST_VUS = Number(__ENV.LOADTEST_VUS || 50)
const LOADTEST_DURATION = __ENV.LOADTEST_DURATION || '5m'

if (!Number.isInteger(LOADTEST_VUS) || LOADTEST_VUS <= 0) {
  throw new Error('LOADTEST_VUS must be a positive integer.')
}

if (!LOADTEST_DURATION.trim()) {
  throw new Error('LOADTEST_DURATION must be a non-empty string.')
}

// Soak: steady, moderate load held long enough for drift to show. Leaks and
// pool exhaustion do not appear in 30 seconds.

export const options = {
  vus: LOADTEST_VUS,
  duration: LOADTEST_DURATION,
}

export function setup() {
  const sessionCookie = login(BASE_URL)

  return { sessionCookie }
}

export default function ({ sessionCookie }) {
  const response = http.get(`${BASE_URL}/api/catalog/products?limit=25&sort=-createdAt`, {
    headers: requestHeaders(BASE_URL, sessionCookie),
  })

  if (response.status !== 200) {
    console.log(`LOAD_FAIL status=${response.status} body=${response.body?.slice(0, 200)}`)
  }

  check(response, {
    'catalog products status is 200': (r) => r.status === 200,
  })
}
