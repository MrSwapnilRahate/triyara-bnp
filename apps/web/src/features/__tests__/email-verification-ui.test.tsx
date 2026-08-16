import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Role } from '@triyara/auth'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { fail, http, HttpResponse, ok, server } from '@/test/msw'
import { renderWithProviders } from '@/test/render'

/**
 * Seeing that your address is unverified, and doing something about it.
 *
 * The backend has issued, hashed, expired and consumed verification tokens
 * since it was written and no screen ever showed the outcome, so the capability
 * existed and no user could reach it. These cover the two halves that make it
 * usable: the profile has to state the standing and offer the send, and the
 * emailed link has to land somewhere that completes the confirmation.
 *
 * The security shape is asserted here too, because it is a property of these
 * screens rather than of the service:
 *
 *   - verifying your own address needs no permission, so READ_ONLY does it
 *   - this UI can never name a target user - the route accepts `?userId=` and
 *     the service demands `update User` for it
 *   - the token is never rendered
 */

const nav = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }
let search = new URLSearchParams()
vi.mock('next/navigation', () => ({
  useRouter: () => nav,
  usePathname: () => '/verify-email',
  useSearchParams: () => search,
}))

const { EmailVerificationCard } =
  await import('@/features/admin/components/email-verification-card')
const { VerifyEmailView } = await import('@/app/(app)/verify-email/verify-email-view')

const STATUS = '/api/v1/auth/email-verification'
const CONFIRM = '/api/v1/auth/email-verification/confirm'

/** Every request the screens make, so a test can read what was actually sent. */
let requests: Array<{ url: string; body: unknown }> = []

type Reply = () => Response

function statusRoute(verified: boolean) {
  return http.get(STATUS, () =>
    HttpResponse.json(
      ok({
        userId: 'me',
        emailVerifiedAt: verified ? '2026-08-01T10:00:00.000Z' : null,
        verified,
      }),
    ),
  )
}

function requestRoute(reply?: Reply) {
  return http.post(STATUS, async ({ request }) => {
    requests.push({ url: request.url, body: await request.json() })
    return (
      reply?.() ??
      HttpResponse.json(
        ok({ email: 'me@triyara.test', expiresAt: '2026-08-17T09:00:00.000Z', sent: true }),
        { status: 202 },
      )
    )
  })
}

function confirmRoute(reply?: Reply) {
  return http.post(CONFIRM, async ({ request }) => {
    requests.push({ url: request.url, body: await request.json() })
    return (
      reply?.() ??
      HttpResponse.json(
        ok({ userId: 'me', emailVerifiedAt: '2026-08-16T09:00:00.000Z', verified: true }),
      )
    )
  })
}

/** The service answers expired, consumed and never-existed with this one 404. */
const notFound: Reply = () =>
  HttpResponse.json(
    fail([{ code: 'NOT_FOUND', message: 'This verification link is invalid or has expired.' }]),
    { status: 404 },
  )

const forbidden: Reply = () =>
  HttpResponse.json(
    fail([{ code: 'FORBIDDEN', message: 'This verification link belongs to another user.' }]),
    { status: 403 },
  )

const refused =
  (message: string): Reply =>
  () =>
    HttpResponse.json(fail([{ code: 'VALIDATION', message }]), { status: 422 })

const broke: Reply = () =>
  HttpResponse.json(fail([{ code: 'INTERNAL', message: 'boom' }]), { status: 500 })

beforeEach(() => {
  requests = []
  search = new URLSearchParams()
  vi.clearAllMocks()
})

afterEach(() => {
  vi.useRealTimers()
})

// ---------------------------------------------------------------- profile ---

describe('the profile states the verification standing', () => {
  it('shows a verified address as verified, with no action to take', async () => {
    server.use(statusRoute(true))
    renderWithProviders(<EmailVerificationCard email="me@triyara.test" />)

    expect(await screen.findByText('Verified')).toBeInTheDocument()
    expect(screen.queryByText('Not verified')).not.toBeInTheDocument()
    // Offering to verify an address that is already verified would only produce
    // a refusal from the service, which rejects exactly that.
    expect(screen.queryByRole('button', { name: /verification email/i })).not.toBeInTheDocument()
  })

  it('shows an unverified address as unverified, and offers the send', async () => {
    server.use(statusRoute(false))
    renderWithProviders(<EmailVerificationCard email="me@triyara.test" />)

    expect(await screen.findByText('Not verified')).toBeInTheDocument()
    expect(
      await screen.findByRole('button', { name: /send verification email/i }),
    ).toBeInTheDocument()
  })

  it('is busy while the standing loads', () => {
    server.use(statusRoute(false))
    const { container } = renderWithProviders(<EmailVerificationCard email="me@triyara.test" />)

    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument()
  })

  it('surfaces a failed read instead of guessing at the standing', async () => {
    server.use(http.get(STATUS, broke))
    renderWithProviders(<EmailVerificationCard email="me@triyara.test" />)

    expect(await screen.findByRole('button', { name: /try again/i })).toBeInTheDocument()
    expect(screen.queryByText('Verified')).not.toBeInTheDocument()
  })
})

