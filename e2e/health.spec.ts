import { expect, test } from '@playwright/test'

test('health endpoint returns the standard envelope', async ({ request }) => {
  const res = await request.get('/api/health')
  expect(res.ok()).toBeTruthy()
  const body = await res.json()
  expect(body.success).toBe(true)
  expect(body.data.status).toBe('ok')
})
