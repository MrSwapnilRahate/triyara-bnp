import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { expectNoAxeViolations } from '@/test/axe'
import { http, HttpResponse, ok, server } from '@/test/msw'
import { renderWithProviders } from '@/test/render'

import { SupplierContactsTab } from '../supplier-contacts-tab'

const contact = (over: Record<string, unknown> = {}) => ({
  id: 'c1',
  supplierId: 's1',
  name: 'Ravi Kumar',
  role: 'SALES',
  designation: 'Sr. Manager - Exports',
  email: 'ravi@spice.test',
  phone: null,
  whatsapp: '+919900112233',
  isPrimary: true,
  sortOrder: 10,
  notes: null,
  version: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
})

const handlers = (rows = [contact()]) => [
  http.get('/api/suppliers/s1/contacts', () => HttpResponse.json(ok(rows))),
]

describe('SupplierContactsTab', () => {
  it('lists the people and how to reach them', async () => {
    server.use(...handlers())
    renderWithProviders(<SupplierContactsTab supplierId="s1" />, { roles: ['ADMIN'] })

    expect(await screen.findByText('Ravi Kumar')).toBeInTheDocument()
    expect(screen.getByText('ravi@spice.test')).toBeInTheDocument()
    expect(screen.getByText('+919900112233')).toBeInTheDocument()
    expect(screen.getByText('Primary')).toBeInTheDocument()
  })

  it('says so plainly when nobody is recorded', async () => {
    server.use(...handlers([]))
    renderWithProviders(<SupplierContactsTab supplierId="s1" />, { roles: ['ADMIN'] })

    expect(await screen.findByText(/no contacts yet/i)).toBeInTheDocument()
  })

  it('offers no controls to a role that cannot edit', async () => {
    server.use(...handlers())
    renderWithProviders(<SupplierContactsTab supplierId="s1" />, { roles: ['READ_ONLY'] })

    await screen.findByText('Ravi Kumar')
    expect(screen.queryByRole('button', { name: /add contact/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument()
  })

  it('lets an editor add a contact', async () => {
    const user = userEvent.setup()
    let posted: Record<string, unknown> | null = null
    server.use(
      http.post('/api/suppliers/s1/contacts', async ({ request }) => {
        posted = (await request.json()) as Record<string, unknown>
        return HttpResponse.json(ok(contact({ id: 'c2', name: 'Priya' })), { status: 201 })
      }),
      ...handlers(),
    )
    renderWithProviders(<SupplierContactsTab supplierId="s1" />, { roles: ['ADMIN'] })

    await user.click(await screen.findByRole('button', { name: /add contact/i }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText(/name/i), 'Priya Nair')
    await user.type(within(dialog).getByLabelText(/whatsapp/i), '+919812345678')
    await user.click(within(dialog).getByRole('button', { name: /add contact/i }))

    await waitFor(() => expect(posted).not.toBeNull())
    expect(posted).toMatchObject({ name: 'Priya Nair', whatsapp: '+919812345678' })
  })

  it('sends only isPrimary when promoting, with the contact version', async () => {
    const user = userEvent.setup()
    let body: Record<string, unknown> | null = null
    let ifMatch: string | null = null
    server.use(
      http.patch('/api/suppliers/s1/contacts/c2', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>
        ifMatch = request.headers.get('if-match')
        return HttpResponse.json(ok(contact({ id: 'c2', isPrimary: true })))
      }),
      ...handlers([contact(), contact({ id: 'c2', name: 'Priya', isPrimary: false, version: 3 })]),
    )
    renderWithProviders(<SupplierContactsTab supplierId="s1" />, { roles: ['ADMIN'] })

    await screen.findByText('Priya')
    await user.click(screen.getByRole('button', { name: /make primary/i }))

    await waitFor(() => expect(body).not.toBeNull())
    expect(body).toEqual({ isPrimary: true })
    // The version guard is what stops two people fighting over primary.
    expect(ifMatch).toBe('W/"v3"')
  })

  it('does not offer "make primary" on the contact that already is', async () => {
    server.use(...handlers())
    renderWithProviders(<SupplierContactsTab supplierId="s1" />, { roles: ['ADMIN'] })

    await screen.findByText('Ravi Kumar')
    expect(screen.queryByRole('button', { name: /make primary/i })).not.toBeInTheDocument()
  })

  it('confirms before removing, and sends the version', async () => {
    const user = userEvent.setup()
    let ifMatch: string | null = null
    server.use(
      http.delete('/api/suppliers/s1/contacts/c1', ({ request }) => {
        ifMatch = request.headers.get('if-match')
        return HttpResponse.json(ok(contact({ version: 2 })))
      }),
      ...handlers(),
    )
    renderWithProviders(<SupplierContactsTab supplierId="s1" />, { roles: ['ADMIN'] })

    await user.click(await screen.findByRole('button', { name: /remove ravi kumar/i }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: /^remove$/i }))

    await waitFor(() => expect(ifMatch).toBe('W/"v1"'))
  })

  it('reports a server refusal instead of pretending it worked', async () => {
    const user = userEvent.setup()
    server.use(
      http.post('/api/suppliers/s1/contacts', () =>
        HttpResponse.json(
          {
            success: false,
            data: null,
            meta: { requestId: 'r1' },
            errors: [{ code: 'VALIDATION_ERROR', message: 'That supplier is no longer active.' }],
          },
          { status: 422 },
        ),
      ),
      ...handlers(),
    )
    renderWithProviders(<SupplierContactsTab supplierId="s1" />, { roles: ['ADMIN'] })

    await user.click(await screen.findByRole('button', { name: /add contact/i }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText(/name/i), 'Nobody')
    await user.type(within(dialog).getByLabelText(/^phone$/i), '+91999')
    await user.click(within(dialog).getByRole('button', { name: /add contact/i }))

    // Asserting the SERVER's words, not the form's own hint - the point is
    // that a refusal reaches the user rather than being swallowed.
    expect(await screen.findByText(/no longer active/i)).toBeInTheDocument()
  })

  it('has no axe violations', async () => {
    server.use(...handlers())
    const { container } = renderWithProviders(<SupplierContactsTab supplierId="s1" />, {
      roles: ['ADMIN'],
    })
    await screen.findByText('Ravi Kumar')

    await expectNoAxeViolations(container)
  })
})
