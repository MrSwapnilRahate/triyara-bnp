import { screen, waitFor } from '@testing-library/react'
import type { AppAbility } from '@triyara/auth'
import { buildAbilityFor, type Role } from '@triyara/auth'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type * as AbilityContext from '@/lib/ability-context'
import { fail, http, HttpResponse, ok, server } from '@/test/msw'
import { renderWithProviders } from '@/test/render'

/**
 * Which subject the audit screen asks about.
 *
 * The backend moved to `manage AuditLog`; this screen was still asking for
 * `manage Organization`. Every configured role answers the same for both, so no
 * role could see the difference - the drift was invisible to a role-based test,
 * which is why it survived until it was read rather than run.
 *
 * The screen is presentational, not a boundary: `useAuditLog` is a hook and so
 * runs before the `canRead` branch can return, meaning the request goes out for
 * every role and the API refuses it. That is asserted below, because it is the
 * reason this file is about consistency rather than about a hole.
 */

/** Set per test; the mock below hands it to the component. */
let injected: Pick<AppAbility, 'can'> | null = null

vi.mock('@/lib/ability-context', async (importOriginal) => {
  const actual = await importOriginal<typeof AbilityContext>()
  return { ...actual, useAbility: () => injected }
})

const { AuditLog } = await import('../audit-log')

const auditEntry = {
  id: 'a1',
  entityType: 'RFQ',
  entityId: 'rfq-abcdef12',
  actorId: 'user-12345678',
  action: 'rfq.issued',
  before: { status: 'APPROVED' },
  after: { status: 'ISSUED' },
  requestId: 'req-99',
  createdAt: '2026-07-01T09:00:00.000Z',
}

/** Counts requests so "did the screen even ask?" is an assertion, not a claim. */
function auditHandler() {
  const calls: string[] = []
  server.use(
    http.get('/api/v1/audit', ({ request }) => {
      calls.push(request.url)
      return HttpResponse.json(ok([auditEntry], { nextCursor: null }))
    }),
  )
  return calls
}

const DENIED = /only administrators can read the audit log/i

beforeEach(() => {
  injected = null
})

describe('the audit screen decides on AuditLog', () => {
  /** An actor holding exactly the subjects named, and nothing else. */
  const holding = (...subjects: string[]): Pick<AppAbility, 'can'> => ({
    can: ((_action: string, subject: string) => subjects.includes(subject)) as AppAbility['can'],
  })

  it('shows the trail to an actor who may manage AuditLog but not Organization', async () => {
    // The migration made observable: this actor could not have passed the old
    // check, and no configured role has this shape today.
    injected = holding('AuditLog')
    auditHandler()
    renderWithProviders(<AuditLog />)

    expect(await screen.findByText('rfq.issued')).toBeInTheDocument()
    expect(screen.queryByText(DENIED)).not.toBeInTheDocument()
  })

  it('refuses an actor who may manage Organization but not AuditLog', async () => {
    // The other direction, and the one that fails if the subject is reverted:
    // administering the tenant is no longer a way into the trail.
    injected = holding('Organization')
    auditHandler()
    renderWithProviders(<AuditLog />)

    expect(await screen.findByText(DENIED)).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('refuses an actor holding neither', async () => {
    injected = holding()
    auditHandler()
    renderWithProviders(<AuditLog />)

    expect(await screen.findByText(DENIED)).toBeInTheDocument()
  })
})

describe('every configured role keeps the access it had', () => {
  const roleAbility = (role: Role) => buildAbilityFor([role])

  it('shows the trail to ADMIN', async () => {
    injected = roleAbility('ADMIN')
    auditHandler()
    renderWithProviders(<AuditLog />)

    expect(await screen.findByText('rfq.issued')).toBeInTheDocument()
  })

  it('shows the trail to a super admin, who reads it by holding ADMIN', async () => {
    // SUPER_ADMIN is an email allowlist, not a role and not an ability rule, so
    // on the client it is simply an ADMIN. There is no separate branch here and
    // this change adds none.
    injected = roleAbility('ADMIN')
    auditHandler()
    renderWithProviders(<AuditLog />)

    expect(await screen.findByText('rfq.issued')).toBeInTheDocument()
  })

  it.each(['EXPORTER', 'VERIFIER', 'READ_ONLY'] as Role[])('refuses %s', async (role) => {
    injected = roleAbility(role)
    auditHandler()
    renderWithProviders(<AuditLog />)

    expect(await screen.findByText(DENIED)).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it.each(['EXPORTER', 'VERIFIER', 'READ_ONLY'] as Role[])(
    'holds %s at manage, not at read - `read all` must not open the trail',
    (role) => {
      // Why the screen asks at `manage`. Every role holds `read all`, so a
      // `read AuditLog` check here would show the trail to all three.
      const a = buildAbilityFor([role])
      expect(a.can('read', 'AuditLog'), `${role} read`).toBe(true)
      expect(a.can('manage', 'AuditLog'), `${role} manage`).toBe(false)
    },
  )
})

describe('the screen is presentational, and the API is the boundary', () => {
  it('requests the trail even for a role it will refuse', async () => {
    // `useAuditLog` is a hook, so it cannot sit behind the `canRead` branch.
    // The request goes out and the API answers 403 - which is why this file is
    // about naming consistency and not about a way around the backend.
    injected = buildAbilityFor(['READ_ONLY'])
    const calls = auditHandler()
    renderWithProviders(<AuditLog />)

    expect(await screen.findByText(DENIED)).toBeInTheDocument()
    expect(calls.length).toBeGreaterThan(0)
  })

  it('renders no audit data when the API refuses, whatever the ability says', async () => {
    // The belt-and-braces case: even an ability that permits the screen shows
    // nothing once the server has said no.
    injected = buildAbilityFor(['ADMIN'])
    const calls: string[] = []
    server.use(
      http.get('/api/v1/audit', ({ request }) => {
        calls.push(request.url)
        return HttpResponse.json(fail([{ code: 'FORBIDDEN', message: 'Not permitted.' }]), {
          status: 403,
        })
      }),
    )
    renderWithProviders(<AuditLog />)

    await waitFor(() => expect(calls.length).toBeGreaterThan(0))
    await waitFor(() => expect(screen.queryByText('rfq.issued')).not.toBeInTheDocument())
  })
})
