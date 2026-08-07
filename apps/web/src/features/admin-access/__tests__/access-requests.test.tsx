import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { expectNoAxeViolations } from '@/test/axe'
import { fail, http, HttpResponse, ok, server } from '@/test/msw'
import { renderWithProviders } from '@/test/render'

import { AccessRequestList } from '../components/access-request-list'
import { RequestAccessCard } from '../components/request-access-card'

const request = (over: Record<string, unknown> = {}) => ({
  id: 'req1',
  organizationId: 'org1',
  userId: 'u2',
  requesterName: 'Priya Nair',
  requesterEmail: 'priya@triyara.test',
  currentRole: 'EXPORT_MANAGER',
  reason: 'I action the supplier review queue every day and need approval rights.',
  status: 'PENDING',
  decidedById: null,
  decidedAt: null,
  decisionReason: null,
  version: 1,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  ...over,
})

const REASON = 'I action the supplier review queue every day and need approval rights.'

describe('RequestAccessCard', () => {
  it('is hidden from someone who already holds ADMIN', () => {
    // The server refuses them anyway; offering a button that cannot succeed
    // is not a kindness.
    renderWithProviders(<RequestAccessCard />, { roles: ['ADMIN'] })
    expect(screen.queryByRole('button', { name: /request admin access/i })).not.toBeInTheDocument()
  })

  it('is offered to a non-admin', () => {
    renderWithProviders(<RequestAccessCard />, { roles: ['EXPORT_MANAGER'] })
    expect(screen.getByRole('button', { name: /request admin access/i })).toBeInTheDocument()
  })

  it('will not submit a reason too short to judge', async () => {
    const user = userEvent.setup()
    renderWithProviders(<RequestAccessCard />, { roles: ['VERIFIER'] })

    await user.type(screen.getByLabelText(/reason/i), 'please')
    expect(screen.getByRole('button', { name: /request admin access/i })).toBeDisabled()
  })

  it('sends the reason and confirms', async () => {
    const user = userEvent.setup()
    let sent: unknown = null
    server.use(
      http.post('/api/v1/admin-access-requests', async ({ request: req }) => {
        sent = await req.json()
        return HttpResponse.json(ok(request()), { status: 201 })
      }),
    )
    renderWithProviders(<RequestAccessCard />, { roles: ['VERIFIER'] })

    await user.type(screen.getByLabelText(/reason/i), REASON)
    await user.click(screen.getByRole('button', { name: /request admin access/i }))

    await waitFor(() => expect(sent).toEqual({ reason: REASON }))
    // The toast says the same words; assert on the card heading.
    expect(await screen.findByRole('heading', { name: /request sent/i })).toBeInTheDocument()
  })

  it('surfaces a duplicate rather than claiming success', async () => {
    const user = userEvent.setup()
    server.use(
      http.post('/api/v1/admin-access-requests', () =>
        HttpResponse.json(
          fail([{ code: 'CONFLICT', message: 'You already have a pending admin access request.' }]),
          { status: 409 },
        ),
      ),
    )
    renderWithProviders(<RequestAccessCard />, { roles: ['VERIFIER'] })

    await user.type(screen.getByLabelText(/reason/i), REASON)
    await user.click(screen.getByRole('button', { name: /request admin access/i }))

    expect(await screen.findByText(/already have a pending/i)).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    const { container } = renderWithProviders(<RequestAccessCard />, { roles: ['VERIFIER'] })
    await expectNoAxeViolations(container)
  })
})

