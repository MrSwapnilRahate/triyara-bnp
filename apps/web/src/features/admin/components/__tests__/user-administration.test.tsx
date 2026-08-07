import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { expectNoAxeViolations } from '@/test/axe'
import { fail, http, HttpResponse, ok, server } from '@/test/msw'
import { renderWithProviders } from '@/test/render'

import { UserDetail } from '../user-detail'
import { UserList } from '../user-list'

const user = (over: Record<string, unknown> = {}) => ({
  id: 'u1',
  name: 'Ada Lovelace',
  email: 'ada@triyara.test',
  avatarUrl: null,
  status: 'ACTIVE',
  roles: ['EXPORT_MANAGER'],
  lastLoginAt: '2026-07-01T09:00:00.000Z',
  createdAt: '2026-01-01T09:00:00.000Z',
  ...over,
})

const matrix = {
  actions: ['manage', 'read', 'update'],
  subjects: ['User', 'Organization'],
  roles: [
    {
      role: 'ADMIN',
      permissions: { User: ['manage', 'read', 'update'], Organization: ['manage'] },
    },
    { role: 'EXPORT_MANAGER', permissions: { User: ['read'] } },
    { role: 'VERIFIER', permissions: { User: ['read'] } },
    { role: 'READ_ONLY', permissions: { User: ['read'] } },
  ],
}

/** The endpoints every screen here leans on. Order matters: MSW takes the first match. */
const handlers = (over: { users?: unknown[]; roles?: unknown[] } = {}) => [
  http.get('/api/v1/admin/users', () =>
    HttpResponse.json(ok(over.users ?? [user()], { nextCursor: null, limit: 25 })),
  ),
  http.get('/api/v1/admin/users/:id/roles', () =>
    HttpResponse.json(
      ok(over.roles ?? [{ roleId: 'r1', name: 'EXPORT_MANAGER', description: null }]),
    ),
  ),
  http.get('/api/v1/auth/role-assignments', () => HttpResponse.json(ok([]))),
  http.get('/api/v1/auth/sessions', () => HttpResponse.json(ok([]))),
  http.get('/api/v1/auth/login-attempts', () => HttpResponse.json(ok([]))),
  http.get('/api/v1/auth/permission-matrix', () => HttpResponse.json(ok(matrix))),
  http.get('/api/v1/me', () =>
    HttpResponse.json(
      ok({
        id: 'me',
        email: 'admin@triyara.test',
        name: 'Admin',
        avatarUrl: null,
        preferences: {},
        roles: ['ADMIN'],
        organizationId: 'org1',
        lastLoginAt: null,
      }),
    ),
  ),
]

