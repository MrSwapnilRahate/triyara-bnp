import { waitFor } from '@testing-library/react'
import type * as TriyaraUi from '@triyara/ui'
import { ThemeProvider } from '@triyara/ui'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { adminKeys } from '@/features/admin/api/keys'
import { http, HttpResponse, ok, server } from '@/test/msw'
import { createTestQueryClient, renderWithProviders } from '@/test/render'

/**
 * The photo in the top bar.
 *
 * `UserMenu` has always accepted an `avatarUrl`, but nothing passed one: the
 * server-rendered `ChromeUser` does not carry it, and `AuthUser` cannot without
 * changing the session token. So a staff member could upload a photo, see it on
 * their profile, and still be represented by initials on every screen.
 *
 * The chrome now reads the same `/api/v1/me` query the profile screen uses. That
 * matters beyond the initial render: the avatar mutations invalidate that key,
 * so uploading or removing a photo moves the top bar with it.
 */

/**
 * `UserMenu` is replaced by a probe rather than rendered for real.
 *
 * The defect is the wiring - nothing ever handed the menu an avatar - and that
 * is a question about props, not pixels. Rendering the real one would assert
 * nothing anyway: Radix decides an avatar has loaded by constructing an Image
 * and waiting for a load event jsdom does not fire, so it sits on initials
 * whatever it is given.
 */
const userMenuProps: Array<Record<string, unknown>> = []
vi.mock('@triyara/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof TriyaraUi>()
  return {
    ...actual,
    UserMenu: (props: Record<string, unknown>) => {
      userMenuProps.push(props)
      return <div data-testid="user-menu" />
    },
  }
})

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

const { AppChrome } = await import('../app-chrome')

const USER = { name: 'Ada Lovelace', email: 'ada@triyara.test', roles: ['ADMIN'] }
const ORG = { id: 'org-1', name: 'Triyara' }

function profileReturning(avatarUrl: string | null) {
  server.use(
    http.get('*/api/v1/me', () =>
      HttpResponse.json(
        ok({ id: 'u1', name: USER.name, email: USER.email, avatarUrl, roles: ['ADMIN'] }),
      ),
    ),
  )
}

/** The chrome reads theme and density from the provider the real layout supplies. */
function chrome() {
  return (
    <ThemeProvider>
      <AppChrome user={USER} organization={ORG}>
        <div>page</div>
      </AppChrome>
    </ThemeProvider>
  )
}

function renderChrome() {
  // The client is held so a test can invalidate the profile key, which is
  // exactly what the avatar mutations do on success - and therefore the real
  // mechanism by which the top bar learns the photo changed.
  const queryClient = createTestQueryClient()
  return { ...renderWithProviders(chrome(), { queryClient }), queryClient }
}

/** ThemeProvider persists the theme; this environment ships no working store. */
function stubLocalStorage() {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  })
}

/** What the top bar was last handed. */
function lastAvatarUrl(): unknown {
  return userMenuProps.at(-1)?.avatarUrl
}

beforeEach(() => {
  userMenuProps.length = 0
  stubLocalStorage()
})

describe('the avatar in the top bar', () => {
  it('passes no avatar when the profile has none, so the menu shows initials', async () => {
    profileReturning(null)
    renderChrome()

    await waitFor(() => expect(userMenuProps.length).toBeGreaterThan(0))
    await waitFor(() => expect(lastAvatarUrl()).toBeUndefined())
  })

  it('passes the photo once the profile has one', async () => {
    profileReturning('/api/v1/users/u1/avatar?v=abc123')
    renderChrome()

    await waitFor(() => expect(lastAvatarUrl()).toBe('/api/v1/users/u1/avatar?v=abc123'))
  })

  it('follows a replacement, because the stored URL carries the new version', async () => {
    profileReturning('/api/v1/users/u1/avatar?v=first')
    const { queryClient } = renderChrome()
    await waitFor(() => expect(lastAvatarUrl()).toBe('/api/v1/users/u1/avatar?v=first'))

    profileReturning('/api/v1/users/u1/avatar?v=second')
    await queryClient.invalidateQueries({ queryKey: adminKeys.profile() })

    await waitFor(() => expect(lastAvatarUrl()).toBe('/api/v1/users/u1/avatar?v=second'))
  })

  it('returns to initials after a removal', async () => {
    profileReturning('/api/v1/users/u1/avatar?v=abc')
    const { queryClient } = renderChrome()
    await waitFor(() => expect(lastAvatarUrl()).toBe('/api/v1/users/u1/avatar?v=abc'))

    profileReturning(null)
    await queryClient.invalidateQueries({ queryKey: adminKeys.profile() })

    await waitFor(() => expect(lastAvatarUrl()).toBeUndefined())
  })

  it('renders the chrome at all when the profile request fails', async () => {
    // The avatar is decoration; losing it must not take the navigation with it.
    server.use(http.get('*/api/v1/me', () => new HttpResponse(null, { status: 500 })))
    const { container } = renderChrome()

    await waitFor(() => expect(container.textContent).toContain('page'))
  })
})