describe('sending the verification email', () => {
  it('calls the request endpoint and confirms it was sent', async () => {
    server.use(statusRoute(false), requestRoute())
    renderWithProviders(<EmailVerificationCard email="me@triyara.test" />)

    await userEvent.click(await screen.findByRole('button', { name: /send verification email/i }))

    await waitFor(() => expect(requests).toHaveLength(1))
    expect(await screen.findByText('Verification email sent')).toBeInTheDocument()
  })

  it('never names a target user', async () => {
    // The route reads `?userId=` so an administrator can issue one for somebody
    // else, and the service demands `update User` for it. This screen must not
    // be able to reach that path at all.
    server.use(statusRoute(false), requestRoute())
    renderWithProviders(<EmailVerificationCard email="me@triyara.test" />)

    await userEvent.click(await screen.findByRole('button', { name: /send verification email/i }))
    await waitFor(() => expect(requests).toHaveLength(1))

    expect(requests[0]?.url).not.toContain('userId')
    expect(JSON.stringify(requests[0]?.body)).not.toContain('userId')
  })

  it.each(['ADMIN', 'EXPORT_MANAGER', 'VERIFIER', 'READ_ONLY'] as Role[])(
    'lets %s verify their own address',
    async (role) => {
      // No role gains anything from this screen: verifying your own address is
      // not an administrative act, so the least privileged role reaches it too.
      server.use(statusRoute(false), requestRoute())
      renderWithProviders(<EmailVerificationCard email="me@triyara.test" />, { roles: [role] })

      await userEvent.click(await screen.findByRole('button', { name: /send verification email/i }))
      await waitFor(() => expect(requests).toHaveLength(1))
    },
  )

  it('reports a refusal rather than claiming the mail was sent', async () => {
    server.use(statusRoute(false), requestRoute(refused('This address is already verified.')))
    renderWithProviders(<EmailVerificationCard email="me@triyara.test" />)

    await userEvent.click(await screen.findByRole('button', { name: /send verification email/i }))

    // The service's own words, not a generic failure: an address verified in
    // another tab is a refusal with a reason, and the reason is the useful part.
    expect(await screen.findByText(/already verified/i)).toBeInTheDocument()
    expect(screen.queryByText('Verification email sent')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /send verification email/i })).toBeEnabled()
  })

  it('offers a resend, but not an instant one', async () => {
    server.use(statusRoute(false), requestRoute())
    renderWithProviders(<EmailVerificationCard email="me@triyara.test" />)

    const send = await screen.findByRole('button', { name: /send verification email/i })
    await userEvent.click(send)

    // Same request semantics, relabelled: there is no second resend endpoint.
    const resend = await screen.findByRole('button', { name: /resend verification email/i })
    expect(resend).toBeDisabled()
    expect(screen.getByText(/you can resend in/i)).toBeInTheDocument()
    expect(requests).toHaveLength(1)
  })

  it('re-reads the standing after a send, so a verification elsewhere shows up', async () => {
    server.use(statusRoute(false), requestRoute())
    const { queryClient } = renderWithProviders(<EmailVerificationCard email="me@triyara.test" />)
    await screen.findByText('Not verified')

    const spy = vi.spyOn(queryClient, 'invalidateQueries')
    await userEvent.click(screen.getByRole('button', { name: /send verification email/i }))

    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith({ queryKey: ['admin', 'email-verification'] }),
    )
  })
})

// ------------------------------------------------------------ verify page ---

