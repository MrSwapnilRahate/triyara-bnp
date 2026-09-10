import http from 'k6/http'
import { check } from 'k6'
import { login, requestHeaders } from './lib/session.js'

const BASE_URL = __ENV.BASE_URL

if (!BASE_URL) {
  throw new Error('BASE_URL is required. Example: -e BASE_URL=https://...')
}

const LOADTEST_VUS = Number(__ENV.LOADTEST_VUS || 50)
const LOADTEST_DURATION = __ENV.LOADTEST_DURATION || '60s'

if (!Number.isInteger(LOADTEST_VUS) || LOADTEST_VUS <= 0) {
  throw new Error('LOADTEST_VUS must be a positive integer.')
}

if (!LOADTEST_DURATION.trim()) {
  throw new Error('LOADTEST_DURATION must be a non-empty string.')
}

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
  vus: LOADTEST_VUS,
  duration: LOADTEST_DURATION,
  thresholds: Object.fromEntries(
    ENDPOINTS.map(([name]) => [`http_req_duration{endpoint:${name}}`, ['p(99)<60000']]),
  ),
}

export function setup() {
  const sessionCookie = login(BASE_URL)
  return { sessionCookie }
}

export default function ({ sessionCookie }) {
  const [name, path] = ENDPOINTS[Math.floor(Math.random() * ENDPOINTS.length)]

  const response = http.get(`${BASE_URL}${path}`, {
    headers: requestHeaders(BASE_URL, sessionCookie),
    tags: { endpoint: name },
  })

  if (response.status !== 200) {
    console.log(
      `LOAD_FAIL endpoint=${name} status=${response.status} body=${response.body?.slice(0, 200)}`,
    )
  }

  check(response, {
    'status is 200': (r) => r.status === 200,
  })
}
