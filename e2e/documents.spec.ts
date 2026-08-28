import { expect, test } from '@playwright/test'

import { signInAsNewStaff } from './support/staff-fixture'

test.describe('documents', () => {
  test.skip(!process.env.DATABASE_URL, 'requires a seeded database')

  test('upload a document through the UI and see it listed', async ({ page }) => {
    await signInAsNewStaff(page, 'documents')

    const res = await page.request.post('/api/v1/accounts', {
      data: { legalName: `Doc E2E ${Date.now()}` },
    })
    const accountId = (await res.json()).data.id as string

    await page.goto('/documents')
    await page.getByRole('button', { name: /upload document/i }).click()
    await page.locator('select[name="accountId"]').selectOption(accountId)
    await page.locator('select[name="type"]').selectOption('GST')
    // Unique, and asserted by that exact title. The documents list is not
    // scoped to one account, so a fixed name matches every earlier run's row
    // on a reused database and the assertion dies of strict mode instead of
    // telling anyone what broke.
    const title = `E2E GST ${Date.now()}`
    await page.locator('input[name="title"]').fill(title)
    await page.locator('input[name="file"]').setInputFiles({
      name: 'gst.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 e2e test file'),
    })
    await page.getByRole('button', { name: /^upload$/i }).click()
    // The row in the table, not merely the title somewhere on the page: the
    // success message repeats it, so `getByText` matches twice and the
    // assertion dies of strict mode instead of proving the document is listed.
    await expect(page.getByRole('cell', { name: title })).toBeVisible()
  })
})
