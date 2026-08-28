import { expect, test } from '@playwright/test'

import { interactive } from './support/interactive'
import { signInAsNewStaff } from './support/staff-fixture'

test.describe('supplier profile', () => {
  test.skip(!process.env.DATABASE_URL, 'requires a seeded database')

  test('create account, then create + edit its supplier profile', async ({ page }) => {
    await signInAsNewStaff(page, 'supplier')

    // Create an account via the API (shares the auth cookie).
    const res = await page.request.post('/api/v1/accounts', {
      data: { legalName: `Sup E2E ${Date.now()}` },
    })
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    const accountId = body.data.id as string

    await page.goto(`/accounts/${accountId}/supplier`)
    // The panel is server-rendered before React claims it; clicking too early
    // submits through the browser instead and the component never hears back.
    await (
      await interactive(page.getByRole('button', { name: /create supplier profile/i }))
    ).click()
    await expect(page.getByRole('button', { name: /^overview$/i })).toBeVisible()

    await page.getByRole('button', { name: /^capabilities$/i }).click()
    await page.getByPlaceholder('Product (e.g. Onion Powder)').fill('Dehydrated Onion')
    await (await interactive(page.getByRole('button', { name: /add product/i }))).click()
    await expect(page.getByText('Dehydrated Onion')).toBeVisible()
  })
})
