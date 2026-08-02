import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { expectNoAxeViolations } from '@/test/axe'
import { fail, http, HttpResponse, ok, server } from '@/test/msw'
import { renderWithProviders } from '@/test/render'

import { SupplierNotes } from '../supplier-notes'

const NOTES_URL = 'http://localhost/api/suppliers/s1/notes'

const note = (over: Record<string, unknown> = {}) => ({
  id: 'n1',
  supplierId: 's1',
  authorId: 'u1',
  body: 'Quoted 20MT turmeric at $1800 CIF Jebel Ali. Wants 30% advance.',
  source: 'WHATSAPP',
  editedAt: null,
  version: 1,
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-08-01T10:00:00.000Z',
  deletedAt: null,
  author: { id: 'u1', name: 'Priya Raman', email: 'priya@triyara.test' },
  ...over,
})

function listReturns(items: unknown[], options: { nextCursor?: string | null } = {}) {
  server.use(
    http.get('/api/suppliers/:id/notes', () =>
      HttpResponse.json(ok(items, { nextCursor: options.nextCursor ?? null })),
    ),
  )
}

describe('SupplierNotes', () => {
  it('renders the timeline with author, channel and timestamp', async () => {
    listReturns([note()])
    renderWithProviders(<SupplierNotes supplierId="s1" />)

    expect(await screen.findByText(/1800 CIF Jebel Ali/)).toBeInTheDocument()

    // Scoped to the row: the channel vocabulary also appears in the composer
    // and filter dropdowns, so an unscoped match would find those too.
    const row = screen.getByRole('listitem')
    expect(within(row).getByText('Priya Raman')).toBeInTheDocument()
    expect(within(row).getByText('WhatsApp')).toBeInTheDocument()
    // The raw enum must never reach the screen.
    expect(within(row).queryByText('WHATSAPP')).not.toBeInTheDocument()
  })

  it('lists notes newest first, in the order the API returned them', async () => {
    listReturns([
      note({ id: 'n2', body: 'Second call', createdAt: '2026-08-02T10:00:00.000Z' }),
      note({ id: 'n1', body: 'First call', createdAt: '2026-08-01T10:00:00.000Z' }),
    ])
    renderWithProviders(<SupplierNotes supplierId="s1" />)

    const items = await screen.findAllByRole('listitem')
    expect(within(items[0]!).getByText('Second call')).toBeInTheDocument()
    expect(within(items[1]!).getByText('First call')).toBeInTheDocument()
  })

  it('marks a revised note as edited', async () => {
    listReturns([note({ editedAt: '2026-08-02T09:00:00.000Z' })])
    renderWithProviders(<SupplierNotes supplierId="s1" />)
    expect(await screen.findByText(/edited/)).toBeInTheDocument()
  })

  it('names a departed author without breaking the timeline', async () => {
    listReturns([note({ author: null })])
    renderWithProviders(<SupplierNotes supplierId="s1" />)

    expect(await screen.findByText(/1800 CIF Jebel Ali/)).toBeInTheDocument()
    expect(screen.getByText('Former team member')).toBeInTheDocument()
  })

  it('preserves the line breaks a pasted chat carries', async () => {
    listReturns([note({ body: 'Line one\nLine two' })])
    renderWithProviders(<SupplierNotes supplierId="s1" />)

    const paragraph = await screen.findByText(/Line one/)
    expect(paragraph).toHaveClass('whitespace-pre-wrap')
  })

  it('invites the first note when the timeline is empty', async () => {
    listReturns([])
    renderWithProviders(<SupplierNotes supplierId="s1" />)
    expect(await screen.findByText('No notes yet')).toBeInTheDocument()
  })

  it('posts a new note with its channel and clears the composer', async () => {
    const posted = vi.fn()
    listReturns([])
    server.use(
      http.post('/api/suppliers/:id/notes', async ({ request }) => {
        posted(await request.json())
        return HttpResponse.json(ok(note()), { status: 201 })
      }),
    )
    renderWithProviders(<SupplierNotes supplierId="s1" />)

    const user = userEvent.setup()
    const box = await screen.findByLabelText(/add a note/i)
    await user.type(box, 'Sample sent by DHL')
    await user.click(screen.getByRole('button', { name: /save note/i }))

    await waitFor(() => expect(posted).toHaveBeenCalled())
    expect(posted.mock.calls[0]![0]).toMatchObject({ body: 'Sample sent by DHL' })
    await waitFor(() => expect(box).toHaveValue(''))
  })

  it('will not post a whitespace-only note', async () => {
    const posted = vi.fn()
    listReturns([])
    server.use(
      http.post('/api/suppliers/:id/notes', () => {
        posted()
        return HttpResponse.json(ok(note()), { status: 201 })
      }),
    )
    renderWithProviders(<SupplierNotes supplierId="s1" />)

    const user = userEvent.setup()
    await user.type(await screen.findByLabelText(/add a note/i), '   ')
    // The control stays disabled, so nothing reaches the API to be rejected.
    expect(screen.getByRole('button', { name: /save note/i })).toBeDisabled()
    expect(posted).not.toHaveBeenCalled()
  })

  it('sends the version as If-Match when a note is edited', async () => {
    const headers = vi.fn()
    listReturns([note({ version: 3 })])
    server.use(
      http.patch('/api/suppliers/:id/notes/:noteId', ({ request }) => {
        headers(request.headers.get('If-Match'))
        return HttpResponse.json(ok(note({ version: 4 })))
      }),
    )
    renderWithProviders(<SupplierNotes supplierId="s1" />)

    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /^edit$/i }))
    const editor = screen.getByLabelText(/edit note/i)
    await user.clear(editor)
    await user.type(editor, 'Revised to $1750')
    await user.click(screen.getByRole('button', { name: /^save$/i }))

    // Without If-Match the API answers 428; a silent overwrite would lose
    // whichever colleague saved second.
    await waitFor(() => expect(headers).toHaveBeenCalledWith('W/"v3"'))
  })

  it('surfaces a concurrent edit instead of discarding it', async () => {
    listReturns([note({ version: 1 })])
    server.use(
      http.patch('/api/suppliers/:id/notes/:noteId', () =>
        HttpResponse.json(
          fail([
            { code: 'PRECONDITION_FAILED', message: 'This note changed since you opened it.' },
          ]),
          { status: 412 },
        ),
      ),
    )
    renderWithProviders(<SupplierNotes supplierId="s1" />)

    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /^edit$/i }))
    await user.type(screen.getByLabelText(/edit note/i), ' extra')
    await user.click(screen.getByRole('button', { name: /^save$/i }))

    // Matched by text, then checked for the live-region role: the toast
    // viewport is also role="alert" and is always mounted but empty.
    const message = await screen.findByText(/changed since you opened it/i)
    expect(message).toHaveAttribute('role', 'alert')

    // The editor stays open holding the edit, rather than closing on failure.
    expect(screen.getByLabelText(/edit note/i)).toBeInTheDocument()
  })

  it('confirms before deleting, and sends the version', async () => {
    const headers = vi.fn()
    listReturns([note({ version: 2 })])
    server.use(
      http.delete('/api/suppliers/:id/notes/:noteId', ({ request }) => {
        headers(request.headers.get('If-Match'))
        return HttpResponse.json(ok({ id: 'n1', deletedAt: '2026-08-02T00:00:00.000Z' }))
      }),
    )
    renderWithProviders(<SupplierNotes supplierId="s1" />)

    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /^delete$/i }))

    // A destructive action never fires straight from the row.
    const dialog = await screen.findByRole('alertdialog')
    expect(headers).not.toHaveBeenCalled()

    await user.click(within(dialog).getByRole('button', { name: /^delete$/i }))
    await waitFor(() => expect(headers).toHaveBeenCalledWith('W/"v2"'))
  })

  it('hides the composer and row actions from a reader', async () => {
    listReturns([note()])
    renderWithProviders(<SupplierNotes supplierId="s1" />, { roles: ['READ_ONLY'] })

    expect(await screen.findByText(/1800 CIF Jebel Ali/)).toBeInTheDocument()
    expect(screen.queryByLabelText(/add a note/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^edit$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^delete$/i })).not.toBeInTheDocument()
  })

  it('reports a failed read with a retry rather than an empty timeline', async () => {
    server.use(
      http.get('/api/suppliers/:id/notes', () =>
        HttpResponse.json(fail([{ code: 'INTERNAL', message: 'Boom' }]), { status: 500 }),
      ),
    )
    renderWithProviders(<SupplierNotes supplierId="s1" />)

    expect(await screen.findByRole('button', { name: /try again/i })).toBeInTheDocument()
    expect(screen.queryByText('No notes yet')).not.toBeInTheDocument()
  })

  it('has no axe violations', async () => {
    listReturns([note()])
    const { container } = renderWithProviders(<SupplierNotes supplierId="s1" />)
    await screen.findByText(/1800 CIF Jebel Ali/)
    await expectNoAxeViolations(container)
  })
})