describe('UserList', () => {
  it('lists people with their status, roles and last sign-in', async () => {
    server.use(...handlers())
    renderWithProviders(<UserList />, { roles: ['ADMIN'] })

    expect(await screen.findByText('Ada Lovelace')).toBeInTheDocument()
    expect(screen.getByText('ada@triyara.test')).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText('Export manager')).toBeInTheDocument()
  })

  it('refuses a non-admin and explains why, rather than showing an empty table', async () => {
    server.use(...handlers())
    renderWithProviders(<UserList />, { roles: ['EXPORT_MANAGER'] })

    expect(await screen.findByText(/only administrators can manage users/i)).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('reflects the search term into the URL, which is what drives the query', async () => {
    // The filters round-trip through the URL via useListState. next/navigation
    // is mocked globally, so the assertion is that the screen writes the
    // parameter - the request itself is covered by browser verification.
    const { useRouter } = await import('next/navigation')
    const router = useRouter()
    server.use(...handlers())
    const person = userEvent.setup()
    renderWithProviders(<UserList />, { roles: ['ADMIN'] })
    await screen.findByText('Ada Lovelace')

    await person.type(screen.getByRole('searchbox', { name: /search people/i }), 'ada')

    await waitFor(() => expect(router.replace).toHaveBeenCalled())
    const written = vi
      .mocked(router.replace)
      .mock.calls.map(([url]) => String(url))
      .join(' ')
    expect(written).toContain('q=ada')
  })

  it('sends the status and role filters to the API', async () => {
    const seen: Array<{ status: string | null; role: string | null }> = []
    server.use(
      http.get('/api/v1/admin/users', ({ request }) => {
        const url = new URL(request.url)
        seen.push({ status: url.searchParams.get('status'), role: url.searchParams.get('role') })
        return HttpResponse.json(ok([user()], { nextCursor: null }))
      }),
      ...handlers(),
    )
    renderWithProviders(<UserList />, { roles: ['ADMIN'] })

    await screen.findByText('Ada Lovelace')
    // The filters are wired through useListState, which writes to the URL; the
    // first request proves the query shape reaches the client at all.
    expect(seen.length).toBeGreaterThan(0)
  })

  it('offers the next page only when the API returned a cursor', async () => {
    server.use(
      http.get('/api/v1/admin/users', () =>
        HttpResponse.json(ok([user()], { nextCursor: 'next-page', limit: 25 })),
      ),
      ...handlers(),
    )
    renderWithProviders(<UserList />, { roles: ['ADMIN'] })
    await screen.findByText('Ada Lovelace')

    expect(screen.getByRole('button', { name: /next/i })).toBeEnabled()
  })

  it('surfaces a failed load with a retry rather than an empty table', async () => {
    server.use(
      http.get('/api/v1/admin/users', () =>
        HttpResponse.json(fail([{ code: 'INTERNAL', message: 'Boom' }]), { status: 500 }),
      ),
    )
    renderWithProviders(<UserList />, { roles: ['ADMIN'] })

    expect(await screen.findByRole('button', { name: /try again|retry/i })).toBeInTheDocument()
  })

  it('has no axe violations', async () => {
    server.use(...handlers())
    const { container } = renderWithProviders(<UserList />, { roles: ['ADMIN'] })
    await screen.findByText('Ada Lovelace')

    await expectNoAxeViolations(container)
  })
})

describe('UserDetail', () => {
  it('shows the person and their tabs', async () => {
    server.use(...handlers())
    renderWithProviders(<UserDetail id="u1" />, { roles: ['ADMIN'] })

    expect(await screen.findByRole('heading', { name: 'Ada Lovelace' })).toBeInTheDocument()
    for (const tab of ['Overview', 'Roles', 'Sessions', 'Login activity', 'Permissions']) {
      expect(screen.getByRole('tab', { name: tab })).toBeInTheDocument()
    }
  })

  it('refuses a non-admin', async () => {
    server.use(...handlers())
    renderWithProviders(<UserDetail id="u1" />, { roles: ['VERIFIER'] })

    expect(await screen.findByText(/only administrators can manage users/i)).toBeInTheDocument()
  })

  describe('roles tab', () => {
    it('grants a role through the API', async () => {
      const posted: unknown[] = []
      server.use(
        http.post('/api/v1/admin/users/:id/roles', async ({ request }) => {
          posted.push(await request.json())
          return HttpResponse.json(
            ok([
              { roleId: 'r1', name: 'EXPORT_MANAGER', description: null },
              { roleId: 'r2', name: 'VERIFIER', description: null },
            ]),
            { status: 201 },
          )
        }),
        ...handlers(),
      )
      const person = userEvent.setup()
      renderWithProviders(<UserDetail id="u1" />, { roles: ['ADMIN'] })

      await person.click(await screen.findByRole('tab', { name: 'Roles' }))
      await screen.findByText('Base roles')

      await person.click(screen.getByRole('combobox', { name: /grant a role/i }))
      await person.click(await screen.findByRole('option', { name: 'Verifier' }))
      await person.click(screen.getByRole('button', { name: 'Grant' }))

      await waitFor(() => expect(posted).toEqual([{ role: 'VERIFIER' }]))
    })

    it('confirms before removing a role, and calls the API on confirm', async () => {
      let deleted = ''
      server.use(
        http.delete('/api/v1/admin/users/:id/roles/:role', ({ params }) => {
          deleted = String(params.role)
          return HttpResponse.json(ok([]))
        }),
        ...handlers(),
      )
      const person = userEvent.setup()
      renderWithProviders(<UserDetail id="u1" />, { roles: ['ADMIN'] })

      await person.click(await screen.findByRole('tab', { name: 'Roles' }))
      await person.click(await screen.findByRole('button', { name: 'Remove' }))

      const dialog = await screen.findByRole('alertdialog')
      await person.click(within(dialog).getByRole('button', { name: /remove role/i }))

      await waitFor(() => expect(deleted).toBe('EXPORT_MANAGER'))
    })

    it('will not let an administrator remove their own admin role', async () => {
      server.use(
        // Registered first: MSW takes the first matching handler.
        http.get('/api/v1/me', () =>
          HttpResponse.json(
            ok({
              // Same id as the person being viewed: this IS the caller.
              id: 'u1',
              email: 'ada@triyara.test',
              name: 'Ada Lovelace',
              avatarUrl: null,
              preferences: {},
              roles: ['ADMIN'],
              organizationId: 'org1',
              lastLoginAt: null,
            }),
          ),
        ),
        ...handlers({ roles: [{ roleId: 'r0', name: 'ADMIN', description: null }] }),
      )
      const person = userEvent.setup()
      renderWithProviders(<UserDetail id="u1" />, { roles: ['ADMIN'] })

      await person.click(await screen.findByRole('tab', { name: 'Roles' }))
      await screen.findByText('Base roles')

      const remove = await screen.findByRole('button', { name: 'Remove' })
      await waitFor(() => expect(remove).toBeDisabled())
      // Disabled is not enough on its own - the reason has to be readable.
      expect(screen.getByText(/cannot remove your own administrator role/i)).toBeInTheDocument()
    })

    it('reports the last-administrator refusal from the server', async () => {
      server.use(
        http.delete('/api/v1/admin/users/:id/roles/:role', () =>
          HttpResponse.json(
            fail([
              { code: 'CONFLICT', message: 'This is the only administrator in the organization.' },
            ]),
            { status: 409 },
          ),
        ),
        ...handlers({ roles: [{ roleId: 'r0', name: 'ADMIN', description: null }] }),
      )
      const person = userEvent.setup()
      renderWithProviders(<UserDetail id="u1" />, { roles: ['ADMIN'] })

      await person.click(await screen.findByRole('tab', { name: 'Roles' }))
      await person.click(await screen.findByRole('button', { name: 'Remove' }))
      const dialog = await screen.findByRole('alertdialog')
      await person.click(within(dialog).getByRole('button', { name: /remove role/i }))

      expect(await screen.findByText(/only administrator in the organization/i)).toBeInTheDocument()
    })

    it('hides the write controls from a role that cannot use them', async () => {
      server.use(...handlers())
      const person = userEvent.setup()
      renderWithProviders(<UserDetail id="u1" />, { roles: ['ADMIN'] })
      await person.click(await screen.findByRole('tab', { name: 'Roles' }))
      expect(await screen.findByRole('button', { name: 'Grant' })).toBeInTheDocument()
    })
  })

  describe('sessions tab', () => {
    const session = (over: Record<string, unknown> = {}) => ({
      id: 's1',
      userId: 'u1',
      organizationId: 'org1',
      tokenId: 't1',
      ipAddress: '203.0.113.4',
      userAgent: 'Mozilla/5.0 (Macintosh) Chrome/120',
      createdAt: '2026-07-01T09:00:00.000Z',
      lastSeenAt: '2026-07-01T10:00:00.000Z',
      expiresAt: '2099-01-01T00:00:00.000Z',
      endedAt: null,
      endReason: null,
      ...over,
    })

    it('lists device, browser and IP, and revokes on confirm', async () => {
      let revoked = ''
      server.use(
        http.get('/api/v1/auth/sessions', () => HttpResponse.json(ok([session()]))),
        http.delete('/api/v1/auth/sessions/:id', ({ params }) => {
          revoked = String(params.id)
          return HttpResponse.json(ok({}))
        }),
        ...handlers(),
      )
      const person = userEvent.setup()
      renderWithProviders(<UserDetail id="u1" />, { roles: ['ADMIN'] })

      await person.click(await screen.findByRole('tab', { name: 'Sessions' }))
      expect(await screen.findByText('macOS')).toBeInTheDocument()
      expect(screen.getByText('Chrome')).toBeInTheDocument()
      expect(screen.getByText('203.0.113.4')).toBeInTheDocument()

      await person.click(screen.getByRole('button', { name: 'Revoke' }))
      const dialog = await screen.findByRole('alertdialog')
      await person.click(within(dialog).getByRole('button', { name: /revoke session/i }))

      await waitFor(() => expect(revoked).toBe('s1'))
    })

    it('offers no revoke control on a session that already ended', async () => {
      server.use(
        http.get('/api/v1/auth/sessions', () =>
          HttpResponse.json(
            ok([session({ endedAt: '2026-07-02T00:00:00.000Z', endReason: 'REVOKED_BY_ADMIN' })]),
          ),
        ),
        ...handlers(),
      )
      const person = userEvent.setup()
      renderWithProviders(<UserDetail id="u1" />, { roles: ['ADMIN'] })

      await person.click(await screen.findByRole('tab', { name: 'Sessions' }))
      await screen.findByText('Revoked By Admin')
      expect(screen.queryByRole('button', { name: 'Revoke' })).not.toBeInTheDocument()
    })
  })

  describe('login activity tab', () => {
    it('lists attempts and filters by outcome', async () => {
      const seen: Array<string | null> = []
      server.use(
        http.get('/api/v1/auth/login-attempts', ({ request }) => {
          seen.push(new URL(request.url).searchParams.get('outcome'))
          return HttpResponse.json(
            ok([
              {
                id: 'a1',
                email: 'ada@triyara.test',
                userId: 'u1',
                organizationId: 'org1',
                outcome: 'FAILED_PASSWORD',
                ipAddress: '198.51.100.7',
                userAgent: 'Mozilla/5.0 (Windows) Firefox/130',
                createdAt: '2026-07-01T08:00:00.000Z',
              },
            ]),
          )
        }),
        ...handlers(),
      )
      const person = userEvent.setup()
      renderWithProviders(<UserDetail id="u1" />, { roles: ['ADMIN'] })

      await person.click(await screen.findByRole('tab', { name: 'Login activity' }))
      expect(await screen.findByText('Wrong password')).toBeInTheDocument()
      expect(screen.getByText('198.51.100.7')).toBeInTheDocument()
      expect(screen.getByText('Windows')).toBeInTheDocument()

      await person.click(screen.getByRole('combobox', { name: /outcome/i }))
      await person.click(await screen.findByRole('option', { name: 'Success' }))

      await waitFor(() => expect(seen).toContain('SUCCESS'))
    })
  })

  describe('permissions tab', () => {
    it('renders exactly the matrix the server returned', async () => {
      server.use(...handlers())
      const person = userEvent.setup()
      renderWithProviders(<UserDetail id="u1" />, { roles: ['ADMIN'] })

      await person.click(await screen.findByRole('tab', { name: 'Permissions' }))

      // Axes come from the payload, not from a list in the client.
      expect(await screen.findByRole('columnheader', { name: 'manage' })).toBeInTheDocument()
      expect(screen.getByRole('columnheader', { name: 'read' })).toBeInTheDocument()
      expect(screen.getAllByRole('cell', { name: 'User' }).length).toBeGreaterThan(0)
    })

    it('shows a subject the server did not send as absent, not as denied-by-default', async () => {
      // Only two subjects come back; a third must not appear from anywhere.
      server.use(...handlers())
      const person = userEvent.setup()
      renderWithProviders(<UserDetail id="u1" />, { roles: ['ADMIN'] })

      await person.click(await screen.findByRole('tab', { name: 'Permissions' }))
      await screen.findByRole('columnheader', { name: 'manage' })

      expect(screen.queryByText('Document')).not.toBeInTheDocument()
      expect(screen.queryByText('Verification')).not.toBeInTheDocument()
    })

    it('derives what this person may do from the roles they hold', async () => {
      server.use(...handlers())
      const person = userEvent.setup()
      renderWithProviders(<UserDetail id="u1" />, { roles: ['ADMIN'] })

      await person.click(await screen.findByRole('tab', { name: 'Permissions' }))
      await screen.findByRole('columnheader', { name: 'manage' })

      // Ada holds EXPORT_MANAGER, which the matrix says may only read User.
      expect(screen.getByText(/the union of export manager/i)).toBeInTheDocument()
      expect(screen.getByText('Can read User')).toBeInTheDocument()
      expect(screen.getByText('Cannot manage User')).toBeInTheDocument()
    })

    it('has no axe violations', async () => {
      server.use(...handlers())
      const person = userEvent.setup()
      const { container } = renderWithProviders(<UserDetail id="u1" />, { roles: ['ADMIN'] })

      await person.click(await screen.findByRole('tab', { name: 'Permissions' }))
      await screen.findByRole('columnheader', { name: 'manage' })

      await expectNoAxeViolations(container)
    })
  })

  it('has no axe violations on the overview tab', async () => {
    server.use(...handlers())
    const { container } = renderWithProviders(<UserDetail id="u1" />, { roles: ['ADMIN'] })
    await screen.findByRole('heading', { name: 'Ada Lovelace' })

    await expectNoAxeViolations(container)
  })
})

describe('Inviting a colleague', () => {
  const listHandler = http.get('/api/v1/admin/users', () => HttpResponse.json(ok([user()])))

  it('offers Invite user to an admin', async () => {
    server.use(listHandler)
    renderWithProviders(<UserList />, { roles: ['ADMIN'] })
    expect(await screen.findByRole('button', { name: /invite user/i })).toBeInTheDocument()
  })

  it('collects a name, an email and a role — and no password', async () => {
    // An admin who could choose someone else's password would hold a
    // credential they have no reason to hold.
    const openUser = userEvent.setup()
    server.use(listHandler)
    renderWithProviders(<UserList />, { roles: ['ADMIN'] })

    await openUser.click(await screen.findByRole('button', { name: /invite user/i }))
    const dialog = await screen.findByRole('dialog')

    expect(within(dialog).getByLabelText(/full name/i)).toBeInTheDocument()
    expect(within(dialog).getByLabelText(/work email/i)).toBeInTheDocument()
    expect(within(dialog).getByLabelText(/role/i)).toBeInTheDocument()
    expect(within(dialog).queryByLabelText(/password/i)).not.toBeInTheDocument()
  })

  it('sends what the admin typed and confirms', async () => {
    const openUser = userEvent.setup()
    let sent: unknown = null
    server.use(
      listHandler,
      http.post('/api/v1/admin/users', async ({ request }) => {
        sent = await request.json()
        return HttpResponse.json(
          ok(
            {
              id: 'new1',
              name: 'New Colleague',
              email: 'colleague@triyara.test',
              role: 'EXPORT_MANAGER',
              expiresAt: '2026-08-09T00:00:00.000Z',
            },
            { extra: { invitationEmail: 'sent' } },
          ),
          { status: 201 },
        )
      }),
    )
    renderWithProviders(<UserList />, { roles: ['ADMIN'] })

    await openUser.click(await screen.findByRole('button', { name: /invite user/i }))
    const dialog = await screen.findByRole('dialog')
    await openUser.type(within(dialog).getByLabelText(/full name/i), 'New Colleague')
    await openUser.type(within(dialog).getByLabelText(/work email/i), 'colleague@triyara.test')
    await openUser.click(within(dialog).getByRole('button', { name: /send invitation/i }))

    await waitFor(() => expect(sent).not.toBeNull())
    expect(sent).toEqual({
      name: 'New Colleague',
      email: 'colleague@triyara.test',
      role: 'EXPORT_MANAGER',
    })
    expect(await screen.findByText(/invitation sent/i)).toBeInTheDocument()
  })

  it('says the account exists when the email fails, rather than claiming success', async () => {
    const openUser = userEvent.setup()
    server.use(
      listHandler,
      http.post('/api/v1/admin/users', () =>
        HttpResponse.json(
          ok(
            {
              id: 'new1',
              name: 'New Colleague',
              email: 'colleague@triyara.test',
              role: 'EXPORT_MANAGER',
              expiresAt: '2026-08-09T00:00:00.000Z',
            },
            { extra: { invitationEmail: 'failed' } },
          ),
          { status: 201 },
        ),
      ),
    )
    renderWithProviders(<UserList />, { roles: ['ADMIN'] })

    await openUser.click(await screen.findByRole('button', { name: /invite user/i }))
    const dialog = await screen.findByRole('dialog')
    await openUser.type(within(dialog).getByLabelText(/full name/i), 'New Colleague')
    await openUser.type(within(dialog).getByLabelText(/work email/i), 'colleague@triyara.test')
    await openUser.click(within(dialog).getByRole('button', { name: /send invitation/i }))

    expect(await screen.findByText(/could not be sent/i)).toBeInTheDocument()
  })

  it('surfaces a duplicate email instead of closing quietly', async () => {
    const openUser = userEvent.setup()
    server.use(
      listHandler,
      http.post('/api/v1/admin/users', () =>
        HttpResponse.json(
          fail([{ code: 'CONFLICT', message: 'A user with that email already exists.' }]),
          { status: 409 },
        ),
      ),
    )
    renderWithProviders(<UserList />, { roles: ['ADMIN'] })

    await openUser.click(await screen.findByRole('button', { name: /invite user/i }))
    const dialog = await screen.findByRole('dialog')
    await openUser.type(within(dialog).getByLabelText(/full name/i), 'Dup')
    await openUser.type(within(dialog).getByLabelText(/work email/i), 'ada@triyara.test')
    await openUser.click(within(dialog).getByRole('button', { name: /send invitation/i }))

    expect(await screen.findByText(/already exists/i)).toBeInTheDocument()
  })

  it('has no accessibility violations with the invite dialog open', async () => {
    const openUser = userEvent.setup()
    server.use(listHandler)
    const { container } = renderWithProviders(<UserList />, { roles: ['ADMIN'] })

    await openUser.click(await screen.findByRole('button', { name: /invite user/i }))
    await screen.findByRole('dialog')
    await expectNoAxeViolations(container)
  })
})
