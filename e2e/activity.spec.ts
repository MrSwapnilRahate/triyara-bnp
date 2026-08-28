import { expect, test } from '@playwright/test'

import { signInAsNewStaff } from './support/staff-fixture'

test.describe('activity timeline', () => {
  test.skip(!process.env.DATABASE_URL, 'requires a seeded database')

  test('an action appears in the global activity feed', async ({ page }) => {
    await signInAsNewStaff(page, 'activity')

    // Creating an account emits account.created, which the Activity subscriber ingests.
    await page.request.post('/api/v1/accounts', { data: { legalName: `Act E2E ${Date.now()}` } })

    await page.goto('/activity')
    await expect(page.getByText('Account created').first()).toBeVisible()
  })
})
