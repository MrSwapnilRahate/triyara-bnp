import { expect, test } from '@playwright/test'

test.describe('buyer profile', () => {
  test.skip(!process.env.DATABASE_URL, 'requires a seeded database')

  test('create account, then create + populate its buyer profile', async ({ page }) => {
    await page.goto('/login')
    await page.getByPlaceholder('Email').fill('admin@triyaraexports.com')
    await page.getByPlaceholder('Password').fill('ChangeMe!123')
    await page.getByRole('button', { name: /sign in/i }).click()
    await page.waitForURL(/dashboard/)

    const res = await page.request.post('/api/v1/accounts', {
      data: { legalName: `Buyer E2E ${Date.now()}` },
    })
    const accountId = (await res.json()).data.id as string

    await page.goto(`/accounts/${accountId}/buyer`)
    await page.getByRole('button', { name: /create buyer profile/i }).click()
    await expect(page.getByRole('button', { name: /^overview$/i })).toBeVisible()

    await page.getByRole('button', { name: /^products$/i }).click()
    await page.getByPlaceholder('Product (e.g. Onion Powder)').fill('Dehydrated Onion')
    await page.getByRole('button', { name: /add product/i }).click()
    await expect(page.getByText('Dehydrated Onion')).toBeVisible()
  })
})
