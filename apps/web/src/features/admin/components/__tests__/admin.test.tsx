import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { expectNoAxeViolations } from '@/test/axe'
import { fail, http, HttpResponse, ok, server } from '@/test/msw'
import { renderWithProviders } from '@/test/render'

import { AuditLog } from '../audit-log'
import { AdminDashboard } from '../dashboard'
import { NotificationPreferences } from '../notification-preferences'
import { OrganizationSettings } from '../organization-settings'
import { Profile } from '../profile'

const summary = {
  rfqs: { total: 12, draft: 3, pendingApproval: 2, issued: 4, awarded: 1 },
  quotations: { total: 9, draft: 1, pendingApproval: 1, sent: 3, accepted: 2, expired: 2 },
  suppliers: { total: 7, approved: 5, pendingReview: 2 },
  products: { total: 40, active: 36 },
  pendingApprovals: 3,
}

const trends = {
  rfqs: [
    { month: '2026-05-01', count: 4 },
    { month: '2026-06-01', count: 0 },
    { month: '2026-07-01', count: 8 },
  ],
  quotations: [{ month: '2026-07-01', count: 5 }],
  supplierGrowth: [{ month: '2026-07-01', count: 2 }],
  topCountries: [{ country: 'IN', suppliers: 4 }],
  approvalFunnel: {
    rfqs: [
      { stage: 'DRAFT', count: 3 },
      { stage: 'PENDING_APPROVAL', count: 2 },
      { stage: 'APPROVED', count: 0 },
      { stage: 'ISSUED', count: 4 },
      { stage: 'AWARDED', count: 1 },
    ],
    quotations: [{ stage: 'DRAFT', count: 1 }],
  },
  window: { months: 3, from: '2026-05-01' },
}

const organization = {
  id: 'org1',
  name: 'Triyara Exports LLP',
  slug: 'triyara',
  logoUrl: null,
  defaultCurrency: 'USD',
  timezone: 'Asia/Kolkata',
  dateFormat: 'DD/MM/YYYY',
  language: 'en',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const profile = {
  id: 'u1',
  email: 'admin@triyara.test',
  name: 'Triyara Admin',
  avatarUrl: null,
  preferences: { density: 'comfortable' },
  roles: ['ADMIN'],
  organizationId: 'org1',
  lastLoginAt: null,
}

const auditEntry = (over: Record<string, unknown> = {}) => ({
  id: 'a1',
  entityType: 'RFQ',
  entityId: 'rfq-abcdef12',
  actorId: 'user-12345678',
  action: 'rfq.issued',
  before: { status: 'APPROVED' },
  after: { status: 'ISSUED' },
  requestId: 'req-99',
  createdAt: '2026-07-01T09:00:00.000Z',
  ...over,
})

function dashboardHandlers({ summaryStatus = 200, trendsStatus = 200 } = {}) {
  const list = () => HttpResponse.json(ok([], { nextCursor: null }))
  return [
    http.get('/api/v1/dashboard/summary', () =>
      summaryStatus === 200
        ? HttpResponse.json(ok(summary))
        : HttpResponse.json(fail([{ code: 'X', message: 'boom' }]), { status: summaryStatus }),
    ),
    http.get('/api/v1/dashboard/trends', () =>
      trendsStatus === 200
        ? HttpResponse.json(ok(trends))
        : HttpResponse.json(fail([{ code: 'X', message: 'boom' }]), { status: trendsStatus }),
    ),
    http.get('/api/rfqs', list),
    http.get('/api/quotations', list),
  ]
}

describe('AdminDashboard', () => {
  it('renders every KPI from the summary endpoint', async () => {
    server.use(...dashboardHandlers())
    renderWithProviders(<AdminDashboard />)

    const kpis = await screen.findByRole('list', { name: /key figures/i })
    // Wait for the counts themselves; the list renders with skeletons first.
    await within(kpis).findByText('40')
    for (const [label, value] of [
      ['Products', '40'],
      ['Suppliers', '7'],
      ['RFQs', '12'],
      ['Expired', '2'],
    ] as const) {
      const item = within(kpis).getByText(label).closest('a')!
      expect(within(item).getByText(value)).toBeInTheDocument()
    }
  })

  it('computes no analytics in the browser - charts render the server series verbatim', async () => {
    server.use(...dashboardHandlers())
    renderWithProviders(<AdminDashboard />)

    // The accessible data table behind each chart is the assertion surface:
    // it holds exactly the numbers the endpoint returned, including the zero
    // month, which a client-side aggregation would have dropped.
    const table = await screen.findByRole('table', { name: /monthly rfqs/i })
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows.map((r) => within(r).getAllByRole('cell')[0]?.textContent)).toEqual(['4', '0', '8'])
  })

  it('keeps the funnel in lifecycle order rather than sorting by size', async () => {
    server.use(...dashboardHandlers())
    renderWithProviders(<AdminDashboard />)

    const table = await screen.findByRole('table', { name: /rfq approval funnel/i })
    const stages = within(table)
      .getAllByRole('rowheader')
      .map((h) => h.textContent)
    // Approved is empty but must still appear between Pending and Issued.
    expect(stages).toEqual(['Draft', 'Pending approval', 'Approved', 'Issued', 'Awarded'])
  })

  it('keeps the rest of the dashboard when one panel fails', async () => {
    server.use(...dashboardHandlers({ trendsStatus: 500 }))
    renderWithProviders(<AdminDashboard />)

    // KPIs still render; only the chart section reports the failure.
    const kpis = await screen.findByRole('list', { name: /key figures/i })
    await within(kpis).findByText('40')
    expect((await screen.findAllByRole('button', { name: /try again/i })).length).toBeGreaterThan(0)
  })

  it('has no axe violations', async () => {
    server.use(...dashboardHandlers())
    const { container } = renderWithProviders(<AdminDashboard />)
    await screen.findByRole('list', { name: /key figures/i })

    await expectNoAxeViolations(container)
  })
})

