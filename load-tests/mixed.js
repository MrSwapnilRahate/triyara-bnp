import http from 'k6/http'
import { check } from 'k6'

import { login } from './lib/session.js'

const BASE_URL = 'http://localhost:3000'

// Mixed authenticated reads across the business-critical flows.
//
// Storage-backed endpoints (/api/suppliers*, /api/v1/documents) are absent on
// purpose: under `next start` they 500 on the STORAGE_PROVIDER guard, which
// would measure the guard rather than the endpoint.
const ENDPOINTS = [
  ['products', '/api/catalog/products?limit=25&sort=-createdAt'],
  ['categories', '/api/catalog/categories?limit=25'],
  ['rfqs', '/api/rfqs?limit=25'],
  ['quotations', '/api/quotations?limit=25'],
  ['accounts', '/api/v1/accounts?limit=25'],
  ['dashboard', '/api/v1/dashboard/summary'],
  ['notifications', '/api/v1/notifications?limit=25'],
  ['activities', '/api/v1/activities?limit=25'],
]

export const options = {
  vus: 50,
  duration: '60s',
  // Per-endpoint sub-metrics in the summary.
  thresholds: Object.fromEntries(
    ENDPOINTS.map(([name]) => [`http_req_duration{endpoint:${name}}`, ['p(99)<60000']]),
  ),
}

export function setup() {
  return { sessionCookie: login(BASE_URL) }
}

export default function (data) {
  const [name, path] = ENDPOINTS[Math.floor(Math.random() * ENDPOINTS.length)]

  const res = http.get(`${BASE_URL}${path}`, {
    headers: { Cookie: data.sessionCookie },
    tags: { endpoint: name },
  })

  check(res, { 'status is 200': (r) => r.status === 200 })
}
