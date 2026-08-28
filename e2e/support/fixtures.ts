import { expect, test as base } from '@playwright/test'

import { expectNoFlowErrors, watchForFlowErrors } from './runtime-errors'

/**
 * The registration suite's `test`, with runtime-error watching always on.
 *
 * The helper existed before this fixture and was opt-in, which meant it was
 * opted into twice per spec and forgotten everywhere else - so a hydration
 * failure during Back navigation, or a chunk that failed to load while opening
 * a combobox, passed in silence. Those are precisely the failures a browser
 * suite exists to catch, and the ones a jsdom test cannot see.
 *
 * An automatic fixture rather than something each test remembers to call: the
 * point is that nobody has to remember. The narrow whitelist in
 * `runtime-errors.ts` is unchanged, so third-party console noise still does not
 * fail anything.
 */
export const test = base.extend<{ flowErrors: void }>({
  flowErrors: [
    async ({ page }, use, testInfo) => {
      const errors = watchForFlowErrors(page)

      await use()

      // Only when the test itself passed. A test that already failed has its
      // own reason, and burying it under a runtime-error assertion would send
      // the reader after the wrong thing.
      if (testInfo.status === testInfo.expectedStatus) {
        expectNoFlowErrors(errors)
      }
    },
    { auto: true },
  ],
})

export { expect }