describe('AccessRequestList', () => {
  const listHandler = (items = [request()]) =>
    http.get('/api/v1/admin-access-requests', () => HttpResponse.json(ok(items)))

  it('shows pending requests with who asked and why', async () => {
    server.use(listHandler())
    renderWithProviders(<AccessRequestList />, { roles: ['ADMIN'] })

    const table = await screen.findByRole('table', { name: /admin access requests/i })
    expect(within(table).getByText('Priya Nair')).toBeInTheDocument()
    expect(within(table).getByText('priya@triyara.test')).toBeInTheDocument()
    expect(within(table).getByText(/action the supplier review queue/i)).toBeInTheDocument()
  })

  it('explains a refusal rather than showing an empty table', async () => {
    // A non-super administrator gets 403 from the list endpoint. Rendering an
    // empty table would read as "nobody has asked".
    server.use(
      http.get('/api/v1/admin-access-requests', () =>
        HttpResponse.json(
          fail([{ code: 'FORBIDDEN', message: 'Only the super administrator may decide.' }]),
          { status: 403 },
        ),
      ),
    )
    renderWithProviders(<AccessRequestList />, { roles: ['ADMIN'] })
    expect(
      await screen.findByText(/do not have permission|super administrator/i),
    ).toBeInTheDocument()
  })

  it('approves with the record version, for optimistic concurrency', async () => {
    const user = userEvent.setup()
    let ifMatch: string | null = null
    server.use(
      listHandler([request({ version: 3 })]),
      http.post('/api/v1/admin-access-requests/req1/approve', ({ request: req }) => {
        ifMatch = req.headers.get('if-match')
        return HttpResponse.json(ok(request({ status: 'APPROVED', version: 4 })))
      }),
    )
    renderWithProviders(<AccessRequestList />, { roles: ['ADMIN'] })

    await user.click(await screen.findByRole('button', { name: /^approve$/i }))
    await waitFor(() => expect(ifMatch).toBe('W/"v3"'))
    expect(await screen.findByText(/access granted/i)).toBeInTheDocument()
  })

  it('requires a reason before a decline can be sent', async () => {
    const user = userEvent.setup()
    server.use(listHandler())
    renderWithProviders(<AccessRequestList />, { roles: ['ADMIN'] })

    await user.click(await screen.findByRole('button', { name: /decline/i }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('button', { name: /decline request/i })).toBeDisabled()

    await user.type(within(dialog).getByLabelText(/reason/i), 'Not needed for this role.')
    expect(within(dialog).getByRole('button', { name: /decline request/i })).toBeEnabled()
  })

  it('sends the decline reason', async () => {
    const user = userEvent.setup()
    let sent: unknown = null
    server.use(
      listHandler(),
      http.post('/api/v1/admin-access-requests/req1/reject', async ({ request: req }) => {
        sent = await req.json()
        return HttpResponse.json(ok(request({ status: 'REJECTED', version: 2 })))
      }),
    )
    renderWithProviders(<AccessRequestList />, { roles: ['ADMIN'] })

    await user.click(await screen.findByRole('button', { name: /decline/i }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText(/reason/i), 'Not needed for this role.')
    await user.click(within(dialog).getByRole('button', { name: /decline request/i }))

    await waitFor(() => expect(sent).toEqual({ reason: 'Not needed for this role.' }))
  })

  it('offers no decision buttons on a decided request', async () => {
    server.use(
      listHandler([request({ status: 'APPROVED', decidedAt: '2026-08-02T00:00:00.000Z' })]),
    )
    renderWithProviders(<AccessRequestList />, { roles: ['ADMIN'] })

    await screen.findByRole('table', { name: /admin access requests/i })
    expect(screen.queryByRole('button', { name: /^approve$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /decline/i })).not.toBeInTheDocument()
  })

  it('surfaces a rejected approval instead of closing quietly', async () => {
    const user = userEvent.setup()
    server.use(
      listHandler(),
      http.post('/api/v1/admin-access-requests/req1/approve', () =>
        HttpResponse.json(
          fail([{ code: 'CONFLICT', message: 'This request has already been approved.' }]),
          { status: 409 },
        ),
      ),
    )
    renderWithProviders(<AccessRequestList />, { roles: ['ADMIN'] })

    await user.click(await screen.findByRole('button', { name: /^approve$/i }))
    expect(await screen.findByText(/already been approved/i)).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    server.use(listHandler())
    const { container } = renderWithProviders(<AccessRequestList />, { roles: ['ADMIN'] })
    await screen.findByRole('table', { name: /admin access requests/i })
    await expectNoAxeViolations(container)
  })
})
