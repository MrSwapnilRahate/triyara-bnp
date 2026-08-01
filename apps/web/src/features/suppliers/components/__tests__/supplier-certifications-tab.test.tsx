import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { expectNoAxeViolations } from '@/test/axe'
import { http, HttpResponse, ok, server } from '@/test/msw'
import { renderWithProviders } from '@/test/render'

import { SupplierCertificationsTab } from '../supplier-certifications-tab'

const DAY = 86_400_000
const inDays = (n: number) => new Date(Date.now() + n * DAY).toISOString()

const cert = (over: Record<string, unknown> = {}) => ({
  id: 'k1',
  supplierId: 's1',
  type: 'FSSAI',
  certificateNumber: 'FS-123456',
  issuedBy: 'FSSAI',
  issuedDate: '2026-01-01T00:00:00.000Z',
  expiryDate: inDays(365),
  status: 'ACTIVE',
  scope: null,
  supplierDocumentId: null,
  version: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
})

const handlers = (rows = [cert()]) => [
  http.get('/api/suppliers/s1/certifications', () => HttpResponse.json(ok(rows))),
]

describe('SupplierCertificationsTab', () => {
  it('lists what the supplier holds', async () => {
    server.use(...handlers())
    renderWithProviders(<SupplierCertificationsTab supplierId="s1" />, { roles: ['ADMIN'] })

    expect(await screen.findByText('FSSAI')).toBeInTheDocument()
    expect(screen.getByText('FS-123456')).toBeInTheDocument()
    expect(screen.getByText('ACTIVE')).toBeInTheDocument()
  })

  it('says so plainly when nothing is recorded', async () => {
    server.use(...handlers([]))
    renderWithProviders(<SupplierCertificationsTab supplierId="s1" />, { roles: ['ADMIN'] })

    expect(await screen.findByText(/no certifications recorded/i)).toBeInTheDocument()
  })

  it('calls out an expired certificate', async () => {
    server.use(...handlers([cert({ expiryDate: inDays(-5) })]))
    renderWithProviders(<SupplierCertificationsTab supplierId="s1" />, { roles: ['ADMIN'] })

    expect(await screen.findByText('Expired')).toBeInTheDocument()
  })

  it('warns when expiry is inside thirty days', async () => {
    server.use(...handlers([cert({ expiryDate: inDays(10) })]))
    renderWithProviders(<SupplierCertificationsTab supplierId="s1" />, { roles: ['ADMIN'] })

    expect(await screen.findByText(/expires in \d+ days/i)).toBeInTheDocument()
  })

  it('states plainly when no expiry is recorded, rather than implying validity', async () => {
    server.use(...handlers([cert({ expiryDate: null })]))
    renderWithProviders(<SupplierCertificationsTab supplierId="s1" />, { roles: ['ADMIN'] })

    expect(await screen.findByText(/no expiry recorded/i)).toBeInTheDocument()
  })

  it('offers no controls to a role that cannot edit', async () => {
    server.use(...handlers())
    renderWithProviders(<SupplierCertificationsTab supplierId="s1" />, { roles: ['READ_ONLY'] })

    await screen.findByText('FSSAI')
    expect(screen.queryByRole('button', { name: /add certification/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument()
  })

  it('lets an editor record a certificate', async () => {
    const user = userEvent.setup()
    let posted: Record<string, unknown> | null = null
    server.use(
      http.post('/api/suppliers/s1/certifications', async ({ request }) => {
        posted = (await request.json()) as Record<string, unknown>
        return HttpResponse.json(ok(cert({ id: 'k2' })), { status: 201 })
      }),
      ...handlers(),
    )
    renderWithProviders(<SupplierCertificationsTab supplierId="s1" />, { roles: ['ADMIN'] })

    await user.click(await screen.findByRole('button', { name: /add certification/i }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText(/certificate number/i), 'H-998877')
    await user.click(within(dialog).getByRole('button', { name: /add certification/i }))

    await waitFor(() => expect(posted).not.toBeNull())
    expect(posted).toMatchObject({ certificateNumber: 'H-998877' })
  })

  it('sends the version when editing, so a concurrent edit is caught', async () => {
    const user = userEvent.setup()
    let ifMatch: string | null = null
    server.use(
      http.patch('/api/suppliers/s1/certifications/k1', ({ request }) => {
        ifMatch = request.headers.get('if-match')
        return HttpResponse.json(ok(cert({ version: 4 })))
      }),
      ...handlers([cert({ version: 3 })]),
    )
    renderWithProviders(<SupplierCertificationsTab supplierId="s1" />, { roles: ['ADMIN'] })

    await user.click(await screen.findByRole('button', { name: /^edit$/i }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /save changes/i }))

    await waitFor(() => expect(ifMatch).toBe('W/"v3"'))
  })

  it('confirms before removing, and sends the version', async () => {
    const user = userEvent.setup()
    let ifMatch: string | null = null
    server.use(
      http.delete('/api/suppliers/s1/certifications/k1', ({ request }) => {
        ifMatch = request.headers.get('if-match')
        return HttpResponse.json(ok(cert({ version: 2 })))
      }),
      ...handlers(),
    )
    renderWithProviders(<SupplierCertificationsTab supplierId="s1" />, { roles: ['ADMIN'] })

    await user.click(await screen.findByRole('button', { name: /remove fssai fs-123456/i }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: /^remove$/i }))

    await waitFor(() => expect(ifMatch).toBe('W/"v1"'))
  })

  it('reports a server refusal instead of pretending it worked', async () => {
    const user = userEvent.setup()
    server.use(
      http.post('/api/suppliers/s1/certifications', () =>
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
    renderWithProviders(<SupplierCertificationsTab supplierId="s1" />, { roles: ['ADMIN'] })

    await user.click(await screen.findByRole('button', { name: /add certification/i }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText(/certificate number/i), 'X-1')
    await user.click(within(dialog).getByRole('button', { name: /add certification/i }))

    expect(await screen.findByText(/no longer active/i)).toBeInTheDocument()
  })

  it('has no axe violations', async () => {
    server.use(...handlers())
    const { container } = renderWithProviders(<SupplierCertificationsTab supplierId="s1" />, {
      roles: ['ADMIN'],
    })
    await screen.findByText('FSSAI')

    await expectNoAxeViolations(container)
  })
})
