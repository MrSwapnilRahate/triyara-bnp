import { expect, test } from '@playwright/test'

test.describe('verification workflow', () => {
  test.skip(!process.env.DATABASE_URL, 'requires a seeded database')

  test('create verification, accept a document, approve', async ({ page, request }) => {
    await page.goto('/login')
    await page.getByPlaceholder('Email').fill('admin@triyaraexports.com')
    await page.getByPlaceholder('Password').fill('ChangeMe!123')
    await page.getByRole('button', { name: /sign in/i }).click()
    await page.waitForURL(/dashboard/)

    // account
    const accRes = await page.request.post('/api/v1/accounts', {
      data: { legalName: `Ver E2E ${Date.now()}` },
    })
    const accountId = (await accRes.json()).data.id as string

    // upload a GST document (presign -> PUT -> confirm)
    const pres = await page.request.post('/api/v1/documents/presign', {
      data: {
        fileName: 'gst.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 20,
        accountId,
        type: 'GST',
      },
    })
    const p = (await pres.json()).data
    await page.request.put(p.uploadUrl, {
      headers: { 'content-type': 'application/pdf' },
      data: Buffer.from('%PDF-1.4 gst test x'),
    })
    await page.request.post('/api/v1/documents', {
      data: {
        storageKey: p.storageKey,
        accountId,
        type: 'GST',
        title: 'GST Cert',
        mimeType: 'application/pdf',
        originalFilename: 'gst.pdf',
      },
    })

    // verification requiring only GST
    const vRes = await page.request.post('/api/v1/verifications', {
      data: { accountId, requiredDocumentTypes: ['GST'] },
    })
    const verificationId = (await vRes.json()).data.id as string

    await page.goto(`/verifications/${verificationId}`)
    await page.getByRole('button', { name: /^submit$/i }).click()
    await page.getByRole('button', { name: /assign reviewer/i }).click()
    await page.locator('select[name="reviewerId"]').selectOption({ index: 1 })
    await page.getByRole('button', { name: /^assign$/i }).click()
    await page
      .getByRole('button', { name: /^accept$/i })
      .first()
      .click()
    await page.getByRole('button', { name: /^approve$/i }).click()
    await page.getByRole('button', { name: /^approve$/i }).click() // dialog confirm
    await expect(page.getByText('VERIFIED')).toBeVisible()
  })
})
