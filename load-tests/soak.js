import http from 'k6/http'
import { check } from 'k6'

import { login } from './lib/session.js'

const BASE_URL = 'http://localhost:3000'

// Soak: steady, moderate load held long enough for drift to show. Leaks and
// pool exhaustion do not appear in 30 seconds.
export const options = {
  vus: 50,
  duration: '5m',
}

export function setup() {
  return { sessionCookie: login(BASE_URL) }
}

export default function (data) {
  const res = http.get(`${BASE_URL}/api/catalog/products?limit=25&sort=-createdAt`, {
    headers: { Cookie: data.sessionCookie },
  })

  check(res, {
    'catalog products status is 200': (r) => r.status === 200,
  })
}