describe('AuditLog', () => {
  const handlers = (entries = [auditEntry()]) => [
    http.get('/api/v1/audit', () => HttpResponse.json(ok(entries, { nextCursor: null }))),
  ]

  it('lists entries with their action and entity', async () => {
    server.use(...handlers())
    renderWithProviders(<AuditLog />, { roles: ['ADMIN'] })

    expect(await screen.findByText('rfq.issued')).toBeInTheDocument()
    expect(screen.getByText('RFQ')).toBeInTheDocument()
  })

  it('refuses a non-admin and explains why, rather than showing an empty table', async () => {
    server.use(...handlers())
    renderWithProviders(<AuditLog />, { roles: ['EXPORT_MANAGER'] })

    expect(
      await screen.findByText(/only administrators can read the audit log/i),
    ).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('opens a drawer showing before, after and the request id', async () => {
    const user = userEvent.setup()
    server.use(...handlers())
    renderWithProviders(<AuditLog />, { roles: ['ADMIN'] })

    await user.click(await screen.findByRole('button', { name: /rfq\.issued on RFQ/i }))
    const drawer = await screen.findByRole('dialog')

    expect(within(drawer).getByText('req-99')).toBeInTheDocument()
    // The changed field shows both sides.
    expect(within(drawer).getByText('APPROVED')).toBeInTheDocument()
    expect(within(drawer).getByText('ISSUED')).toBeInTheDocument()
  })

  it('returns focus to the row that opened the drawer', async () => {
    const user = userEvent.setup()
    server.use(...handlers())
    renderWithProviders(<AuditLog />, { roles: ['ADMIN'] })

    const row = await screen.findByRole('button', { name: /rfq\.issued on RFQ/i })
    await user.click(row)
    await screen.findByRole('dialog')

    await user.keyboard('{Escape}')

    // Without this, focus falls to <body> and a keyboard user has to tab back
    // through the whole sidebar to reach the next row.
    await waitFor(() => expect(row).toHaveFocus())
  })

  it('offers no way to edit an entry', async () => {
    const user = userEvent.setup()
    server.use(...handlers())
    renderWithProviders(<AuditLog />, { roles: ['ADMIN'] })

    await user.click(await screen.findByRole('button', { name: /rfq\.issued on RFQ/i }))
    const drawer = await screen.findByRole('dialog')
    // Evidence an operator can edit is not evidence.
    for (const name of [/save/i, /edit/i, /delete/i]) {
      expect(within(drawer).queryByRole('button', { name })).not.toBeInTheDocument()
    }
  })

  it('summarises a creation distinctly from an edit', async () => {
    server.use(...handlers([auditEntry({ before: null })]))
    renderWithProviders(<AuditLog />, { roles: ['ADMIN'] })

    expect(await screen.findByText('Created')).toBeInTheDocument()
  })

  it('has no axe violations', async () => {
    server.use(...handlers())
    const { container } = renderWithProviders(<AuditLog />, { roles: ['ADMIN'] })
    await screen.findByText('rfq.issued')

    await expectNoAxeViolations(container)
  })
})

describe('OrganizationSettings', () => {
  const handlers = (patch?: () => Response) => [
    http.get('/api/v1/organization', () => HttpResponse.json(ok(organization))),
    http.patch('/api/v1/organization', patch ?? (() => HttpResponse.json(ok(organization)))),
  ]

  it('prefills every setting from the API', async () => {
    server.use(...handlers())
    renderWithProviders(<OrganizationSettings />, { roles: ['ADMIN'] })

    expect(await screen.findByDisplayValue('Triyara Exports LLP')).toBeInTheDocument()
    expect(screen.getAllByText('Asia/Kolkata').length).toBeGreaterThan(0)
  })

  it('disables every control for a role that cannot manage the organization', async () => {
    server.use(...handlers())
    renderWithProviders(<OrganizationSettings />, { roles: ['EXPORT_MANAGER'] })

    expect(await screen.findByText(/see these settings but not change them/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/company name/i)).toBeDisabled()
    expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument()
  })

  it('keeps Save disabled until something changes, then sends only the settings', async () => {
    const user = userEvent.setup()
    let bodySent: Record<string, unknown> | undefined
    server.use(
      http.patch('/api/v1/organization', async ({ request }) => {
        bodySent = (await request.json()) as Record<string, unknown>
        return HttpResponse.json(ok({ ...organization, name: 'Renamed' }))
      }),
      ...handlers(),
    )
    renderWithProviders(<OrganizationSettings />, { roles: ['ADMIN'] })

    const save = await screen.findByRole('button', { name: /save changes/i })
    expect(save).toBeDisabled()

    await user.type(screen.getByLabelText(/company name/i), ' Ltd')
    await waitFor(() => expect(save).toBeEnabled())
    await user.click(save)

    await waitFor(() => expect(bodySent).toBeDefined())
    // slug is never submitted: it is the tenant's stable handle.
    expect(bodySent).not.toHaveProperty('slug')
  })

  it('warns that a changed default currency does not restate existing documents', async () => {
    server.use(...handlers())
    renderWithProviders(<OrganizationSettings />, { roles: ['ADMIN'] })

    expect(await screen.findByText(/existing ones keep their own/i)).toBeInTheDocument()
  })

  it('has no axe violations', async () => {
    server.use(...handlers())
    const { container } = renderWithProviders(<OrganizationSettings />, { roles: ['ADMIN'] })
    await screen.findByDisplayValue('Triyara Exports LLP')

    await expectNoAxeViolations(container)
  })
})

describe('Profile', () => {
  const handlers = () => [
    http.get('/api/v1/me', () => HttpResponse.json(ok(profile))),
    http.patch('/api/v1/me', () => HttpResponse.json(ok(profile))),
  ]

  it('shows email and roles as read-only, and says why', async () => {
    server.use(...handlers())
    renderWithProviders(<Profile />)

    expect(await screen.findByText('admin@triyara.test')).toBeInTheDocument()
    expect(screen.getByText('ADMIN')).toBeInTheDocument()
    expect(screen.getByText(/neither can be changed here/i)).toBeInTheDocument()
    // No input exists for either, so nothing can be typed and dropped.
    expect(screen.queryByLabelText(/^email/i)).not.toBeInTheDocument()
  })

  it('sends the password change to its own endpoint', async () => {
    const user = userEvent.setup()
    let passwordBody: Record<string, unknown> | undefined
    server.use(
      http.post('/api/v1/me/password', async ({ request }) => {
        passwordBody = (await request.json()) as Record<string, unknown>
        return HttpResponse.json(ok(null))
      }),
      ...handlers(),
    )
    renderWithProviders(<Profile />)

    await user.type(await screen.findByLabelText(/current password/i), 'OldPassw0rd!')
    await user.type(screen.getByLabelText(/new password/i), 'BrandNewPass1')
    await user.click(screen.getByRole('button', { name: /change password/i }))

    await waitFor(() => expect(passwordBody).toBeDefined())
    expect(passwordBody).toEqual({
      currentPassword: 'OldPassw0rd!',
      newPassword: 'BrandNewPass1',
    })
  })

  it('attributes a 403 to the current password field the user can fix', async () => {
    const user = userEvent.setup()
    server.use(
      http.post('/api/v1/me/password', () =>
        HttpResponse.json(
          fail([{ code: 'FORBIDDEN', message: 'Current password is incorrect.' }]),
          {
            status: 403,
          },
        ),
      ),
      ...handlers(),
    )
    renderWithProviders(<Profile />)

    await user.type(await screen.findByLabelText(/current password/i), 'wrong')
    await user.type(screen.getByLabelText(/new password/i), 'BrandNewPass1')
    await user.click(screen.getByRole('button', { name: /change password/i }))

    expect(await screen.findByText(/not your current password/i)).toBeInTheDocument()
  })

  it('rejects a weak new password before sending it', async () => {
    const user = userEvent.setup()
    const posted = vi.fn()
    server.use(http.post('/api/v1/me/password', posted), ...handlers())
    renderWithProviders(<Profile />)

    await user.type(await screen.findByLabelText(/current password/i), 'whatever')
    await user.type(screen.getByLabelText(/new password/i), 'short')
    await user.click(screen.getByRole('button', { name: /change password/i }))

    expect(await screen.findByText(/at least 12 characters/i)).toBeInTheDocument()
    expect(posted).not.toHaveBeenCalled()
  })

  it('has no axe violations', async () => {
    server.use(...handlers())
    const { container } = renderWithProviders(<Profile />)
    await screen.findByText('admin@triyara.test')

    await expectNoAxeViolations(container)
  })
})

describe('NotificationPreferences', () => {
  const stored = [
    { type: 'ACCOUNT', enabled: true, muted: false, digest: false, channels: ['IN_APP'] },
  ]
  const handlers = () => [
    http.get('/api/v1/notification-preferences', () => HttpResponse.json(ok(stored))),
    http.patch('/api/v1/notification-preferences', () => HttpResponse.json(ok(stored))),
  ]

  it('renders a row for every category the backend emits', async () => {
    server.use(...handlers())
    renderWithProviders(<NotificationPreferences />)

    for (const title of ['Accounts', 'Suppliers', 'Documents', 'Verifications', 'System']) {
      expect(await screen.findByText(title)).toBeInTheDocument()
    }
  })

  it('sends every row on save, because the endpoint replaces the set', async () => {
    const user = userEvent.setup()
    let sent: { preferences: unknown[] } | undefined
    server.use(
      http.patch('/api/v1/notification-preferences', async ({ request }) => {
        sent = (await request.json()) as { preferences: unknown[] }
        return HttpResponse.json(ok(stored))
      }),
      ...handlers(),
    )
    renderWithProviders(<NotificationPreferences />)

    await user.click(await screen.findByLabelText(/email for accounts/i))
    await user.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(sent).toBeDefined())
    // Sending only the changed row would silently clear the others.
    expect(sent!.preferences).toHaveLength(5)
  })

  it('resets to the saved state without a request', async () => {
    const user = userEvent.setup()
    const patched = vi.fn()
    server.use(http.patch('/api/v1/notification-preferences', patched), ...handlers())
    renderWithProviders(<NotificationPreferences />)

    const emailToggle = await screen.findByLabelText(/email for accounts/i)
    await user.click(emailToggle)
    await user.click(screen.getByRole('button', { name: /^reset$/i }))

    expect(emailToggle).not.toBeChecked()
    expect(patched).not.toHaveBeenCalled()
  })

  it('has no axe violations', async () => {
    server.use(...handlers())
    const { container } = renderWithProviders(<NotificationPreferences />)
    await screen.findByText('Accounts')

    await expectNoAxeViolations(container)
  })
})
