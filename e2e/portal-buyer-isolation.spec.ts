import type { Browser, Page } from '@playwright/test'

import { type BuyerFixture, createBuyerFixture } from './support/buyer-fixture'
import { expect, test } from './support/fixtures'
import { expectNoFlowErrors, type FlowErrors, watchForFlowErrors } from './support/runtime-errors'

/**
 * Two buyers in one tenant, and the wall between them.
 *
 * The repository tests already prove the queries carry both scopes. What they
 * cannot show is what a signed-in person actually gets when they put somebody
 * else's reference in the address bar - and that is the question worth
 * answering, because every buyer-facing identifier in this portal is a
 * human-readable number a buyer could plausibly guess or be sent by mistake.
 *
 * So Buyer A signs in for real and then reaches for Buyer B's requirement,
 * offer and document by their business identifiers. Both fixtures carry their
 * own label in every value, so a leak shows up as B's name on A's screen rather
 * than as a subtle count mismatch.
 */
test.describe.configure({ mode: 'serial' })

test.describe('one buyer cannot reach another buyer', () => {
  test.skip(!process.env.DATABASE_URL, 'requires a seeded database')

  let page: Page
  let errors: FlowErrors
  let alpha: BuyerFixture
  let beta: BuyerFixture

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    ;[alpha, beta] = await Promise.all([createBuyerFixture('alpha'), createBuyerFixture('beta')])

    page = await browser.newPage()
    errors = watchForFlowErrors(page)

    // Alpha sets a password and signs in exactly as a person would. Beta is
    // never signed in - only their data exists, which is the point.
    await page.goto(`/reset-password?token=${encodeURIComponent(alpha.inviteToken)}`)
    await page.getByPlaceholder(/new password/i).fill(alpha.password)
    await page.getByRole('button', { name: /update password/i }).click()
    await page.waitForURL(/\/login/)

    await page.getByPlaceholder('Email').fill(alpha.email)
    await page.getByPlaceholder('Password').fill(alpha.password)
    await page.getByRole('button', { name: /sign in/i }).click()
    await expect(page.getByRole('heading', { name: /your triyara portal/i })).toBeVisible()
  })

  test.afterAll(async () => {
    await page?.close()
  })

  test.afterEach(() => {
    expectNoFlowErrors(errors)
  })

  test('the requirements list holds only their own', async () => {
    await page.goto('/portal/requirements')

    await expect(page.getByText(alpha.rfqNumber)).toBeVisible()
    await expect(page.getByText(beta.rfqNumber)).toHaveCount(0)
    await expect(page.getByRole('heading', { name: beta.rfqTitle })).toHaveCount(0)
  })

  test('another buyer&rsquo;s requirement cannot be opened by its number', async () => {
    await page.goto(`/portal/requirements/${encodeURIComponent(beta.rfqNumber)}`)

    // The portal answers every refusal with one sentence, deliberately: telling
    // "not yours" apart from "no such number" would confirm the number exists.
    await expect(page.getByText(/portal unavailable/i)).toBeVisible()
    await expect(page.getByText(beta.rfqTitle)).toHaveCount(0)
    await expect(page.getByText(beta.rfqNumber)).toHaveCount(0)
  })

  test('their own requirement still opens, so the refusal is not blanket', async () => {
    // Without this the test above would pass just as well if the detail route
    // were broken for everybody.
    await page.goto(`/portal/requirements/${encodeURIComponent(alpha.rfqNumber)}`)
    await expect(page.getByRole('heading', { name: alpha.rfqTitle })).toBeVisible()
  })

  test('the quotations list holds only their own', async () => {
    await page.goto('/portal/quotations')

    await expect(page.getByText(alpha.quotationNumber)).toBeVisible()
    await expect(page.getByText(beta.quotationNumber)).toHaveCount(0)
  })

  test('another buyer&rsquo;s quotation cannot be opened by its number', async () => {
    await page.goto(`/portal/quotations/${encodeURIComponent(beta.quotationNumber)}`)

    await expect(page.getByText(/portal unavailable/i)).toBeVisible()
    await expect(page.getByText(beta.quotationNumber)).toHaveCount(0)
  })

  test('their own quotation still opens', async () => {
    await page.goto(`/portal/quotations/${encodeURIComponent(alpha.quotationNumber)}`)
    await expect(page.getByText(/what we quoted/i)).toBeVisible()
  })

  test('the documents list holds only their own', async () => {
    await page.goto('/portal/documents')

    await expect(page.getByRole('heading', { name: alpha.documentTitle })).toBeVisible()
    await expect(page.getByText(beta.documentTitle)).toHaveCount(0)
  })

  test('the overview counts describe only their own records', async () => {
    // Two buyers now hold a requirement, an offer and a document each. A count
    // that had lost its account scope would read 2 here, not 1.
    await page.goto('/portal')
    const tiles = page.locator('main')

    await expect(tiles.getByRole('link', { name: /requirements/i })).toContainText('1')
    await expect(tiles.getByRole('link', { name: /quotations/i })).toContainText('1')
    await expect(tiles.getByRole('link', { name: /documents/i })).toContainText('1')
    await expect(page.getByText(alpha.companyName)).toBeVisible()
    await expect(page.getByText(beta.companyName)).toHaveCount(0)
  })
})
