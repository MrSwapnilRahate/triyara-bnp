import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { expectNoAxeViolations } from '@/test/axe'
import { fail, http, HttpResponse, ok, server } from '@/test/msw'
import { renderWithProviders } from '@/test/render'

import { RegistrationWizard } from '../components/registration-wizard'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

/**
 * A real Storage for these tests.
 *
 * This project's jsdom leaves `window.localStorage` as a bare object with no
 * methods. `draft.ts` swallows that (auto-save degrades rather than breaking
 * the form, which is why the wizard works in a browser regardless), but the
 * draft behaviour cannot be asserted without somewhere to actually store one.
 * Installed here rather than in the shared setup so no other suite's behaviour
 * changes underneath it.
 */
function installStorage() {
  const map = new Map<string, string>()
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, String(v)),
      removeItem: (k: string) => void map.delete(k),
      clear: () => map.clear(),
      key: (i: number) => [...map.keys()][i] ?? null,
      get length() {
        return map.size
      },
    },
  })
}

const created = { submitted: true, companyName: 'Kerala Spice Exports' }

/** Fills step 1 and moves to step 2. */
async function completeCompanyStep(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/company name/i), 'Kerala Spice Exports')
  await user.type(screen.getByLabelText(/legal name/i), 'Kerala Spice Exports Pvt Ltd')
  await user.type(screen.getByLabelText(/^country/i), 'IN')
  await user.click(screen.getByLabelText(/business type/i))
  await user.click(await screen.findByRole('option', { name: /manufacturer exporter/i }))
  await user.click(screen.getByRole('button', { name: /continue/i }))
}

beforeEach(() => {
  push.mockClear()
  installStorage()
  server.use(
    http.post('/api/public/supplier-registration', () =>
      HttpResponse.json(ok(created), { status: 201 }),
    ),
  )
})

