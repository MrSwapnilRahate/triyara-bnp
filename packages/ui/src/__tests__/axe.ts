import axe, { type AxeResults, type RunOptions } from 'axe-core'
import { expect } from 'vitest'

/**
 * Runs axe against a container and fails with readable violation output.
 *
 * axe-core is used directly rather than through a matcher package: one fewer
 * dependency to keep in step with Vitest, and the failure message is ours to
 * make useful.
 */
export async function expectNoAxeViolations(
  container: HTMLElement,
  options: RunOptions = {},
): Promise<void> {
  const results: AxeResults = await axe.run(container, {
    // colour-contrast cannot be evaluated in jsdom - it has no layout or
    // computed paint - so it is asserted in the manual review pass instead of
    // being silently reported as passing here.
    rules: { 'color-contrast': { enabled: false } },
    ...options,
  })

  if (results.violations.length > 0) {
    const detail = results.violations
      .map((v) => {
        const nodes = v.nodes.map((n) => `      ${n.html}`).join('\n')
        return `  [${v.impact ?? 'unknown'}] ${v.id}: ${v.help}\n${nodes}`
      })
      .join('\n')
    expect.fail(`axe found ${results.violations.length} violation(s):\n${detail}`)
  }
}
