import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

/**
 * Runtime noise that would break a registration, as opposed to noise.
 *
 * A blanket "no console.error" assertion turns any third-party warning into a
 * failing registration test, and the first person to hit that will delete the
 * assertion rather than read it. So this collects only the classes of error
 * that actually mean the flow is broken: an uncaught exception, a React
 * hydration mismatch, or a chunk that failed to load - the last being precisely
 * what hid this flow from the production audit in the first place.
 */
const FLOW_BREAKING = [
  /hydrat/i,
  /Minified React error/i,
  /ChunkLoadError/i,
  /Loading chunk \d+ failed/i,
  /Failed to fetch dynamically imported module/i,
]

export interface FlowErrors {
  readonly messages: string[]
}

export function watchForFlowErrors(page: Page): FlowErrors {
  const messages: string[] = []

  // An uncaught exception is always worth failing on: nothing in this flow
  // should throw past its own handler.
  page.on('pageerror', (error) => messages.push(`pageerror: ${error.message}`))

  page.on('console', (message) => {
    if (message.type() !== 'error') return
    const text = message.text()
    if (FLOW_BREAKING.some((pattern) => pattern.test(text))) {
      messages.push(`console: ${text}`)
    }
  })

  // A registration page that cannot fetch its own JavaScript is not a working
  // page, whatever the HTML says.
  page.on('requestfailed', (request) => {
    const url = request.url()
    if (/\/_next\/static\/.+\.(js|css)$/.test(url)) {
      messages.push(`asset failed: ${url} (${request.failure()?.errorText ?? 'unknown'})`)
    }
  })

  return { messages }
}

export function expectNoFlowErrors(errors: FlowErrors): void {
  expect(errors.messages, 'the flow produced runtime errors').toEqual([])
}
