import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { expectNoAxeViolations } from '@/test/axe'
import { fail, http, HttpResponse, ok, server } from '@/test/msw'
import { renderWithProviders } from '@/test/render'

import { BuyerRegistrationWizard } from '../components/buyer-wizard'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }))

/** This project's jsdom leaves window.localStorage as a bare object. */
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

const created = { submitted: true, companyName: 'Gulf Spice Trading LLC' }

/** Fills step 1 and moves to step 2. */
async function completeCompanyStep(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/company name/i), 'Gulf Spice Trading LLC')
  await user.type(screen.getByLabelText(/^country/i), 'AE')
  await user.click(screen.getByRole('button', { name: /continue/i }))
}

beforeEach(() => {
  push.mockClear()
  installStorage()
  server.use(
    http.post('/api/public/buyer-registration', () =>
      HttpResponse.json(ok(created), { status: 201 }),
    ),
  )
})

describe('BuyerRegistrationWizard', () => {
  it('opens on the first of five steps', async () => {
    renderWithProviders(<BuyerRegistrationWizard />)
    expect(await screen.findByText('Step 1 of 5')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Your company' })).toBeInTheDocument()
  })

  it('will not advance while the company basics are missing', async () => {
    renderWithProviders(<BuyerRegistrationWizard />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /continue/i }))

    expect(await screen.findByText('Company name is required.')).toBeInTheDocument()
    expect(screen.getByText('Enter a two-letter country code, e.g. AE.')).toBeInTheDocument()
    expect(screen.getByText('Step 1 of 5')).toBeInTheDocument()
  })

  it('accepts a buyer who has only WhatsApp', async () => {
    renderWithProviders(<BuyerRegistrationWizard />)
    const user = userEvent.setup()
    await completeCompanyStep(user)

    await user.type(await screen.findByLabelText(/^name/i), 'Fatima Al Mansouri')
    await user.type(screen.getByLabelText(/whatsapp/i), '+971 55 000 0000')
    await user.click(screen.getByRole('button', { name: /continue/i }))

    expect(await screen.findByRole('heading', { name: 'What you need' })).toBeInTheDocument()
  })

  it('refuses a contact with no way to reach them', async () => {
    renderWithProviders(<BuyerRegistrationWizard />)
    const user = userEvent.setup()
    await completeCompanyStep(user)

    await user.type(await screen.findByLabelText(/^name/i), 'Fatima')
    await user.click(screen.getByRole('button', { name: /continue/i }))

    expect(
      await screen.findByText(/give us an email, phone or whatsapp number/i),
    ).toBeInTheDocument()
  })

  it('keeps a full contact name while typing', async () => {
    // The supplier wizard dropped characters here twice: once from a stale
    // props read, once from focus moving mid-word. Both fixes are carried over.
    renderWithProviders(<BuyerRegistrationWizard />)
    const user = userEvent.setup()
    await completeCompanyStep(user)

    const name = await screen.findByLabelText(/^name/i)
    await user.type(name, 'Fatima Al Mansouri')
    expect(name).toHaveValue('Fatima Al Mansouri')
  })

  it('lets a buyer add and remove product lines', async () => {
    renderWithProviders(<BuyerRegistrationWizard />)
    const user = userEvent.setup()
    await completeCompanyStep(user)
    await user.type(await screen.findByLabelText(/^name/i), 'Fatima')
    await user.type(screen.getByLabelText(/whatsapp/i), '+971 55 000 0000')
    await user.click(screen.getByRole('button', { name: /continue/i }))

    await user.type(await screen.findByLabelText(/^product$/i), 'Turmeric fingers')
    await user.click(screen.getByRole('button', { name: /add another product/i }))
    expect(await screen.findByText('Product 2')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /remove product 2/i }))
    await waitFor(() => expect(screen.queryByText('Product 2')).not.toBeInTheDocument())
  })

  it('saves a draft and offers it back on return', async () => {
    const first = renderWithProviders(<BuyerRegistrationWizard />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText(/company name/i), 'Gulf Spice Trading LLC')

    await waitFor(() => expect(window.localStorage.length).toBeGreaterThan(0))
    first.unmount()

    renderWithProviders(<BuyerRegistrationWizard />)
    expect(await screen.findByText(/we kept what you had already filled in/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/company name/i)).toHaveValue('Gulf Spice Trading LLC')
  })

  it('keeps the buyer draft separate from a supplier one', async () => {
    // Someone may be both a buyer and a supplier to us; one form must never
    // resume into the other.
    window.localStorage.setItem(
      'triyara.supplier-registration.draft.v1',
      JSON.stringify({ savedAt: Date.now(), data: { company: { companyName: 'Not this' } } }),
    )
    renderWithProviders(<BuyerRegistrationWizard />)

    expect(await screen.findByText('Step 1 of 5')).toBeInTheDocument()
    expect(screen.queryByText(/we kept what you had already filled in/i)).not.toBeInTheDocument()
    expect(screen.getByLabelText(/company name/i)).toHaveValue('')
  })

  it('submits and sends the buyer to the confirmation', async () => {
    const posted = vi.fn()
    server.use(
      http.post('/api/public/buyer-registration', async ({ request }) => {
        posted(await request.json())
        return HttpResponse.json(ok(created), { status: 201 })
      }),
    )
    renderWithProviders(<BuyerRegistrationWizard />)
    const user = userEvent.setup()

    await completeCompanyStep(user)
    await user.type(await screen.findByLabelText(/^name/i), 'Fatima Al Mansouri')
    await user.type(screen.getByLabelText(/^phone/i), '+971 50 123 4567')
    for (let i = 0; i < 3; i++) {
      await user.click(screen.getByRole('button', { name: /continue/i }))
    }
    await user.click(await screen.findByRole('button', { name: /send enquiry/i }))

    await waitFor(() => expect(posted).toHaveBeenCalled())
    const payload = posted.mock.calls[0]![0] as Record<string, Record<string, unknown>>
    expect(payload.company).toMatchObject({
      companyName: 'Gulf Spice Trading LLC',
      country: 'AE',
    })
    expect(payload.contact).toMatchObject({ phone: '+971 50 123 4567' })
    expect(payload.contact).not.toHaveProperty('email')
    // An untouched product row is an empty row, not a requirement.
    expect(payload.requirement!.products).toEqual([])

    await waitFor(() => expect(push).toHaveBeenCalledWith('/register/buyer/thank-you'))
    expect(window.localStorage.length).toBe(0)
  })

  it('keeps the form and its draft when the submission fails', async () => {
    server.use(
      http.post('/api/public/buyer-registration', () =>
        HttpResponse.json(fail([{ code: 'RATE_LIMITED', message: 'Too many enquiries.' }]), {
          status: 429,
        }),
      ),
    )
    renderWithProviders(<BuyerRegistrationWizard />)
    const user = userEvent.setup()

    await completeCompanyStep(user)
    await user.type(await screen.findByLabelText(/^name/i), 'Fatima')
    await user.type(screen.getByLabelText(/whatsapp/i), '+971 55 000 0000')
    for (let i = 0; i < 3; i++) {
      await user.click(screen.getByRole('button', { name: /continue/i }))
    }
    await user.click(await screen.findByRole('button', { name: /send enquiry/i }))

    expect(await screen.findByText(/too many enquiries/i)).toBeInTheDocument()
    expect(push).not.toHaveBeenCalled()
    await waitFor(() => expect(window.localStorage.length).toBeGreaterThan(0))
  })

  it('has no axe violations', async () => {
    const { container } = renderWithProviders(<BuyerRegistrationWizard />)
    await screen.findByText('Step 1 of 5')
    await expectNoAxeViolations(container)
  })
})