describe('RegistrationWizard', () => {
  it('opens on the first of six steps', async () => {
    renderWithProviders(<RegistrationWizard />)
    expect(await screen.findByText('Step 1 of 6')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Your company' })).toBeInTheDocument()
  })

  it('will not advance past the company step while the basics are missing', async () => {
    renderWithProviders(<RegistrationWizard />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /continue/i }))

    expect(await screen.findByText('Company name is required.')).toBeInTheDocument()
    expect(screen.getByText('Enter a two-letter country code, e.g. IN.')).toBeInTheDocument()
    expect(screen.getByText('Step 1 of 6')).toBeInTheDocument()
  })

  it('accepts a supplier who has only WhatsApp', async () => {
    // The case the feature exists for. Requiring an email would lose them.
    renderWithProviders(<RegistrationWizard />)
    const user = userEvent.setup()
    await completeCompanyStep(user)

    await user.type(await screen.findByLabelText(/^name/i), 'Priya Raman')
    await user.type(screen.getByLabelText(/whatsapp/i), '+91 98470 11111')
    await user.click(screen.getByRole('button', { name: /continue/i }))

    expect(await screen.findByRole('heading', { name: 'Products' })).toBeInTheDocument()
  })

  it('refuses a contact with no way to reach them', async () => {
    renderWithProviders(<RegistrationWizard />)
    const user = userEvent.setup()
    await completeCompanyStep(user)

    await user.type(await screen.findByLabelText(/^name/i), 'Priya Raman')
    await user.click(screen.getByRole('button', { name: /continue/i }))

    expect(
      await screen.findByText(/give us an email, mobile or whatsapp number/i),
    ).toBeInTheDocument()
  })

  it('saves a draft and offers it back on return', async () => {
    const first = renderWithProviders(<RegistrationWizard />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText(/company name/i), 'Kerala Spice Exports')

    await waitFor(() => expect(window.localStorage.length).toBeGreaterThan(0))
    first.unmount()

    renderWithProviders(<RegistrationWizard />)
    expect(await screen.findByText(/we kept what you had already filled in/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/company name/i)).toHaveValue('Kerala Spice Exports')
  })

  it('can throw the draft away and start again', async () => {
    const first = renderWithProviders(<RegistrationWizard />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText(/company name/i), 'Wrong Company')
    await waitFor(() => expect(window.localStorage.length).toBeGreaterThan(0))
    first.unmount()

    renderWithProviders(<RegistrationWizard />)
    await user.click(await screen.findByRole('button', { name: /start again/i }))

    expect(screen.getByLabelText(/company name/i)).toHaveValue('')
    expect(window.localStorage.length).toBe(0)
  })

  it('submits and sends the supplier to the confirmation', async () => {
    const posted = vi.fn()
    server.use(
      http.post('/api/public/supplier-registration', async ({ request }) => {
        posted(await request.json())
        return HttpResponse.json(ok(created), { status: 201 })
      }),
    )
    renderWithProviders(<RegistrationWizard />)
    const user = userEvent.setup()

    await completeCompanyStep(user)
    await user.type(await screen.findByLabelText(/^name/i), 'Priya Raman')
    await user.type(screen.getByLabelText(/whatsapp/i), '+91 98470 11111')
    for (let i = 0; i < 4; i++) {
      await user.click(screen.getByRole('button', { name: /continue/i }))
    }
    await user.click(await screen.findByRole('button', { name: /submit registration/i }))

    await waitFor(() => expect(posted).toHaveBeenCalled())
    const payload = posted.mock.calls[0]![0] as Record<string, Record<string, unknown>>
    expect(payload.company).toMatchObject({ companyName: 'Kerala Spice Exports', country: 'IN' })
    expect(payload.contact).toMatchObject({ whatsapp: '+91 98470 11111' })
    // A blank optional is omitted rather than sent as an empty string.
    expect(payload.contact).not.toHaveProperty('email')

    await waitFor(() => expect(push).toHaveBeenCalledWith('/register/supplier/thank-you'))
    expect(window.localStorage.length).toBe(0)
  })

  it('keeps the form and its draft when the submission fails', async () => {
    server.use(
      http.post('/api/public/supplier-registration', () =>
        HttpResponse.json(fail([{ code: 'RATE_LIMITED', message: 'Too many registrations.' }]), {
          status: 429,
        }),
      ),
    )
    renderWithProviders(<RegistrationWizard />)
    const user = userEvent.setup()

    await completeCompanyStep(user)
    await user.type(await screen.findByLabelText(/^name/i), 'Priya Raman')
    await user.type(screen.getByLabelText(/whatsapp/i), '+91 98470 11111')
    for (let i = 0; i < 4; i++) {
      await user.click(screen.getByRole('button', { name: /continue/i }))
    }
    await user.click(await screen.findByRole('button', { name: /submit registration/i }))

    expect(await screen.findByText(/too many registrations/i)).toBeInTheDocument()
    // Not navigated away, and the draft survives so the whole form is not
    // retyped. The debounce has to be allowed to fire before this is true.
    expect(push).not.toHaveBeenCalled()
    await waitFor(() => expect(window.localStorage.length).toBeGreaterThan(0))
  })

  it('keeps the answers when stepping back and forward', async () => {
    renderWithProviders(<RegistrationWizard />)
    const user = userEvent.setup()

    await completeCompanyStep(user)
    await user.type(await screen.findByLabelText(/^name/i), 'Priya Raman')
    await user.click(screen.getByRole('button', { name: /back/i }))

    expect(await screen.findByLabelText(/company name/i)).toHaveValue('Kerala Spice Exports')
    await user.click(screen.getByRole('button', { name: /continue/i }))
    expect(await screen.findByLabelText(/^name/i)).toHaveValue('Priya Raman')
  })

  it('has no axe violations', async () => {
    const { container } = renderWithProviders(<RegistrationWizard />)
    await screen.findByText('Step 1 of 6')
    await expectNoAxeViolations(container)
  })
})
