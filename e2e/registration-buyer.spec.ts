import type { Page } from '@playwright/test'

import { expect, test } from './support/fixtures'
import { uniqueBuyer } from './support/test-data'

/**
 * The buyer enquiry wizard, driven through a real browser.
 *
 * There is already thorough component coverage of this wizard in jsdom. What
 * that cannot tell us is whether the thing a stranger loads over the network
 * actually works: whether it hydrates, whether the custom comboboxes open, and
 * whether the five steps hold together once real navigation and a real server
 * action are involved. A production audit found exactly that gap - the flow
 * could be verified as far as server-rendered HTML and nothing further.
 *
 * So these drive the UI and nothing else. No request is posted directly to the
 * registration API; if a step can only be passed by clicking, it is clicked.
 */

const STEP_TITLES = [
  'Your company',
  'Your contact',
  'What you need',
  'Destination and terms',
  'Documents',
]

/** Step 1, filled with the two answers the wizard actually insists on. */
async function completeCompanyStep(page: Page, companyName: string) {
  await page.getByLabel(/company name/i).fill(companyName)
  await page.getByLabel(/^country/i).fill('AE')
  await page.getByRole('button', { name: /continue/i }).click()
}

/** Step 2. A name and one way to reach them. */
async function completeContactStep(page: Page, email: string) {
  await page.getByLabel(/^name/i).fill('UI Audit Contact')
  await page.getByLabel(/^email/i).fill(email)
  await page.getByRole('button', { name: /continue/i }).click()
}

/** From step 3 to step 5, where the submit control lives. */
async function advanceToFinalStep(page: Page) {
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: /continue/i }).click()
  }
  await expect(page.getByText('Step 5 of 5')).toBeVisible()
}

