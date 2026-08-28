import type { Page } from '@playwright/test'

import { createBuyerFixture } from './support/buyer-fixture'
import { expect, test } from './support/fixtures'

/**
 * The signed-in buyer portal on a phone.
 *
 * A smoke test, for the same reason the registration one is: what changes on a
 * small screen is layout, not logic, and the desktop suites already prove the
 * journey works. What they cannot show is whether the buyer can reach any of it
 * with a thumb.
 *
 * It matters more here than on the public wizards. A buyer reaching this portal
 * is usually following a link we emailed them, and email is read on a phone -
 * so the first time most of these accounts see the portal at all, it is at this
 * width. Every stop below is measured for horizontal overflow rather than
 * eyeballed, because a table that runs off the side is the failure this portal
 * is most likely to have: four of its five screens are lists of records.
 *
 * The `page` fixture carries the device from the `mobile` project, so this file
 * never sets a viewport of its own. That is also why it does not share one page
 * across tests the way the desktop suites do - `browser.newPage()` would build
 * a context with default options and quietly test a desktop viewport.
 */

/** Horizontal overflow, measured rather than eyeballed. */
async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const doc = document.documentElement
    return doc.scrollWidth - doc.clientWidth
  })
}

/** Sets the password through the UI and signs in, exactly as a person would. */
async function signInOnPhone(page: Page, label: string) {
  const buyer = await createBuyerFixture(label)

  await page.goto(`/reset-password?token=${encodeURIComponent(buyer.inviteToken)}`)
  await page.getByPlaceholder(/new password/i).fill(buyer.password)
  await page.getByRole('button', { name: /update password/i }).click()
  await page.waitForURL(/\/login/)

  // The login form is the first thing any of these accounts meets, and it is
  // met on a phone. Worth a measurement of its own before going further.
  expect(await horizontalOverflow(page), 'the login page overflows').toBeLessThanOrEqual(1)

  await page.getByPlaceholder('Email').fill(buyer.email)
  await page.getByPlaceholder('Password').fill(buyer.password)
  await page.getByRole('button', { name: /sign in/i }).click()
  await expect(page.getByRole('heading', { name: /your triyara portal/i })).toBeVisible()

  return buyer
}

test.describe('the buyer portal on a phone', () => {
  test.skip(!process.env.DATABASE_URL, 'requires a seeded database')

  test('every portal screen fits the width of the phone', async ({ page }) => {
    const buyer = await signInOnPhone(page, 'mobile-width')

    // One journey rather than a test per screen: each stop costs a sign-in, and
    // the assertion is the same measurement at every one of them.
    const stops = [
      { name: 'overview', path: '/portal' },
      { name: 'requirements', path: '/portal/requirements' },
      { name: 'quotations', path: '/portal/quotations' },
      { name: 'documents', path: '/portal/documents' },
      { name: 'new requirement', path: '/portal/requirements/new' },
      {
        name: 'requirement detail',
        path: `/portal/requirements/${encodeURIComponent(buyer.rfqNumber)}`,
      },
      {
        name: 'quotation detail',
        path: `/portal/quotations/${encodeURIComponent(buyer.quotationNumber)}`,
      },
    ]

    for (const stop of stops) {
      await page.goto(stop.path)
      // Asserted before measuring, so an overflow of 0 on an error page cannot
      // pass for a screen that fits.
      await expect(page.getByRole('navigation', { name: 'Portal' })).toBeVisible()

      // A pixel or two of rounding is not a broken layout; a page wider than
      // the screen is.
      expect(await horizontalOverflow(page), `${stop.name} runs off the side`).toBeLessThanOrEqual(
        1,
      )
    }
  })

  test('the whole portal is reachable from the wrapped navigation', async ({ page }) => {
    await signInOnPhone(page, 'mobile-nav')

    // The nav wraps rather than collapsing into a drawer, which is a decision
    // worth holding: with no menu button, every destination has to be visible
    // and inside the viewport at this width or it is simply unreachable.
    const nav = page.getByRole('navigation', { name: 'Portal' })
    const viewport = page.viewportSize()!

    for (const label of ['Overview', 'Requirements', 'Quotations', 'Documents']) {
      const link = nav.getByRole('link', { name: label })
      await expect(link, `${label} is not visible on a phone`).toBeVisible()

      const box = await link.boundingBox()
      expect(box, `${label} has no box to tap`).not.toBeNull()
      expect(box!.x).toBeGreaterThanOrEqual(0)
      expect(box!.x + box!.width, `${label} sits past the right edge`).toBeLessThanOrEqual(
        viewport.width + 1,
      )
    }

    // And they navigate, rather than merely being present.
    await nav.getByRole('link', { name: 'Quotations' }).click()
    await page.waitForURL(/\/portal\/quotations/)
    await expect(
      page.getByRole('heading', { name: /what we have quoted|quotations/i }),
    ).toBeVisible()
  })

  test('a requirement can be submitted from a phone', async ({ page }) => {
    await signInOnPhone(page, 'mobile-submit')
    const product = `UI Audit phone cardamom ${Date.now().toString(36)}`

    await page.goto('/portal/requirements')
    await page.getByRole('link', { name: /new requirement/i }).click()
    await page.waitForURL(/requirements\/new/)

    await page.getByLabel(/^product/i).fill(product)
    await page.getByLabel(/^quantity/i).fill('5 MT')

    // Visible and inside the viewport, not merely present in the DOM: a submit
    // button under a sticky footer is present and unusable.
    const send = page.getByRole('button', { name: /send requirement/i })
    await expect(send).toBeVisible()
    await send.scrollIntoViewIfNeeded()

    const box = await send.boundingBox()
    const viewport = page.viewportSize()!
    expect(box, 'the send button has no box to tap').not.toBeNull()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1)

    await send.click()

    await expect(page.getByText(/QR-/)).toBeVisible()
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1)

    await page.goto('/portal/requirements')
    await expect(page.getByRole('heading', { name: product })).toBeVisible()
  })
})
