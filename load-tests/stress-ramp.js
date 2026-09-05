import http from 'k6/http'
import { check } from 'k6'

import { login } from './lib/session.js'

const BASE_URL = 'http://localhost:3000'

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
