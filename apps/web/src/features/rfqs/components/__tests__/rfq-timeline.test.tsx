import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { expectNoAxeViolations } from '@/test/axe'
import { fail, http, HttpResponse, ok, server } from '@/test/msw'
import { renderWithProviders } from '@/test/render'

import { RfqTimeline } from '../rfq-timeline'
import { participation, rfq as makeRfq } from './fixtures'

const approval = (over: Record<string, unknown> = {}) => ({
  id: 'a1',
  sequence: 1,
  fromStatus: 'DRAFT',
  toStatus: 'PENDING',
  approverId: 'u1',
  comments: null,
  decidedAt: '2026-01-03T00:00:00.000Z',
  ...over,
})

const revision = (over: Record<string, unknown> = {}) => ({
  id: 'v1',
  revisionNumber: 1,
  reason: 'Line items revised.',
  snapshot: null,
  changedById: 'u1',
  changedAt: '2026-01-04T00:00:00.000Z',
  ...over,
})

function handlers({ approvals = [approval()], revisions = [revision()], status = 200 } = {}) {
  return [
    http.get('/api/rfqs/r1/approvals', () =>
      status === 200
        ? HttpResponse.json(ok(approvals))
        : HttpResponse.json(fail([{ code: 'X', message: 'boom' }]), { status }),
    ),
    http.get('/api/rfqs/r1/revisions', () => HttpResponse.json(ok(revisions))),
  ]
}

describe('RfqTimeline', () => {
  it('merges approvals, revisions and supplier activity, newest first', async () => {
    server.use(...handlers())
    renderWithProviders(
      <RfqTimeline
        rfq={makeRfq({
          suppliers: [
            participation({ invitedAt: '2026-01-02T00:00:00.000Z' }),
            participation({
              id: 'p2',
              supplierId: 's2',
              invitedAt: '2026-01-02T00:00:00.000Z',
              submittedAt: '2026-01-06T00:00:00.000Z',
              status: 'SUBMITTED',
              supplier: {
                id: 's2',
                supplierCode: 'SUP-000002',
                companyName: 'Global Foods',
                status: 'APPROVED',
              },
            }),
          ],
        })}
      />,
    )

    const entries = await screen.findAllByRole('listitem')
    // Newest first: submission (Jan 6) leads, revision (Jan 4) next.
    expect(within(entries[0]!).getByText(/Global Foods submitted a bid/)).toBeInTheDocument()
    expect(within(entries[1]!).getByText(/Revision 1/)).toBeInTheDocument()
  })

  it('marks a late submission', async () => {
    server.use(...handlers())
    renderWithProviders(
      <RfqTimeline
        rfq={makeRfq({
          suppliers: [participation({ submittedAt: '2026-01-06T00:00:00.000Z', isLate: true })],
        })}
      />,
    )

    expect(await screen.findByText('Late')).toBeInTheDocument()
  })

  it('shows an approval comment when one was left', async () => {
    server.use(...handlers({ approvals: [approval({ comments: 'Volumes look right.' })] }))
    renderWithProviders(<RfqTimeline rfq={makeRfq()} />)

    expect(await screen.findByText('Volumes look right.')).toBeInTheDocument()
  })

  it('omits a decision that was never decided', async () => {
    server.use(
      ...handlers({
        approvals: [approval({ decidedAt: null, toStatus: 'CANCELLED' })],
        revisions: [],
      }),
    )
    renderWithProviders(<RfqTimeline rfq={makeRfq({ suppliers: [] })} />)

    // No timestamp means nothing to place on a timeline - it is left out
    // rather than given an invented time.
    expect(await screen.findByText('Nothing has happened yet')).toBeInTheDocument()
  })

  it('says nothing has happened rather than rendering an empty list', async () => {
    server.use(...handlers({ approvals: [], revisions: [] }))
    renderWithProviders(<RfqTimeline rfq={makeRfq({ suppliers: [] })} />)

    expect(await screen.findByText('Nothing has happened yet')).toBeInTheDocument()
  })

  it('surfaces a failure instead of an empty timeline', async () => {
    server.use(...handlers({ status: 500 }))
    renderWithProviders(<RfqTimeline rfq={makeRfq()} />)

    expect(await screen.findByRole('button', { name: /try again/i })).toBeInTheDocument()
    expect(screen.queryByText('Nothing has happened yet')).not.toBeInTheDocument()
  })

  it('has no axe violations', async () => {
    server.use(...handlers())
    const { container } = renderWithProviders(
      <RfqTimeline rfq={makeRfq({ suppliers: [participation()] })} />,
    )
    await screen.findAllByRole('listitem')

    await expectNoAxeViolations(container)
  })
})
