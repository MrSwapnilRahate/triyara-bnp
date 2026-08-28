import { expect, test } from '@playwright/test'

import { interactive } from './support/interactive'
import { signInAsNewStaff } from './support/staff-fixture'

test.describe('buyer profile', () => {
  test.skip(!process.env.DATABASE_URL, 'requires a seeded database')

  test('create account, then create + populate its buyer profile', async ({ page }) => {
    await signInAsNewStaff(page, 'buyer')

    const res = await page.request.post('/api/v1/accounts', {
      data: { legalName: `Buyer E2E ${Date.now()}` },
    })
    const accountId = (await res.json()).data.id as string

    await page.goto(`/accounts/${accountId}/buyer`)
    // The panel is server-rendered before React claims it; clicking too early
    // submits through the browser instead and the component never hears back.
    await (await interactive(page.getByRole('button', { name: /create buyer profile/i }))).click()
    await expect(page.getByRole('button', { name: /^overview$/i })).toBeVisible()

    await page.getByRole('button', { name: /^products$/i }).click()
    await page.getByPlaceholder('Product (e.g. Onion Powder)').fill('Dehydrated Onion')
    await (await interactive(page.getByRole('button', { name: /add product/i }))).click()
    await expect(page.getByText('Dehydrated Onion')).toBeVisible()
  })
})
