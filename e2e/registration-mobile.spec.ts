import { expect, type Page, test } from '@playwright/test'

import { expectNoFlowErrors, watchForFlowErrors } from './support/runtime-errors'

/**
 * Both public wizards on a phone.
 *
 * Deliberately a smoke test rather than a second copy of the desktop suites.
 * What changes on a small screen is layout, not logic: the risk is a form that
 * runs off the side of the viewport, or a Continue button pushed somewhere a
 * thumb cannot reach. Re-running the whole journey would double the suite and
 * tell us nothing the desktop run has not already established.
 *
 * The `mobile` project supplies the device; this file only says what to check.
 */

/** Horizontal overflow, measured rather than eyeballed. */
async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const doc = document.documentElement
    return doc.scrollWidth - doc.clientWidth
  })
}

const PAGES = [
  { name: 'buyer', path: '/register/buyer', firstStep: 'Step 1 of 5' },
  { name: 'supplier', path: '/register/supplier', firstStep: 'Step 1 of 6' },
]

for (const registration of PAGES) {
  test.describe(`${registration.name} registration on a phone`, () => {
    test.skip(!process.env.DATABASE_URL, 'requires a seeded database')

    test('loads on the first step without running off the side', async ({ page }) => {
      const errors = watchForFlowErrors(page)
      await page.goto(registration.path)

      await expect(page.getByText(registration.firstStep)).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Your company' })).toBeVisible()

      // A pixel or two of rounding is not a broken layout; a form wider than the
      // screen is. The threshold keeps this from failing on sub-pixel noise
      // while still catching anything a person would notice.
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1)

      expectNoFlowErrors(errors)
    })

    test('the primary control is reachable and the form is usable', async ({ page }) => {
      await page.goto(registration.path)

      const companyName = page.getByLabel(/company name/i)
      await companyName.fill('UI Audit Mobile Probe')
      await expect(companyName).toHaveValue('UI Audit Mobile Probe')

      // Visible and inside the viewport, not merely present in the DOM: a
      // Continue button below a sticky footer is present and unusable.
      const advance = page.getByRole('button', { name: /continue/i })
      await expect(advance).toBeVisible()
      await advance.scrollIntoViewIfNeeded()

      const box = await advance.boundingBox()
      const viewport = page.viewportSize()
      expect(box, 'the Continue button has no box to click').not.toBeNull()
      expect(box!.x).toBeGreaterThanOrEqual(0)
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width + 1)
    })

    test('validation still stops the wizard on a small screen', async ({ page }) => {
      await page.goto(registration.path)
      await page.getByRole('button', { name: /continue/i }).click()

      await expect(page.getByText('Company name is required.')).toBeVisible()
      await expect(page.getByText(registration.firstStep)).toBeVisible()
      // The error message itself has to fit too - a validation message the
      // reader has to scroll sideways for is not much of a message.
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1)
    })
  })
}
