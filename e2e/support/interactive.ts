import { expect, type Locator } from '@playwright/test'

/**
 * Waits until React has actually claimed a control, then returns it.
 *
 * Playwright's own actionability checks - visible, enabled, stable - are about
 * the pixels. They are all satisfied by server-rendered HTML that no JavaScript
 * has touched yet, so a click can land on a button that looks finished and is
 * not wired to anything.
 *
 * On these pages that is not a harmless early click. The create panels submit
 * through `useActionState`, and a submit that arrives before hydration goes
 * down the browser's own form path instead. The row is written either way -
 * which is why the database always showed the profile - but the component never
 * learns the action finished, so it sits on "Creating..." and the tabs it was
 * supposed to reveal never appear. Measured, the honest transition takes about
 * half a second; the failures were not slow, they were stuck.
 *
 * React marks the DOM nodes it owns with `__reactProps$…` when it hydrates, so
 * the presence of that key is the page telling us it is ready, rather than us
 * guessing with a timer. Polling it is a wait on real state: no fixed sleep, no
 * inflated assertion budget, and it returns the moment hydration lands.
 */
export async function interactive(locator: Locator): Promise<Locator> {
  await locator.waitFor({ state: 'visible' })

  await expect
    .poll(
      () =>
        locator.evaluate((element) =>
          Object.keys(element).some((key) => key.startsWith('__reactProps')),
        ),
      { message: 'the control never hydrated, so a click would not reach React' },
    )
    .toBe(true)

  return locator
}
