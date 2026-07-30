import '@testing-library/jest-dom/vitest'

import { afterAll, afterEach, beforeAll, vi } from 'vitest'

import { server } from './src/test/msw'

// The API route tests run with @vitest-environment node, where there is no
// window at all. Guard the DOM shims rather than splitting the setup file.
const hasDom = typeof window !== 'undefined'

// jsdom implements neither of these; Radix needs both for positioning and
// scroll locking, and cmdk needs scrollIntoView.
if (hasDom && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  })
}

if (hasDom && !window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
}

if (hasDom) {
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => undefined)
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false
    Element.prototype.setPointerCapture = () => undefined
    Element.prototype.releasePointerCapture = () => undefined
  }
}

// The screens use next/navigation. Mocked once here so no test has to.
// A test that needs to assert navigation imports useRouter and reads .push.
const navigation = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }
vi.mock('next/navigation', () => ({
  useRouter: () => navigation,
  usePathname: () => '/catalog/products',
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

// `error` so an unhandled request fails the test rather than hitting the network.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
