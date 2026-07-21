import { expect, test } from '@playwright/test'

test('unauthenticated access to a protected route redirects to /login', async ({ page }) => {
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/login/)
  await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible()
})

// Full login requires a seeded database.
test.describe('login flow', () => {
  test.skip(!process.env.DATABASE_URL, 'requires a seeded database')

  test('admin can sign in and reach the dashboard', async ({ page }) => {
    await page.goto('/login')
    await page.getByPlaceholder('Email').fill('admin@triyaraexports.com')
    await page.getByPlaceholder('Password').fill('ChangeMe!123')
    await page.getByRole('button', { name: /sign in/i }).click()
    await expect(page).toHaveURL(/\/dashboard/)
    await expect(page.getByText('Roles')).toBeVisible()
  })
})
