import { expect, test } from '@playwright/test'

import { signInAsNewStaff } from './support/staff-fixture'

test.describe('accounts', () => {
  test.skip(!process.env.DATABASE_URL, 'requires a seeded database')

  test('admin can create an account and see it in the table', async ({ page }) => {
    await signInAsNewStaff(page, 'accounts')

    await page.goto('/accounts')
    await page.getByRole('button', { name: /new account/i }).click()
    const name = `E2E Acme ${Date.now()}`
    await page.getByPlaceholder('Legal name').fill(name)
    await page.getByRole('button', { name: /^create$/i }).click()

    await expect(page.getByText(name)).toBeVisible()
  })
})
