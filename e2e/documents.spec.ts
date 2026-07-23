import { expect, test } from '@playwright/test'

test.describe('documents', () => {
  test.skip(!process.env.DATABASE_URL, 'requires a seeded database')

  test('upload a document through the UI and see it listed', async ({ page }) => {
    await page.goto('/login')
    await page.getByPlaceholder('Email').fill('admin@triyaraexports.com')
    await page.getByPlaceholder('Password').fill('ChangeMe!123')
    await page.getByRole('button', { name: /sign in/i }).click()
    await page.waitForURL(/dashboard/)

    const res = await page.request.post('/api/v1/accounts', {
      data: { legalName: `Doc E2E ${Date.now()}` },
    })
    const accountId = (await res.json()).data.id as string

    await page.goto('/documents')
    await page.getByRole('button', { name: /upload document/i }).click()
    await page.locator('select[name="accountId"]').selectOption(accountId)
    await page.locator('select[name="type"]').selectOption('GST')
    await page.locator('input[name="title"]').fill('E2E GST')
    await page.locator('input[name="file"]').setInputFiles({
      name: 'gst.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 e2e test file'),
    })
    await page.getByRole('button', { name: /^upload$/i }).click()
    await expect(page.getByText('E2E GST')).toBeVisible()
  })
})
