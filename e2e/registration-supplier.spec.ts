import { expect, type Page, test } from '@playwright/test'

import { expectNoFlowErrors, watchForFlowErrors } from './support/runtime-errors'
import { uniqueSupplier } from './support/test-data'

/**
 * The supplier registration wizard, driven through a real browser.
 *
 * Six steps rather than the buyer's five, and a stricter first step: a supplier
 * must give a legal name and pick a business type from a custom combobox before
 * anything else. That combobox is the reason this suite exists in a browser at
 * all - it is a button that opens a listbox, so nothing short of real hydration
 * can operate it, and a jsdom test proves only that the component would work if
 * the page ever came alive.
 */

const STEP_TITLES = [
  'Your company',
  'Primary contact',
  'Products',
  'Certifications',
  'Documents',
  'Business details',
]

/** Step 1: the four answers the wizard insists on, business type included. */
async function completeCompanyStep(page: Page, companyName: string, legalName: string) {
  await page.getByLabel(/company name/i).fill(companyName)
  await page.getByLabel(/legal name/i).fill(legalName)
  await page.getByLabel(/^country/i).fill('IN')

  await page.getByLabel(/business type/i).click()
  await page.getByRole('option').first().click()

  await page.getByRole('button', { name: /continue/i }).click()
}

/** Step 2: a name and one way to reach them. */
async function completeContactStep(page: Page, email: string) {
  await page.getByLabel(/^name/i).fill('UI Audit Supplier Contact')
  await page.getByLabel(/^email/i).fill(email)
  await page.getByRole('button', { name: /continue/i }).click()
}

/** From step 3 to step 6, where the submit control lives. */
async function advanceToFinalStep(page: Page) {
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: /continue/i }).click()
  }
  await expect(page.getByText('Step 6 of 6')).toBeVisible()
}

