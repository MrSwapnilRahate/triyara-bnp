import { expect, test } from '@playwright/test'

import { interactive } from './support/interactive'
import { signInAsNewStaff } from './support/staff-fixture'

test.describe('verification workflow', () => {
  test.skip(!process.env.DATABASE_URL, 'requires a seeded database')

  test('create verification, accept a document, approve', async ({ page, request }) => {
    await signInAsNewStaff(page, 'verification')

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
        title: `GST Cert ${Date.now()}`,
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
    // Each control is waited for as React's, not merely as pixels: this page is
    // server-rendered and a click that lands before hydration goes nowhere the
    // component hears about.
    await (await interactive(page.getByRole('button', { name: /^submit$/i }))).click()
    await (await interactive(page.getByRole('button', { name: /assign reviewer/i }))).click()
    await page.locator('select[name="reviewerId"]').selectOption({ index: 1 })
    await (await interactive(page.getByRole('button', { name: /^assign$/i }))).click()
    await (await interactive(page.getByRole('button', { name: /^accept$/i }).first())).click()
    await (await interactive(page.getByRole('button', { name: /^approve$/i }))).click()
    // The confirmation, not the button that opened it. Once the dialog is up
    // there are two controls called Approve, and asking for both is a strict
    // mode violation - the dialog's lives inside the confirmation form, which
    // the page's does not.
    await (
      await interactive(page.locator('form').getByRole('button', { name: /^approve$/i }))
    ).click()
    // The status line, not the word wherever it appears: the history entry
    // records the same transition, so a bare text match finds two and the
    // assertion dies of strict mode rather than proving the outcome.
    await expect(page.getByText(/Status\s+VERIFIED/)).toBeVisible()
  })
})
