import { expect, test } from '@playwright/test'

import { signInAsNewStaff } from './support/staff-fixture'

test.describe('notifications', () => {
  test.skip(!process.env.DATABASE_URL, 'requires a seeded database')

  test('an action produces an in-app notification', async ({ page }) => {
    await signInAsNewStaff(page, 'notification')

    await page.request.post('/api/v1/accounts', { data: { legalName: `Notif E2E ${Date.now()}` } })

    await page.goto('/notifications')
    await expect(page.getByText('Account created').first()).toBeVisible()
  })
})