test.describe('supplier registration', () => {
  test.skip(!process.env.DATABASE_URL, 'requires a seeded database')

  test('loads, hydrates and opens on the first of six steps', async ({ page }) => {
    const errors = watchForFlowErrors(page)
    await page.goto('/register/supplier')

    await expect(page.getByText('Step 1 of 6')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Your company' })).toBeVisible()

    const companyName = page.getByLabel(/company name/i)
    await companyName.fill('Hydration Probe')
    await expect(companyName).toHaveValue('Hydration Probe')

    expectNoFlowErrors(errors)
  })

  test('refuses to advance while the required company answers are missing', async ({ page }) => {
    await page.goto('/register/supplier')
    await page.getByRole('button', { name: /continue/i }).click()

    await expect(page.getByText('Company name is required.')).toBeVisible()
    await expect(page.getByText('Legal name is required.')).toBeVisible()
    await expect(page.getByText('Select a business type.')).toBeVisible()
    await expect(page.getByText(/two-letter country code/i)).toBeVisible()
    await expect(page.getByText('Step 1 of 6')).toBeVisible()
  })

  test('constrains the country field to a two-letter code as it is typed', async ({ page }) => {
    await page.goto('/register/supplier')
    const country = page.getByLabel(/^country/i)

    // The field caps length at two and upper-cases as you go, so a whole
    // country name cannot be entered in the first place - the invalid state is
    // largely unreachable rather than merely rejected afterwards.
    await country.fill('India')
    await expect(country).toHaveValue('IN')

    await country.fill('in')
    await expect(country).toHaveValue('IN')
  })

  test('rejects a country code that is too short to be one', async ({ page }) => {
    await page.goto('/register/supplier')
    // One letter survives the maxLength cap and still fails the pattern, which
    // is the invalid value a real person can actually produce.
    await page.getByLabel(/^country/i).fill('I')
    await page.getByRole('button', { name: /continue/i }).click()

    await expect(page.getByText(/two-letter country code/i)).toBeVisible()
    await expect(page.getByText('Step 1 of 6')).toBeVisible()
  })

  test('rejects a website without a scheme', async ({ page }) => {
    const supplier = uniqueSupplier()
    await page.goto('/register/supplier')

    await page.getByLabel(/company name/i).fill(supplier.companyName)
    await page.getByLabel(/legal name/i).fill(supplier.legalName)
    await page.getByLabel(/^country/i).fill('IN')
    await page.getByLabel(/business type/i).click()
    await page.getByRole('option').first().click()
    await page.getByLabel(/website/i).fill('kerala-spice.example.com')
    await page.getByRole('button', { name: /continue/i }).click()

    await expect(page.getByText(/include https:\/\/ at the start/i)).toBeVisible()
  })

  test('opens the business type listbox and takes a selection', async ({ page }) => {
    await page.goto('/register/supplier')

    const businessType = page.getByLabel(/business type/i)
    await businessType.click()

    const options = page.getByRole('option')
    await expect(options.first()).toBeVisible()
    const chosen = (await options.first().textContent())?.trim() ?? ''
    await options.first().click()

    await expect(businessType).toContainText(chosen)
    // The listbox closed again, rather than being left open over the form.
    await expect(options.first()).toBeHidden()
  })

  test('accepts the Indian trade identifiers on the company step', async ({ page }) => {
    const supplier = uniqueSupplier()
    await page.goto('/register/supplier')

    await page.getByLabel(/gst number/i).fill('29ABCDE1234F1Z5')
    await page.getByLabel(/iec number/i).fill('0388014979')
    await page.getByLabel(/year established/i).fill('2011')
    await page.getByLabel(/employee count/i).fill('120')

    await completeCompanyStep(page, supplier.companyName, supplier.legalName)

    // Cleared the step, so none of those four was rejected.
    await expect(page.getByRole('heading', { name: 'Primary contact' })).toBeVisible()
  })

  test('walks every step, and Back returns with the answers intact', async ({ page }) => {
    const supplier = uniqueSupplier()
    await page.goto('/register/supplier')

    await completeCompanyStep(page, supplier.companyName, supplier.legalName)
    await expect(page.getByText('Step 2 of 6')).toBeVisible()

    await page.getByRole('button', { name: /back/i }).click()
    await expect(page.getByText('Step 1 of 6')).toBeVisible()
    await expect(page.getByLabel(/company name/i)).toHaveValue(supplier.companyName)
    await expect(page.getByLabel(/legal name/i)).toHaveValue(supplier.legalName)

    await page.getByRole('button', { name: /continue/i }).click()
    await completeContactStep(page, supplier.email)

    for (const [index, title] of [...STEP_TITLES.entries()].slice(2)) {
      await expect(page.getByRole('heading', { name: title })).toBeVisible()
      await expect(page.getByText(`Step ${index + 1} of 6`)).toBeVisible()
      if (index < STEP_TITLES.length - 1) {
        await page.getByRole('button', { name: /continue/i }).click()
      }
    }
  })

  test('submits through the UI and lands on the confirmation', async ({ page }) => {
    const errors = watchForFlowErrors(page)
    const supplier = uniqueSupplier()

    await page.goto('/register/supplier')
    await completeCompanyStep(page, supplier.companyName, supplier.legalName)
    await completeContactStep(page, supplier.email)
    await advanceToFinalStep(page)

    const submit = page.getByRole('button', { name: /submit registration/i })
    await expect(submit).toBeEnabled()
    await submit.click()

    await page.waitForURL('**/register/supplier/thank-you')
    await expect(page.getByRole('heading').first()).toBeVisible()

    expectNoFlowErrors(errors)
  })

  test('disables the submit control while sending, so a second click cannot post again', async ({
    page,
  }) => {
    const supplier = uniqueSupplier()
    const posts: string[] = []
    page.on('request', (req) => {
      if (req.method() === 'POST' && req.url().includes('/api/public/supplier-registration')) {
        posts.push(req.url())
      }
    })

    // Held open so the pending state exists long enough to be asserted at all.
    await page.route('**/api/public/supplier-registration', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1_500))
      await route.continue()
    })

    await page.goto('/register/supplier')
    await completeCompanyStep(page, supplier.companyName, supplier.legalName)
    await completeContactStep(page, supplier.email)
    await advanceToFinalStep(page)

    const submit = page.getByRole('button', { name: /submit registration/i })
    await submit.click()

    await expect(submit).toBeDisabled()
    await expect(submit).toHaveAttribute('aria-busy', 'true')

    await page.waitForURL('**/register/supplier/thank-you')
    expect(posts).toHaveLength(1)
  })
})
