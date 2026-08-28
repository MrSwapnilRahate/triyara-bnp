import type { Browser, Page } from '@playwright/test'

import { type BuyerFixture, createBuyerFixture } from './support/buyer-fixture'
import { expect, test } from './support/fixtures'
import { expectNoFlowErrors, type FlowErrors, watchForFlowErrors } from './support/runtime-errors'

/**
 * Signing in returns you to the page you asked for.
 *
 * The middleware always recorded the destination - a signed-out request for
 * `/portal/requirements` arrives at `/login?callbackUrl=…` - but nothing read
 * it, so everyone landed on `/dashboard`. A buyer following a link to one page
 * arrived at another and had to find their way back.
 *
 * The other four cases here are the reason that fix is not a one-line change.
 * A post-login redirect that trusts its input is an open redirect, and an open
 * redirect on a sign-in page is a credible phishing step: the link looks like
 * the real site, the login is the real login, and the landing page is not.
 */
test.describe.configure({ mode: 'serial' })

test.describe('signing in returns the buyer to where they were going', () => {
  test.skip(!process.env.DATABASE_URL, 'requires a seeded database')

  let page: Page
  let errors: FlowErrors
  let buyer: BuyerFixture

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    buyer = await createBuyerFixture('deeplink')
    page = await browser.newPage()
    errors = watchForFlowErrors(page)

    // Password set through the UI, as everywhere else. Not signed in yet - each
    // test below starts signed out, which is the state the defect lives in.
    await page.goto(`/reset-password?token=${encodeURIComponent(buyer.inviteToken)}`)
    await page.getByPlaceholder(/new password/i).fill(buyer.password)
    await page.getByRole('button', { name: /update password/i }).click()
    await page.waitForURL(/\/login/)
  })

  test.afterAll(async () => {
    await page?.close()
  })

  test.afterEach(() => {
    expectNoFlowErrors(errors)
  })

  async function signIn() {
    await page.getByPlaceholder('Email').fill(buyer.email)
    await page.getByPlaceholder('Password').fill(buyer.password)
    await page.getByRole('button', { name: /sign in/i }).click()
    // Wait for the sign-in to actually take, rather than asserting into a page
    // that is still the login form. Any destination will do here - which one it
    // is, is what each test then checks.
    await page.waitForURL((url) => !url.pathname.startsWith('/login'))
  }

  async function signOut() {
    await page.goto('/portal')
    await page.getByRole('button', { name: /sign out/i }).click()
    await page.waitForURL(/\/login/)
  }

  test('a deep link survives the trip through sign-in', async () => {
    // The whole defect, in one journey: ask for a specific page while signed
    // out, and arrive at that page rather than somewhere else.
    await page.goto(`/portal/requirements/${encodeURIComponent(buyer.rfqNumber)}`)
    await page.waitForURL(/\/login/)
    expect(page.url()).toContain('callbackUrl')

    await signIn()

    await expect(page.getByRole('heading', { name: buyer.rfqTitle })).toBeVisible()
    expect(page.url()).toContain(buyer.rfqNumber)

    await signOut()
  })

  test('a plain sign-in still lands where it always did', async () => {
    await page.goto('/login')
    expect(page.url()).not.toContain('callbackUrl')

    await signIn()

    // No callback, so nothing changes: the buyer gets their portal.
    await expect(page.getByRole('heading', { name: /your triyara portal/i })).toBeVisible()

    await signOut()
  })

  test('an absolute URL elsewhere cannot become the landing page', async () => {
    await page.goto('/login?callbackUrl=https%3A%2F%2Fexample.com%2Fstolen')
    await signIn()

    await expect(page.getByRole('heading', { name: /your triyara portal/i })).toBeVisible()
    expect(page.url()).toContain('localhost:3000')
    expect(page.url()).not.toContain('example.com')

    await signOut()
  })

  test('a protocol-relative URL cannot become the landing page', async () => {
    // `//example.com` has no scheme, so a naive "starts with a slash" check
    // waves it through - and the browser reads it as another site.
    await page.goto('/login?callbackUrl=%2F%2Fexample.com%2Fstolen')
    await signIn()

    await expect(page.getByRole('heading', { name: /your triyara portal/i })).toBeVisible()
    expect(page.url()).toContain('localhost:3000')
    expect(page.url()).not.toContain('example.com')

    await signOut()
  })

  test('a malformed callback falls back rather than breaking the sign-in', async () => {
    // A value that is not a path at all. Control characters and NUL bytes are
    // covered by the validator's own tests, where they can be asserted exactly;
    // putting one in a real URL mostly tests the browser's parser.
    await page.goto('/login?callbackUrl=notapath')
    await signIn()

    await expect(page.getByRole('heading', { name: /your triyara portal/i })).toBeVisible()

    await signOut()
  })
})

/**
 * A callback cannot promote anybody.
 *
 * Its own page and its own buyer, deliberately: this asserts what the callback
 * does NOT decide, so it should not inherit a session from the journey above.
 */
test('a callback naming a page this role cannot use is still routed by role', async ({ page }) => {
  test.skip(!process.env.DATABASE_URL, 'requires a seeded database')
  const buyer = await createBuyerFixture('deeplink-role')

  await page.goto(`/reset-password?token=${encodeURIComponent(buyer.inviteToken)}`)
  await page.getByPlaceholder(/new password/i).fill(buyer.password)
  await page.getByRole('button', { name: /update password/i }).click()
  await page.waitForURL(/\/login/)

  // Asking to land on the staff dashboard.
  await page.goto('/login?callbackUrl=%2Fdashboard')
  await page.getByPlaceholder('Email').fill(buyer.email)
  await page.getByPlaceholder('Password').fill(buyer.password)
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/login'))

  // And getting the portal, exactly as a direct visit would have given them.
  // `authorized()` remains the authority on where a role may go.
  await expect(page.getByRole('heading', { name: /your triyara portal/i })).toBeVisible()
  await expect(page.getByText(/sourcing pipeline|accounts overview/i)).toHaveCount(0)
})
