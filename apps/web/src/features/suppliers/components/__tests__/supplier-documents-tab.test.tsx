import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { expectNoAxeViolations } from '@/test/axe'
import { http, HttpResponse, ok, server } from '@/test/msw'
import { renderWithProviders } from '@/test/render'

import { SupplierDocumentsTab } from '../supplier-documents-tab'

const doc = (over: Record<string, unknown> = {}) => ({
  id: 'd1',
  supplierId: 's1',
  type: 'CATALOG',
  title: 'Spice catalogue 2026',
  storageKey: 'org1/suppliers/s1/uuid/catalogue.pdf',
  mimeType: 'application/pdf',
  fileSize: 204800,
  checksum: 'abc',
  documentNumber: null,
  issuedDate: null,
  expiryDate: null,
  documentId: null,
  version: 1,
  createdAt: '2026-02-01T00:00:00.000Z',
  updatedAt: '2026-02-01T00:00:00.000Z',
  ...over,
})

const handlers = (rows = [doc()]) => [
  http.get('/api/suppliers/s1/documents', () => HttpResponse.json(ok(rows))),
]

describe('SupplierDocumentsTab', () => {
  it('lists what the supplier has sent', async () => {
    server.use(...handlers())
    renderWithProviders(<SupplierDocumentsTab supplierId="s1" />, { roles: ['ADMIN'] })

    expect(await screen.findByText('Spice catalogue 2026')).toBeInTheDocument()
    expect(screen.getByText('Catalogue')).toBeInTheDocument()
    expect(screen.getByText('200 KB')).toBeInTheDocument()
  })

  it('says so plainly when nothing is uploaded', async () => {
    server.use(...handlers([]))
    renderWithProviders(<SupplierDocumentsTab supplierId="s1" />, { roles: ['ADMIN'] })

    expect(await screen.findByText(/no documents yet/i)).toBeInTheDocument()
  })

  it('offers download to every role, and edit controls only to editors', async () => {
    server.use(...handlers())
    renderWithProviders(<SupplierDocumentsTab supplierId="s1" />, { roles: ['READ_ONLY'] })

    await screen.findByText('Spice catalogue 2026')
    expect(screen.getByRole('link', { name: /download/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /upload document/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /replace/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument()
  })

  it('points download and preview at the signed-URL route', async () => {
    server.use(...handlers())
    renderWithProviders(<SupplierDocumentsTab supplierId="s1" />, { roles: ['ADMIN'] })

    await screen.findByText('Spice catalogue 2026')
    expect(screen.getByRole('link', { name: /download/i })).toHaveAttribute(
      'href',
      '/api/suppliers/s1/documents/d1/download',
    )
    expect(screen.getByRole('link', { name: /preview/i })).toHaveAttribute(
      'href',
      '/api/suppliers/s1/documents/d1/download?disposition=inline',
    )
  })

  it('offers no preview for a file that cannot be previewed', async () => {
    server.use(
      ...handlers([
        doc({
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
      ]),
    )
    renderWithProviders(<SupplierDocumentsTab supplierId="s1" />, { roles: ['ADMIN'] })

    await screen.findByText('Spice catalogue 2026')
    expect(screen.queryByRole('link', { name: /preview/i })).not.toBeInTheDocument()
  })

  it('uploads in two steps: presign, put the bytes, then record', async () => {
    const user = userEvent.setup()
    const calls: string[] = []
    let recorded: Record<string, unknown> | null = null

    server.use(
      http.post('/api/suppliers/s1/documents/presign', async () => {
        calls.push('presign')
        return HttpResponse.json(
          ok({
            uploadUrl: 'http://storage.test/put',
            method: 'PUT',
            headers: {},
            storageKey: 'org1/suppliers/s1/uuid/profile.pdf',
            expiresAt: new Date().toISOString(),
          }),
        )
      }),
      http.put('http://storage.test/put', () => {
        calls.push('put')
        return HttpResponse.json({ ok: true })
      }),
      http.post('/api/suppliers/s1/documents', async ({ request }) => {
        calls.push('record')
        recorded = (await request.json()) as Record<string, unknown>
        return HttpResponse.json(ok(doc({ id: 'd2' })), { status: 201 })
      }),
      ...handlers(),
    )
    renderWithProviders(<SupplierDocumentsTab supplierId="s1" />, { roles: ['ADMIN'] })

    await user.click(await screen.findByRole('button', { name: /upload document/i }))
    const dialog = await screen.findByRole('dialog')
    const file = new File(['%PDF-1.4'], 'profile.pdf', { type: 'application/pdf' })
    await user.upload(within(dialog).getByLabelText(/file/i), file)
    await user.click(within(dialog).getByRole('button', { name: /^upload$/i }))

    await waitFor(() => expect(recorded).not.toBeNull())
    // Order matters: a record written before the bytes land would point at
    // nothing.
    expect(calls).toEqual(['presign', 'put', 'record'])
    expect(recorded).toMatchObject({ storageKey: 'org1/suppliers/s1/uuid/profile.pdf' })
    // Size and checksum are storage's to decide, never the browser's.
    expect(recorded).not.toHaveProperty('fileSize')
    expect(recorded).not.toHaveProperty('checksum')
  })

  it('will not upload without a file chosen', async () => {
    const user = userEvent.setup()
    server.use(...handlers())
    renderWithProviders(<SupplierDocumentsTab supplierId="s1" />, { roles: ['ADMIN'] })

    await user.click(await screen.findByRole('button', { name: /upload document/i }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('button', { name: /^upload$/i })).toBeDisabled()
  })

  it('replaces a file, sending the version so a concurrent edit is caught', async () => {
    const user = userEvent.setup()
    let ifMatch: string | null = null
    server.use(
      http.post('/api/suppliers/s1/documents/presign', () =>
        HttpResponse.json(
          ok({
            uploadUrl: 'http://storage.test/put',
            method: 'PUT',
            headers: {},
            storageKey: 'newer-key',
            expiresAt: new Date().toISOString(),
          }),
        ),
      ),
      http.put('http://storage.test/put', () => HttpResponse.json({ ok: true })),
      http.patch('/api/suppliers/s1/documents/d1', ({ request }) => {
        ifMatch = request.headers.get('if-match')
        return HttpResponse.json(ok(doc({ version: 4 })))
      }),
      ...handlers([doc({ version: 3 })]),
    )
    renderWithProviders(<SupplierDocumentsTab supplierId="s1" />, { roles: ['ADMIN'] })

    await screen.findByText('Spice catalogue 2026')
    await user.click(screen.getByRole('button', { name: /replace/i }))
    const input = document.querySelector(
      'input[type="file"][aria-hidden="true"]',
    ) as HTMLInputElement
    await user.upload(input, new File(['x'], 'newer.pdf', { type: 'application/pdf' }))

    await waitFor(() => expect(ifMatch).toBe('W/"v3"'))
  })

  it('confirms before removing, and sends the version', async () => {
    const user = userEvent.setup()
    let ifMatch: string | null = null
    server.use(
      http.delete('/api/suppliers/s1/documents/d1', ({ request }) => {
        ifMatch = request.headers.get('if-match')
        return HttpResponse.json(ok(doc({ version: 2 })))
      }),
      ...handlers(),
    )
    renderWithProviders(<SupplierDocumentsTab supplierId="s1" />, { roles: ['ADMIN'] })

    await user.click(await screen.findByRole('button', { name: /remove spice catalogue/i }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: /^remove$/i }))

    await waitFor(() => expect(ifMatch).toBe('W/"v1"'))
  })

  it('reports a server refusal instead of pretending it worked', async () => {
    const user = userEvent.setup()
    server.use(
      http.post('/api/suppliers/s1/documents/presign', () =>
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
    renderWithProviders(<SupplierDocumentsTab supplierId="s1" />, { roles: ['ADMIN'] })

    await user.click(await screen.findByRole('button', { name: /upload document/i }))
    const dialog = await screen.findByRole('dialog')
    await user.upload(
      within(dialog).getByLabelText(/file/i),
      new File(['x'], 'a.pdf', { type: 'application/pdf' }),
    )
    await user.click(within(dialog).getByRole('button', { name: /^upload$/i }))

    expect(await screen.findByText(/no longer active/i)).toBeInTheDocument()
  })

  it('has no axe violations', async () => {
    server.use(...handlers())
    const { container } = renderWithProviders(<SupplierDocumentsTab supplierId="s1" />, {
      roles: ['ADMIN'],
    })
    await screen.findByText('Spice catalogue 2026')

    await expectNoAxeViolations(container)
  })
})
