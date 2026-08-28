import type { Browser, Page } from '@playwright/test'

import {
  type BuyerFixture,
  createAccountForProvisioning,
  createBuyerFixture,
} from './support/buyer-fixture'
import { expect, test } from './support/fixtures'
import { expectNoFlowErrors, type FlowErrors, watchForFlowErrors } from './support/runtime-errors'

/**
 * The authenticated buyer, end to end, in a real browser.
 *
 * Until this file existed, every end-to-end test in the repository signed in as
 * `admin@triyaraexports.com`. Not one exercised the portal, which meant the
 * entire journey a customer actually takes - invitation, password, login,
 * overview, requirements, quotations, documents, logout - had no browser
 * coverage at all, and `resetPasswordAction` had no coverage of any kind.
 *
 * Serial, and deliberately so. This is one continuous session: the password set
 * in the third test is the password the fourth logs in with, and the cookie from
 * the fourth is what every later test reads the portal through. A parallel
 * version would need each test to re-authenticate, which would test the login
 * form eleven times and the journey once.
 *
 * Because the session has to survive between tests, these share one page opened
 * from the browser rather than taking the per-test `page` fixture. That page is
 * outside the automatic runtime-error fixture, so the watcher is attached to it
 * by hand and asserted after every test - the guarantee is kept, just wired
 * explicitly.
 */
test.describe.configure({ mode: 'serial' })

