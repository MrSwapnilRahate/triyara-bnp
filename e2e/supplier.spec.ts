import { expect, test } from '@playwright/test'

test.describe('supplier profile', () => {
  test.skip(!process.env.DATABASE_URL, 'requires a seeded database')

  test('create account, then create + edit its supplier profile', async ({ page }) => {
    await page.goto('/login')
    await page.getByPlaceholder('Email').fill('admin@triyaraexports.com')
    await page.getByPlaceholder('Password').fill('ChangeMe!123')
    await page.getByRole('button', { name: /sign in/i }).click()
    await page.waitForURL(/dashboard/)

    // Create an account via the API (shares the auth cookie).
    const res = await page.request.post('/api/v1/accounts', {
      data: { legalName: `Sup E2E ${Date.now()}` },
    })
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    const accountId = body.data.id as string

    await page.goto(`/accounts/${accountId}/supplier`)
    await page.getByRole('button', { name: /create supplier profile/i }).click()
    await expect(page.getByRole('button', { name: /^overview$/i })).toBeVisible()

    await page.getByRole('button', { name: /^capabilities$/i }).click()
    await page.getByPlaceholder('Product (e.g. Onion Powder)').fill('Dehydrated Onion')
    await page.getByRole('button', { name: /add product/i }).click()
    await expect(page.getByText('Dehydrated Onion')).toBeVisible()
  })
})
