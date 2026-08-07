import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { expectNoAxeViolations } from '@/test/axe'
import { fail, http, HttpResponse, ok, server } from '@/test/msw'
import { renderWithProviders } from '@/test/render'

import { AccessRequestList } from '../components/access-request-list'
import { RequestAccessCard } from '../components/request-access-card'

const mine = (data: unknown) =>
  http.get('/api/v1/admin-access-requests/mine', () => HttpResponse.json(ok(data)))

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
  revokedById: null,
  revokedAt: null,
  revocationReason: null,
  organizationName: 'Triyara Exports LLP',
  decidedByName: null,
  revokedByName: null,
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

  it('is offered to a non-admin who has never asked', async () => {
    server.use(mine(null))
    renderWithProviders(<RequestAccessCard />, { roles: ['EXPORT_MANAGER'] })
    expect(await screen.findByRole('button', { name: /request admin access/i })).toBeInTheDocument()
  })

  it('will not submit a reason too short to judge', async () => {
    const user = userEvent.setup()
    server.use(mine(null))
    renderWithProviders(<RequestAccessCard />, { roles: ['VERIFIER'] })

    await user.type(await screen.findByLabelText(/reason/i), 'please')
    expect(screen.getByRole('button', { name: /request admin access/i })).toBeDisabled()
  })

  it('sends the reason and confirms', async () => {
    const user = userEvent.setup()
    let sent: unknown = null
    server.use(
      mine(null),
      http.post('/api/v1/admin-access-requests', async ({ request: req }) => {
        sent = await req.json()
        return HttpResponse.json(ok(request()), { status: 201 })
      }),
    )
    renderWithProviders(<RequestAccessCard />, { roles: ['VERIFIER'] })

    await user.type(await screen.findByLabelText(/reason/i), REASON)
    await user.click(screen.getByRole('button', { name: /request admin access/i }))

    await waitFor(() => expect(sent).toEqual({ reason: REASON }))
    // The card re-reads /mine and switches to the pending state; the toast is
    // the immediate confirmation.
    expect(await screen.findByText(/request sent/i)).toBeInTheDocument()
  })

  it('surfaces a duplicate rather than claiming success', async () => {
    const user = userEvent.setup()
    server.use(
      mine(null),
      http.post('/api/v1/admin-access-requests', () =>
        HttpResponse.json(
          fail([{ code: 'CONFLICT', message: 'You already have a pending admin access request.' }]),
          { status: 409 },
        ),
      ),
    )
    renderWithProviders(<RequestAccessCard />, { roles: ['VERIFIER'] })

    await user.type(await screen.findByLabelText(/reason/i), REASON)
    await user.click(screen.getByRole('button', { name: /request admin access/i }))

    expect(await screen.findByText(/already have a pending/i)).toBeInTheDocument()
  })

  it('has no accessibility violations', async () => {
    server.use(mine(null))
    const { container } = renderWithProviders(<RequestAccessCard />, { roles: ['VERIFIER'] })
    await screen.findByLabelText(/reason/i)
    await expectNoAxeViolations(container)
  })
})

describe('RequestAccessCard - request states', () => {
  it('shows the pending notice and offers no second request', async () => {
    server.use(mine(request({ status: 'PENDING' })))
    renderWithProviders(<RequestAccessCard />, { roles: ['VERIFIER'] })

    expect(
      await screen.findByText(/your admin access request has been submitted successfully/i),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/currently pending approval from the super administrator/i),
    ).toBeInTheDocument()
    expect(screen.getByText('Pending')).toBeInTheDocument()
    // Creating another while one is pending is refused by the server; the form
    // is not even offered.
    expect(screen.queryByLabelText(/reason/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /request admin access/i })).not.toBeInTheDocument()
  })

  it('shows the revocation banner and offers a fresh request', async () => {
    server.use(mine(request({ status: 'REVOKED', revocationReason: 'Left the sourcing team.' })))
    renderWithProviders(<RequestAccessCard />, { roles: ['VERIFIER'] })

    expect(
      await screen.findByText(/your administrator access has been revoked/i),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/submit a new admin access request or contact your organization/i),
    ).toBeInTheDocument()
    expect(screen.getByText(/left the sourcing team/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /request admin access again/i })).toBeInTheDocument()
  })

  it('shows a rejection and lets them ask again', async () => {
    server.use(mine(request({ status: 'REJECTED', decisionReason: 'Not needed for this role.' })))
    renderWithProviders(<RequestAccessCard />, { roles: ['VERIFIER'] })

    expect(await screen.findByText(/your last request was declined/i)).toBeInTheDocument()
    expect(screen.getByText(/not needed for this role/i)).toBeInTheDocument()
    expect(await screen.findByLabelText(/reason/i)).toBeInTheDocument()
  })

  it('has no accessibility violations with the revocation banner', async () => {
    server.use(mine(request({ status: 'REVOKED', revocationReason: 'Left the team.' })))
    const { container } = renderWithProviders(<RequestAccessCard />, { roles: ['VERIFIER'] })
    await screen.findByText(/your administrator access has been revoked/i)
    await expectNoAxeViolations(container)
  })
})

