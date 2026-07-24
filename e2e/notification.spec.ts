import { expect, test } from '@playwright/test'

test.describe('notifications', () => {
  test.skip(!process.env.DATABASE_URL, 'requires a seeded database')

  test('an action produces an in-app notification', async ({ page }) => {
    await page.goto('/login')
    await page.getByPlaceholder('Email').fill('admin@triyaraexports.com')
    await page.getByPlaceholder('Password').fill('ChangeMe!123')
    await page.getByRole('button', { name: /sign in/i }).click()
    await page.waitForURL(/dashboard/)

    await page.request.post('/api/v1/accounts', { data: { legalName: `Notif E2E ${Date.now()}` } })

    await page.goto('/notifications')
    await expect(page.getByText('Account created').first()).toBeVisible()
  })
})
