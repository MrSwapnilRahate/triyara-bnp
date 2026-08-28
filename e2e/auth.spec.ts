import { expect, test } from '@playwright/test'

import { createStaffAdmin } from './support/staff-fixture'

test('unauthenticated access to a protected route redirects to /login', async ({ page }) => {
  await page.goto('/dashboard')
  await expect(page).toHaveURL(/\/login/)
  await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible()
})

// Full login requires a seeded database.
test.describe('login flow', () => {
  test.skip(!process.env.DATABASE_URL, 'requires a seeded database')

  test('admin can sign in and reach the dashboard', async ({ page }) => {
    // An administrator of this test's own. The login form is the subject here,
    // so the steps stay explicit rather than going through the shared helper.
    const admin = await createStaffAdmin('auth')

    await page.goto('/login')
    await page.getByPlaceholder('Email').fill(admin.email)
    await page.getByPlaceholder('Password').fill(admin.password)
    await page.getByRole('button', { name: /sign in/i }).click()
    await expect(page).toHaveURL(/\/dashboard/)
    await expect(page.getByText('Roles')).toBeVisible()
  })
})
