import { expect, test } from '@playwright/test'

test.describe('product catalog', () => {
  test.skip(!process.env.DATABASE_URL, 'requires a seeded database')

  test('create a product through the catalog UI', async ({ page }) => {
    await page.goto('/login')
    await page.getByPlaceholder('Email').fill('admin@triyaraexports.com')
    await page.getByPlaceholder('Password').fill('ChangeMe!123')
    await page.getByRole('button', { name: /sign in/i }).click()
    await page.waitForURL(/dashboard/)

    await page.goto('/products')
    await page.getByRole('button', { name: /new product/i }).click()
    const sku = `E2E-${Date.now()}`
    await page.locator('input[name="sku"]').fill(sku)
    await page.locator('input[name="name"]').fill('E2E Onion Powder')
    await page.getByRole('button', { name: /^create$/i }).click()
    await expect(page.getByText('E2E Onion Powder')).toBeVisible()
  })
})
