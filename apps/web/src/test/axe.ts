import axe, { type AxeResults, type RunOptions } from 'axe-core'
import { expect } from 'vitest'

/**
 * Runs axe against a rendered screen and fails with readable violation output.
 *
 * Mirrors the helper in @triyara/ui: the design system asserts its components
 * are accessible in isolation, and this asserts they stay accessible once a
 * feature has composed them into a screen. Both are needed - a set of accessible
 * parts assembles into an inaccessible whole very easily (duplicate ids,
 * unlabelled regions, heading order).
 */
export async function expectNoAxeViolations(
  container: HTMLElement,
  options: RunOptions = {},
): Promise<void> {
  const results: AxeResults = await axe.run(container, {
    // jsdom has no layout or computed paint, so contrast cannot be evaluated
    // here. It is checked in the browser pass instead of being silently
    // reported as passing.
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
