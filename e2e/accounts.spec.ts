import { expect, test } from '@playwright/test'

test.describe('accounts', () => {
  test.skip(!process.env.DATABASE_URL, 'requires a seeded database')

  test('admin can create an account and see it in the table', async ({ page }) => {
    await page.goto('/login')
    await page.getByPlaceholder('Email').fill('admin@triyaraexports.com')
    await page.getByPlaceholder('Password').fill('ChangeMe!123')
    await page.getByRole('button', { name: /sign in/i }).click()
    await page.waitForURL(/dashboard/)

    await page.goto('/accounts')
    await page.getByRole('button', { name: /new account/i }).click()
    const name = `E2E Acme ${Date.now()}`
    await page.getByPlaceholder('Legal name').fill(name)
    await page.getByRole('button', { name: /^create$/i }).click()

    await expect(page.getByText(name)).toBeVisible()
  })
})
