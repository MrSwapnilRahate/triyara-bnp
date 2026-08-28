import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { fail, http, HttpResponse, ok, server } from '@/test/msw'
import { renderWithProviders } from '@/test/render'

/**
 * The version a verification claims to have seen.
 *
 * Each request carries `if-match: v<n>`, and a mutation increments the record.
 * The client used to take that number from the page the server rendered, so
 * between a successful action and the refreshed tree arriving it was still
 * offering the old one. Act twice quickly and the second request announced a
 * version the record had already left behind - the server correctly refused it
 * with 412, "Precondition failed (stale version)", for an action that should
 * simply have worked. It was reproducible in the browser and it is reachable by
 * anyone who clicks faster than a round trip.
 *
 * The fix does not wait for anything: every mutation route already answers with
 * the updated record, so the authoritative number is in the response the client
 * already receives. These tests hold that line from both directions - the next
 * action must use the new version without a refresh landing, and a version
 * somebody else moved must still be refused.
 *
 * `router.refresh` is stubbed and never resolves, deliberately. If correctness
 * depended on it settling, every test here would fail.
 */

const nav = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }
vi.mock('next/navigation', () => ({
  useRouter: () => nav,
  usePathname: () => '/verifications/ver-1',
  useSearchParams: () => new URLSearchParams(),
}))

const { VerificationDetail } = await import('@/app/(app)/verifications/[id]/detail-view')

const ID = 'ver-1'
const SUBMIT = `/api/v1/verifications/${ID}/submit`

/**
 * Submit twice, which is the real shape of this bug.
 *
 * The status the buttons are drawn from comes from the server-rendered prop, so
 * until a refresh lands the page still offers the action it just performed -
 * and a second click is exactly what a person does when nothing appears to have
 * happened. The two clicks must announce different versions.
 */
function submitTwice(first: number, second: number) {
  let calls = 0
  return http.post(SUBMIT, ({ request }) => {
    sent.push(request.headers.get('if-match') ?? 'none')
    calls += 1
    return HttpResponse.json(ok(record(calls === 1 ? first : second, 'IN_REVIEW')))
  })
}

/** Only the fields this view reads; the rest of the record is not its business. */
function record(version: number, status = 'DRAFT') {
  return {
    id: ID,
    version,
    status,
    accountId: 'acc-1',
    requiredDocumentTypes: ['GST'],
    reviews: [],
    reviewerId: null,
    expiresAt: null,
    decidedAt: null,
    notes: [],
  }
}

function renderDetail(version: number, status = 'DRAFT') {
  return renderWithProviders(
    <VerificationDetail
      verification={record(version, status) as never}
      accountName="Northwind Trading"
      documents={[]}
      history={[]}
      reviewers={[{ id: 'u-1', name: 'Reviewer One', roleNames: ['VERIFIER'] }] as never}
      canVerify
      canUpdate
      canNote
    />,
  )
}

/** Every `if-match` the component sent, in order. */
let sent: string[] = []

beforeEach(() => {
  sent = []
  nav.refresh.mockReset()
  // Never resolves. Correctness must not depend on it.
  nav.refresh.mockImplementation(() => undefined)
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('the next action uses the version the last one returned', () => {
  it('does not reuse the rendered version after a successful mutation', async () => {
    // The record is at v3. Submitting takes it to v4; the server says so in its
    // response, which is the only place the client can learn it without a refresh.
    server.use(submitTwice(4, 5))

    renderDetail(3)
    const user = userEvent.setup()
    const submit = screen.getByRole('button', { name: /^submit$/i })

    await user.click(submit)
    await waitFor(() => expect(screen.getByText('Submitted for review')).toBeInTheDocument())

    // Immediately, with no refresh having landed - `nav.refresh` did nothing.
    await waitFor(() => expect(submit).not.toBeDisabled())
    await user.click(submit)

    await waitFor(() => expect(sent).toEqual(['v3', 'v4']))
    expect(screen.queryByText(/precondition failed/i)).not.toBeInTheDocument()
    expect(nav.refresh).toHaveBeenCalled()
  })

  it('adopts the new version even though the refresh never settles', async () => {
    server.use(submitTwice(9, 10))

    renderDetail(8)
    const user = userEvent.setup()
    const submit = screen.getByRole('button', { name: /^submit$/i })

    await user.click(submit)
    await waitFor(() => expect(screen.getByText('Submitted for review')).toBeInTheDocument())

    // The control is usable again, and what it now sends is v9, not v8.
    await waitFor(() => expect(submit).not.toBeDisabled())
    await user.click(submit)

    await waitFor(() => expect(sent).toEqual(['v8', 'v9']))
  })
})

describe('a version somebody else moved is still refused', () => {
  it('surfaces a genuine 412 rather than inventing a version', async () => {
    // Nothing was adopted here: the record moved underneath this page, which is
    // exactly what optimistic concurrency exists to catch.
    server.use(
      http.post(SUBMIT, ({ request }) => {
        sent.push(request.headers.get('if-match') ?? 'none')
        return HttpResponse.json(
          fail([{ code: 'PRECONDITION_FAILED', message: 'Precondition failed (stale version)' }]),
          { status: 412 },
        )
      }),
    )

    renderDetail(2)
    await userEvent.setup().click(screen.getByRole('button', { name: /^submit$/i }))

    await waitFor(() =>
      expect(screen.getByText(/precondition failed \(stale version\)/i)).toBeInTheDocument(),
    )
    expect(sent).toEqual(['v2'])
  })

  it('keeps the server as the authority when a refresh brings a newer record', async () => {
    // A refresh arrives carrying somebody else's change: v12 beats the v10 this
    // component adopted, so the next request claims v12 rather than our own.
    server.use(submitTwice(10, 13))

    const { rerender } = renderDetail(9)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /^submit$/i }))
    await waitFor(() => expect(screen.getByText('Submitted for review')).toBeInTheDocument())

    rerender(
      <VerificationDetail
        verification={record(12, 'DRAFT') as never}
        accountName="Northwind Trading"
        documents={[]}
        history={[]}
        reviewers={[{ id: 'u-1', name: 'Reviewer One', roleNames: ['VERIFIER'] }] as never}
        canVerify
        canUpdate
        canNote
      />,
    )

    const submit = screen.getByRole('button', { name: /^submit$/i })
    await waitFor(() => expect(submit).not.toBeDisabled())
    await user.click(submit)

    await waitFor(() => expect(sent).toEqual(['v9', 'v12']))
  })
})