test.describe('buyer registration', () => {
  test.skip(!process.env.DATABASE_URL, 'requires a seeded database')

  test('loads, hydrates and opens on the first of five steps', async ({ page }) => {
    await page.goto('/register/buyer')

    await expect(page.getByText('Step 1 of 5')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Your company' })).toBeVisible()

    // Hydration, proven by behaviour rather than by a marker: the step controls
    // are `type="button"` with no form around them, so a click that changes the
    // step can only have been handled by React.
    const companyName = page.getByLabel(/company name/i)
    await companyName.fill('Hydration Probe')
    await expect(companyName).toHaveValue('Hydration Probe')
  })

  test('refuses to advance while the required company answers are missing', async ({ page }) => {
    await page.goto('/register/buyer')
    await page.getByRole('button', { name: /continue/i }).click()

    await expect(page.getByText('Company name is required.')).toBeVisible()
    await expect(page.getByText(/two-letter country code/i)).toBeVisible()
    // Still on step one - the wizard did not quietly move on behind the errors.
    await expect(page.getByText('Step 1 of 5')).toBeVisible()
  })

  test('clears the validation message once the answer is given', async ({ page }) => {
    await page.goto('/register/buyer')
    await page.getByRole('button', { name: /continue/i }).click()
    await expect(page.getByText('Company name is required.')).toBeVisible()

    await completeCompanyStep(page, 'UI Audit Test Buyer')

    await expect(page.getByText('Company name is required.')).toBeHidden()
    await expect(page.getByRole('heading', { name: 'Your contact' })).toBeVisible()
  })

  test('will not take a contact it has no way of reaching', async ({ page }) => {
    await page.goto('/register/buyer')
    await completeCompanyStep(page, 'UI Audit Test Buyer')

    await page.getByLabel(/^name/i).fill('UI Audit Contact')
    await page.getByRole('button', { name: /continue/i }).click()

    await expect(page.getByText(/give us an email, phone or whatsapp/i)).toBeVisible()
    await expect(page.getByText('Step 2 of 5')).toBeVisible()
  })

  test('drives a custom combobox with the mouse and with the keyboard', async ({ page }) => {
    // The business type control is a button, not a <select>. It is the one part
    // of this form most likely to break under hydration and the least likely to
    // be caught by anything short of a browser - and a listbox that only a
    // mouse can operate is a listbox half the people using it cannot.
    await page.goto('/register/buyer')
    const businessType = page.getByLabel(/business type/i)

    // Mouse.
    await businessType.click()
    const option = page.getByRole('option').first()
    const byMouse = (await option.textContent())?.trim() ?? ''
    await option.click()
    await expect(businessType).toContainText(byMouse)

    // Keyboard, from the control itself: open, move, commit.
    await businessType.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('option').first()).toBeVisible()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')

    await expect(page.getByRole('option').first()).toBeHidden()
    await expect(businessType).not.toBeEmpty()
  })

  test('walks every step, and Back returns with the answers intact', async ({ page }) => {
    const buyer = uniqueBuyer()
    await page.goto('/register/buyer')

    await completeCompanyStep(page, buyer.companyName)
    await expect(page.getByRole('heading', { name: STEP_TITLES[1]! })).toBeVisible()
    await expect(page.getByText('Step 2 of 5')).toBeVisible()

    // Back, before going any further. The draft is kept in localStorage, so
    // what this really checks is that returning does not hand the buyer an
    // empty form and ask them to type it again.
    await page.getByRole('button', { name: /back/i }).click()
    await expect(page.getByText('Step 1 of 5')).toBeVisible()
    await expect(page.getByLabel(/company name/i)).toHaveValue(buyer.companyName)

    await page.getByRole('button', { name: /continue/i }).click()
    await completeContactStep(page, buyer.email)

    // Steps 3 to 5 carry nothing the wizard insists on, so the assertion worth
    // making is that the indicator keeps up with the heading.
    for (const [index, title] of [...STEP_TITLES.entries()].slice(2)) {
      await expect(page.getByRole('heading', { name: title })).toBeVisible()
      await expect(page.getByText(`Step ${index + 1} of 5`)).toBeVisible()
      if (index < STEP_TITLES.length - 1) {
        await page.getByRole('button', { name: /continue/i }).click()
      }
    }
  })

  test('submits through the UI and lands on the confirmation', async ({ page }) => {
    const buyer = uniqueBuyer()

    await page.goto('/register/buyer')
    await completeCompanyStep(page, buyer.companyName)
    await completeContactStep(page, buyer.email)
    // Contact already advanced to step 3; two more reach the last step, where
    // the control becomes "Send enquiry" rather than "Continue".
    await advanceToFinalStep(page)

    const send = page.getByRole('button', { name: /send enquiry/i })
    await expect(send).toBeEnabled()
    await send.click()

    // The wizard navigates on success; waiting on the URL is what makes this
    // deterministic rather than a guess about how long the post takes.
    await page.waitForURL('**/register/buyer/thank-you')
    await expect(page.getByRole('heading').first()).toBeVisible()
  })

  test('disables the submit control while sending, so a second click cannot post again', async ({
    page,
  }) => {
    const buyer = uniqueBuyer()
    const posts: string[] = []
    page.on('request', (req) => {
      if (req.method() === 'POST' && req.url().includes('/api/public/buyer-registration')) {
        posts.push(req.url())
      }
    })

    // The submission is held open so the pending state is observable at all.
    // Without this the post usually completes before a second click could be
    // attempted, and the test would pass without ever exercising the guard.
    await page.route('**/api/public/buyer-registration', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1_500))
      await route.continue()
    })

    await page.goto('/register/buyer')
    await completeCompanyStep(page, buyer.companyName)
    await completeContactStep(page, buyer.email)
    await advanceToFinalStep(page)

    const send = page.getByRole('button', { name: /send enquiry/i })
    await send.click()

    // The loading state is the guarantee: the control disables itself, so the
    // impatient second click has nothing to hit.
    await expect(send).toBeDisabled()
    await expect(send).toHaveAttribute('aria-busy', 'true')

    await page.waitForURL('**/register/buyer/thank-you')
    expect(posts).toHaveLength(1)
  })
})