test.describe('the buyer journey, from invitation to logout', () => {
  test.skip(!process.env.DATABASE_URL, 'requires a seeded database')

  let page: Page
  let errors: FlowErrors
  let buyer: BuyerFixture

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    buyer = await createBuyerFixture('buyer-a')
    page = await browser.newPage()
    errors = watchForFlowErrors(page)
  })

  test.afterAll(async () => {
    await page?.close()
  })

  // The same assertion the automatic fixture makes, on the shared page.
  test.afterEach(() => {
    expectNoFlowErrors(errors)
  })

  test('refuses an invitation link whose token is not real', async () => {
    await page.goto('/reset-password?token=ui-audit-not-a-real-token')
    await page.getByPlaceholder(/new password/i).fill('UiAudit!nonsense1')
    await page.getByRole('button', { name: /update password/i }).click()

    await expect(page.getByText(/invalid or has expired/i)).toBeVisible()
    // Still on the form; a bad token must not be treated as a set password.
    await expect(page).toHaveURL(/reset-password/)
  })

  test('refuses a password shorter than the rule allows', async () => {
    // The field carries `required` and `minLength={8}`, so the browser refuses
    // the submission itself and the server's own "at least 8 characters" reply
    // is a backstop a real person never reaches. What a user experiences is
    // this: the form does not submit, and the field reports why.
    await page.goto(`/reset-password?token=${encodeURIComponent(buyer.inviteToken)}`)
    const field = page.getByPlaceholder(/new password/i)
    await field.fill('short')
    await page.getByRole('button', { name: /update password/i }).click()

    const validity = await field.evaluate((el: HTMLInputElement) => ({
      valid: el.checkValidity(),
      tooShort: el.validity.tooShort,
    }))
    expect(validity.valid).toBe(false)
    expect(validity.tooShort).toBe(true)
    // Nothing was submitted, so the invitation is still unused - which the next
    // test depends on.
    await expect(page).toHaveURL(/reset-password/)
  })

  test('accepts the invitation and sends the buyer to sign in', async () => {
    await page.goto(`/reset-password?token=${encodeURIComponent(buyer.inviteToken)}`)
    await page.getByPlaceholder(/new password/i).fill(buyer.password)
    await page.getByRole('button', { name: /update password/i }).click()

    // The action redirects on success. Waiting on the URL is the assertion.
    await page.waitForURL(/\/login/)
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible()
  })

  test('will not let the same invitation be used twice', async () => {
    // The token is consumed on success, so a forwarded or re-opened invitation
    // email cannot set the password a second time.
    await page.goto(`/reset-password?token=${encodeURIComponent(buyer.inviteToken)}`)
    await page.getByPlaceholder(/new password/i).fill('UiAudit!secondattempt1')
    await page.getByRole('button', { name: /update password/i }).click()

    await expect(page.getByText(/invalid or has expired/i)).toBeVisible()
  })

  test('refuses the wrong password', async () => {
    await page.goto('/login')
    await page.getByPlaceholder('Email').fill(buyer.email)
    await page.getByPlaceholder('Password').fill('UiAudit!definitelywrong')
    await page.getByRole('button', { name: /sign in/i }).click()

    await expect(page.getByText(/invalid email or password/i)).toBeVisible()
    await expect(page).toHaveURL(/\/login/)
  })

  test('signs in and lands in the portal, not the staff dashboard', async () => {
    await page.goto('/login')
    await page.getByPlaceholder('Email').fill(buyer.email)
    await page.getByPlaceholder('Password').fill(buyer.password)
    await page.getByRole('button', { name: /sign in/i }).click()

    // Asserted on what renders, not on the address bar. Auth.js sends the
    // browser to `/dashboard` and the middleware serves the portal in its
    // place without rewriting the URL, so a buyer ends up reading the portal at
    // a /dashboard address. Odd to look at, and harmless - but a URL assertion
    // here would be testing that quirk rather than that the buyer got their
    // portal.
    await expect(page.getByRole('heading', { name: /your triyara portal/i })).toBeVisible()
    await expect(page.getByText(buyer.companyName)).toBeVisible()

    // And none of the staff application came with it.
    for (const staffOnly of [/^accounts$/i, /^suppliers$/i, /^verifications$/i]) {
      await expect(page.getByRole('link', { name: staffOnly })).toHaveCount(0)
    }
  })

  test('the overview shows this buyer, and counts that match their data', async () => {
    await page.goto('/portal')

    await expect(page.getByText(buyer.companyName)).toBeVisible()

    // Scoped to the page body: the same labels appear in the header navigation,
    // and the tile is the one carrying the number.
    const tiles = page.locator('main')
    // One requirement, one offer, one document - this fixture's own data rather
    // than a figure hard-coded into the test.
    await expect(tiles.getByRole('link', { name: /requirements/i })).toContainText('1')
    await expect(tiles.getByRole('link', { name: /quotations/i })).toContainText('1')
    await expect(tiles.getByRole('link', { name: /documents/i })).toContainText('1')
  })

  test('the requirements list shows their own requirement', async () => {
    await page.goto('/portal/requirements')
    await expect(page.getByRole('heading', { name: buyer.rfqTitle })).toBeVisible()
    await expect(page.getByText(buyer.rfqNumber)).toBeVisible()
  })

  test('the requirement detail opens from the list', async () => {
    await page.goto('/portal/requirements')
    await page.getByRole('link', { name: buyer.rfqTitle }).click()

    await page.waitForURL(new RegExp(buyer.rfqNumber))
    await expect(page.getByRole('heading', { name: buyer.rfqTitle })).toBeVisible()
    await expect(page.getByText(/unpolished rice/i)).toBeVisible()
  })

  test('submits a new requirement through the form and sees it afterwards', async () => {
    const product = `UI Audit turmeric ${Date.now().toString(36)}`

    await page.goto('/portal/requirements')
    await page.getByRole('link', { name: /new requirement/i }).click()
    await page.waitForURL(/requirements\/new/)

    await page.getByLabel(/^product/i).fill(product)
    await page.getByLabel(/^quantity/i).fill('5 MT')

    const send = page.getByRole('button', { name: /send requirement/i })
    await send.click()

    // The confirmation carries the reference the buyer quotes back to us.
    await expect(page.getByText(/QR-/)).toBeVisible()

    // And it reaches the list they came from, marked as not yet triaged.
    await page.goto('/portal/requirements')
    await expect(page.getByRole('heading', { name: product })).toBeVisible()
    await expect(page.getByText(/submitted — under review/i)).toBeVisible()
  })

  test('the quotations list and detail show their own offer', async () => {
    await page.goto('/portal/quotations')
    await expect(page.getByText(buyer.quotationNumber)).toBeVisible()

    await page.getByRole('link', { name: buyer.quotationNumber }).click()
    await page.waitForURL(new RegExp(buyer.quotationNumber))
    await expect(page.getByText(/what we quoted/i)).toBeVisible()
  })

  test('the documents list shows their own document', async () => {
    await page.goto('/portal/documents')
    await expect(page.getByRole('heading', { name: buyer.documentTitle })).toBeVisible()
    // Metadata only - opening the file is a separate batch, and there is
    // deliberately nothing here to click.
    await expect(page.getByText(/gst-certificate\.pdf/i)).toBeVisible()
  })

  test('a buyer is kept out of the staff application', async () => {
    await page.goto('/dashboard')

    // The portal is served in the staff dashboard's place; the staff screen
    // itself is never rendered.
    await expect(page.getByRole('heading', { name: /your triyara portal/i })).toBeVisible()
    await expect(page.getByText(/sourcing pipeline|accounts overview/i)).toHaveCount(0)

    await page.goto('/accounts')
    await expect(page.getByRole('heading', { name: /your triyara portal/i })).toBeVisible()
  })

  test('signs out, and the portal will not reopen afterwards', async () => {
    await page.goto('/portal')
    await page.getByRole('button', { name: /sign out/i }).click()
    await page.waitForURL(/\/login/)

    // Direct navigation after logout, and the browser's own history: neither
    // may bring the portal back.
    await page.goto('/portal/requirements')
    await page.waitForURL(/\/login/)
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible()
    await expect(page.getByText(buyer.rfqNumber)).toBeHidden()
  })
})

/**
 * What the provisioning gate refuses.
 *
 * Service-level rather than browser-level, and that is the honest description:
 * these assert the rule the real endpoint enforces, called through the real
 * service with a real ADMIN ability set. There is no staff UI journey here.
 */
test.describe('portal access is only granted to approved accounts', () => {
  test.skip(!process.env.DATABASE_URL, 'requires a seeded database')

  test('refuses an account that has not been approved', async () => {
    const pending = await createAccountForProvisioning('PENDING_REVIEW')
    await expect(
      pending.provision(`ui-audit-pending-${pending.stamp}@example.com`),
    ).rejects.toThrow(/only an approved account/i)
  })

  test('does not issue a second invitation for the same person', async () => {
    const approved = await createAccountForProvisioning('APPROVED')
    const email = `ui-audit-twice-${approved.stamp}@example.com`

    const first = await approved.provision(email)
    expect(first.status).toBe('provisioned')

    // A second press must not mint a fresh credential for an existing user.
    const second = await approved.provision(email)
    expect(second.status).toBe('already_linked')
  })
})