describe('the emailed link lands somewhere that completes it', () => {
  it('confirms a valid token and says so', async () => {
    search = new URLSearchParams({ token: 'a'.repeat(64) })
    server.use(statusRoute(false), confirmRoute())
    renderWithProviders(<VerifyEmailView />)

    expect(await screen.findByText('Your email address is verified')).toBeInTheDocument()
    expect(requests).toHaveLength(1)
    expect(requests[0]?.body).toEqual({ token: 'a'.repeat(64) })
  })

  it('spends the token exactly once', async () => {
    // StrictMode double-invokes effects. A second call would consume nothing
    // and return 404, turning a success into "invalid link".
    search = new URLSearchParams({ token: 'a'.repeat(64) })
    server.use(statusRoute(false), confirmRoute())
    renderWithProviders(<VerifyEmailView />)

    await screen.findByText('Your email address is verified')
    expect(requests).toHaveLength(1)
  })

  it('is busy while confirming', () => {
    search = new URLSearchParams({ token: 'a'.repeat(64) })
    server.use(statusRoute(false), confirmRoute())
    const { container } = renderWithProviders(<VerifyEmailView />)

    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument()
  })

  it('treats a missing token as a broken link and sends nothing', async () => {
    server.use(statusRoute(false), confirmRoute())
    renderWithProviders(<VerifyEmailView />)

    expect(await screen.findByText('This link is incomplete')).toBeInTheDocument()
    expect(requests).toHaveLength(0)
  })

  it('explains an expired or already-used link, and offers a new one', async () => {
    // The API answers expired, used and never-existed with one 404 on purpose:
    // telling them apart would confirm to a stranger that a token was real.
    search = new URLSearchParams({ token: 'a'.repeat(64) })
    server.use(statusRoute(false), confirmRoute(notFound))
    renderWithProviders(<VerifyEmailView />)

    expect(await screen.findByText('This link is no longer valid')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /send a new verification email/i })).toHaveAttribute(
      'href',
      '/settings/profile',
    )
  })

  it('reads a spent link as good news when the address is already verified', async () => {
    search = new URLSearchParams({ token: 'a'.repeat(64) })
    server.use(statusRoute(true), confirmRoute(notFound))
    renderWithProviders(<VerifyEmailView />)

    expect(await screen.findByText('Your email address is already verified')).toBeInTheDocument()
  })

  it('refuses a token belonging to somebody else', async () => {
    search = new URLSearchParams({ token: 'a'.repeat(64) })
    server.use(statusRoute(false), confirmRoute(forbidden))
    renderWithProviders(<VerifyEmailView />)

    expect(await screen.findByText('This link belongs to a different account')).toBeInTheDocument()
  })

  it('surfaces an unexpected failure rather than a blank screen', async () => {
    search = new URLSearchParams({ token: 'a'.repeat(64) })
    server.use(statusRoute(false), confirmRoute(broke))
    renderWithProviders(<VerifyEmailView />)

    // Not a success, and not a silent blank: the failure is named on screen.
    expect(await screen.findByText(/something went wrong|boom/i)).toBeInTheDocument()
    expect(screen.queryByText('Your email address is verified')).not.toBeInTheDocument()
  })

  it('lets READ_ONLY complete their own verification', async () => {
    search = new URLSearchParams({ token: 'a'.repeat(64) })
    server.use(statusRoute(false), confirmRoute())
    renderWithProviders(<VerifyEmailView />, { roles: ['READ_ONLY'] })

    expect(await screen.findByText('Your email address is verified')).toBeInTheDocument()
  })
})

describe('the token stays out of the page', () => {
  const TOKEN = 'b'.repeat(64)

  it('is never rendered, in success or in failure', async () => {
    search = new URLSearchParams({ token: TOKEN })
    server.use(statusRoute(false), confirmRoute())
    const { container, unmount } = renderWithProviders(<VerifyEmailView />)
    await screen.findByText('Your email address is verified')

    expect(container.textContent).not.toContain(TOKEN)
    expect(container.innerHTML).not.toContain(TOKEN)
    unmount()

    server.resetHandlers()
    server.use(statusRoute(false), confirmRoute(notFound))
    const second = renderWithProviders(<VerifyEmailView />)
    await screen.findByText('This link is no longer valid')

    expect(second.container.textContent).not.toContain(TOKEN)
    expect(second.container.innerHTML).not.toContain(TOKEN)
  })

  it('goes to the confirm endpoint and nowhere else', async () => {
    search = new URLSearchParams({ token: TOKEN })
    server.use(statusRoute(false), confirmRoute())
    renderWithProviders(<VerifyEmailView />)
    await screen.findByText('Your email address is verified')

    const carrying = requests.filter((r) => JSON.stringify(r).includes(TOKEN))
    expect(carrying).toHaveLength(1)
    expect(carrying[0]?.url).toContain('/auth/email-verification/confirm')
  })

  it('is not written to the console', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(() => undefined),
    )
    search = new URLSearchParams({ token: TOKEN })
    server.use(statusRoute(false), confirmRoute())
    renderWithProviders(<VerifyEmailView />)
    await screen.findByText('Your email address is verified')

    const written = spies.flatMap((spy) => spy.mock.calls.map((call) => JSON.stringify(call)))
    for (const spy of spies) spy.mockRestore()

    expect(written.join(' ')).not.toContain(TOKEN)
  })
})
