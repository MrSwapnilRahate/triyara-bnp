import http from 'k6/http'

import { check } from 'k6'

import { login, requestHeaders } from './lib/session.js'

const BASE_URL = __ENV.BASE_URL

if (!BASE_URL) {
  throw new Error('BASE_URL is required. Example: -e BASE_URL=https://...')
}

// Ramp to failure. The point is to find the knee, not to pass — so there are no
// thresholds that would abort the run early.

export const options = {
  stages: [
    { duration: '30s', target: 50 },
    { duration: '30s', target: 100 },
    { duration: '30s', target: 200 },
    { duration: '30s', target: 400 },
    { duration: '10s', target: 0 },
  ],
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