describe('AccessRequestList', () => {
  const COUNTS = { pending: 1, approved: 2, rejected: 3, revoked: 1, total: 7 }
  const listHandler = (items = [request()]) =>
    http.get('/api/v1/admin-access-requests', () =>
      HttpResponse.json(ok(items, { extra: { counts: COUNTS } })),
    )

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

describe('AccessRequestList - revocation', () => {
  const COUNTS = { pending: 1, approved: 2, rejected: 3, revoked: 1, total: 7 }
  const listHandler = (items: unknown[]) =>
    http.get('/api/v1/admin-access-requests', () =>
      HttpResponse.json(ok(items, { extra: { counts: COUNTS } })),
    )

  it('offers Revoke access on an approved request', async () => {
    server.use(listHandler([request({ status: 'APPROVED', version: 2 })]))
    renderWithProviders(<AccessRequestList />, { roles: ['ADMIN'] })

    expect(await screen.findByRole('button', { name: /revoke access/i })).toBeInTheDocument()
    // Approving again is not on offer.
    expect(screen.queryByRole('button', { name: /^approve$/i })).not.toBeInTheDocument()
  })

  it('offers nothing on an already revoked request', async () => {
    server.use(listHandler([request({ status: 'REVOKED', version: 3 })]))
    renderWithProviders(<AccessRequestList />, { roles: ['ADMIN'] })

    await screen.findByRole('table', { name: /admin access requests/i })
    expect(screen.queryByRole('button', { name: /revoke access/i })).not.toBeInTheDocument()
  })

  it('requires a reason and sends it with the record version', async () => {
    const user = userEvent.setup()
    let sent: unknown = null
    let ifMatch: string | null = null
    server.use(
      listHandler([request({ status: 'APPROVED', version: 2 })]),
      http.post('/api/v1/admin-access-requests/req1/revoke', async ({ request: req }) => {
        sent = await req.json()
        ifMatch = req.headers.get('if-match')
        return HttpResponse.json(ok(request({ status: 'REVOKED', version: 3 })))
      }),
    )
    renderWithProviders(<AccessRequestList />, { roles: ['ADMIN'] })

    await user.click(await screen.findByRole('button', { name: /revoke access/i }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('button', { name: /^revoke access$/i })).toBeDisabled()

    await user.type(within(dialog).getByLabelText(/reason/i), 'Left the sourcing team.')
    await user.click(within(dialog).getByRole('button', { name: /^revoke access$/i }))

    await waitFor(() => expect(sent).toEqual({ reason: 'Left the sourcing team.' }))
    expect(ifMatch).toBe('W/"v2"')
  })

  it('surfaces a refused revocation', async () => {
    const user = userEvent.setup()
    server.use(
      listHandler([request({ status: 'APPROVED', version: 2 })]),
      http.post('/api/v1/admin-access-requests/req1/revoke', () =>
        HttpResponse.json(
          fail([{ code: 'FORBIDDEN', message: 'Only the super administrator may revoke.' }]),
          { status: 403 },
        ),
      ),
    )
    renderWithProviders(<AccessRequestList />, { roles: ['ADMIN'] })

    await user.click(await screen.findByRole('button', { name: /revoke access/i }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText(/reason/i), 'Left the sourcing team.')
    await user.click(within(dialog).getByRole('button', { name: /^revoke access$/i }))

    expect(await screen.findByText(/do not have permission/i)).toBeInTheDocument()
  })

  it('offers a Revoked tab in the history', async () => {
    server.use(listHandler([request()]))
    renderWithProviders(<AccessRequestList />, { roles: ['ADMIN'] })
    expect(await screen.findByRole('tab', { name: /revoked/i })).toBeInTheDocument()
  })
})

describe('AccessRequestList - control panel', () => {
  const COUNTS = { pending: 4, approved: 6, rejected: 2, revoked: 1, total: 13 }
  const listHandler = (items: unknown[] = [request()]) =>
    http.get('/api/v1/admin-access-requests', () =>
      HttpResponse.json(ok(items, { extra: { counts: COUNTS } })),
    )

  it('shows every dashboard metric', async () => {
    server.use(listHandler())
    renderWithProviders(<AccessRequestList />, { roles: ['ADMIN'] })

    for (const label of [
      /pending requests/i,
      /approved admins/i,
      /rejected requests/i,
      /revoked admins/i,
      /total requests/i,
    ]) {
      expect(await screen.findByText(label)).toBeInTheDocument()
    }
    expect(screen.getByText('13')).toBeInTheDocument()
  })

  it('shows the full lifecycle of an approved-then-revoked request', async () => {
    // "Granted, then withdrawn" is a different fact from "never granted".
    server.use(
      listHandler([
        request({
          status: 'REVOKED',
          decidedAt: '2026-08-02T10:00:00.000Z',
          decidedByName: 'Swapnil Rahate',
          revokedAt: '2026-08-09T10:00:00.000Z',
          revokedByName: 'Swapnil Rahate',
          revocationReason: 'Left the sourcing team.',
        }),
      ]),
    )
    renderWithProviders(<AccessRequestList />, { roles: ['ADMIN'] })

    const table = await screen.findByRole('table', { name: /admin access requests/i })
    // Scoped to the lifecycle list: the status badge in the actions column
    // carries the same word.
    const lifecycle = within(table).getByRole('list')
    const stages = within(lifecycle)
      .getAllByRole('listitem')
      .map((li) => li.textContent ?? '')
    expect(stages).toHaveLength(3)
    expect(stages[0]).toMatch(/Requested/)
    expect(stages[1]).toMatch(/Approved/)
    expect(stages[2]).toMatch(/Revoked/)
    expect(stages[2]).toMatch(/left the sourcing team/i)
    expect(within(lifecycle).getAllByText(/swapnil rahate/i).length).toBeGreaterThan(0)
  })

  it('shows a rejected request as requested then rejected, with no approval', async () => {
    server.use(
      listHandler([
        request({
          status: 'REJECTED',
          decidedAt: '2026-08-02T10:00:00.000Z',
          decidedByName: 'Swapnil Rahate',
          decisionReason: 'Not needed for this role.',
        }),
      ]),
    )
    renderWithProviders(<AccessRequestList />, { roles: ['ADMIN'] })

    const table = await screen.findByRole('table', { name: /admin access requests/i })
    const lifecycle = within(table).getByRole('list')
    const stages = within(lifecycle)
      .getAllByRole('listitem')
      .map((li) => li.textContent ?? '')
    // Two stages only: a rejection never passed through approval.
    expect(stages).toHaveLength(2)
    expect(stages[0]).toMatch(/Requested/)
    expect(stages[1]).toMatch(/Rejected/)
    expect(stages.join(' ')).not.toMatch(/Approved/)
    expect(stages[1]).toMatch(/not needed for this role/i)
  })

  it('offers a date range and a CSV export', async () => {
    server.use(listHandler())
    renderWithProviders(<AccessRequestList />, { roles: ['ADMIN'] })

    expect(await screen.findByLabelText(/^from$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^to$/i)).toBeInTheDocument()
    // A plain link, so the browser streams the file and honours the filename.
    const exportLink = screen.getByRole('link', { name: /export csv/i })
    expect(exportLink).toHaveAttribute('href', '/api/v1/admin-access-requests/export')
    expect(exportLink).toHaveAttribute('download')
  })

  it('has no accessibility violations with the full panel rendered', async () => {
    server.use(
      listHandler([
        request({
          status: 'REVOKED',
          decidedByName: 'Swapnil Rahate',
          revokedByName: 'Swapnil Rahate',
          revocationReason: 'Left the team.',
        }),
      ]),
    )
    const { container } = renderWithProviders(<AccessRequestList />, { roles: ['ADMIN'] })
    await screen.findByRole('table', { name: /admin access requests/i })
    await expectNoAxeViolations(container)
  })
})
