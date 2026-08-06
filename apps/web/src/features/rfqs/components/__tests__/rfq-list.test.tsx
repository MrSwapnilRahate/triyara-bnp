import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRouter } from 'next/navigation'
import { describe, expect, it } from 'vitest'

import { expectNoAxeViolations } from '@/test/axe'
import { fail, http, HttpResponse, ok, server } from '@/test/msw'
import { renderWithProviders } from '@/test/render'

import { RfqList } from '../rfq-list'
import { rfqListItem } from './fixtures'

function handlers({
  items = [rfqListItem()],
  status = 200,
  nextCursor = null as string | null,
} = {}) {
  return [
    http.get('/api/rfqs', () =>
      status === 200
        ? HttpResponse.json(ok(items, { nextCursor }))
        : HttpResponse.json(fail([{ code: 'BOOM', message: 'Upstream failed.' }]), { status }),
    ),
  ]
}

describe('RfqList', () => {
  it('renders a row per RFQ with its number and status', async () => {
    server.use(...handlers())
    renderWithProviders(<RfqList />)

    const row = await screen.findByRole('link', { name: /RFQ-2026-000001/ })
    expect(within(row).getByText('Q3 black pepper')).toBeInTheDocument()
    expect(within(row).getByText('Draft')).toBeInTheDocument()
  })

  it('flags an overdue deadline on an RFQ still awaiting bids', async () => {
    server.use(
      ...handlers({
        items: [rfqListItem({ status: 'ISSUED', quotationDeadline: '2020-01-01T00:00:00.000Z' })],
      }),
    )
    renderWithProviders(<RfqList />)

    expect(await screen.findByText('Overdue')).toBeInTheDocument()
  })

  it('does not flag a passed deadline once the RFQ is closed', async () => {
    server.use(
      ...handlers({
        items: [rfqListItem({ status: 'CLOSED', quotationDeadline: '2020-01-01T00:00:00.000Z' })],
      }),
    )
    renderWithProviders(<RfqList />)

    await screen.findByRole('link', { name: /RFQ-2026-000001/ })
    expect(screen.queryByText('Overdue')).not.toBeInTheDocument()
  })

  it('opens an RFQ on Enter, so the table is keyboard navigable', async () => {
    const user = userEvent.setup()
    server.use(...handlers())
    renderWithProviders(<RfqList />)

    const row = await screen.findByRole('link', { name: /RFQ-2026-000001/ })
    row.focus()
    await user.keyboard('{Enter}')

    // next/navigation is mocked once globally (vitest.setup.tsx); a test that
    // asserts navigation reads .push off the shared router.
    expect(useRouter().push).toHaveBeenCalledWith('/rfqs/r1')
  })

  it('shows the first-run empty state, not the filtered one, when nothing exists', async () => {
    server.use(...handlers({ items: [] }))
    renderWithProviders(<RfqList />)

    expect(await screen.findByText('No RFQs yet')).toBeInTheDocument()
    expect(screen.queryByText(/match these filters/)).not.toBeInTheDocument()
  })

  it('distinguishes a failed list from an empty one', async () => {
    server.use(...handlers({ status: 500 }))
    renderWithProviders(<RfqList />)

    // The distinction that matters: a failure must never read as "no RFQs".
    expect(await screen.findByRole('button', { name: /try again/i })).toBeInTheDocument()
    expect(screen.queryByText('No RFQs yet')).not.toBeInTheDocument()
  })

  it('hides New RFQ from a role that cannot create', async () => {
    server.use(...handlers({ items: [] }))
    renderWithProviders(<RfqList />, { roles: ['READ_ONLY'] })

    await screen.findByText('No RFQs yet')
    expect(screen.queryByRole('link', { name: /new rfq/i })).not.toBeInTheDocument()
  })

  it('offers New RFQ to a role that can', async () => {
    server.use(...handlers({ items: [] }))
    renderWithProviders(<RfqList />, { roles: ['EXPORT_MANAGER'] })

    expect(await screen.findAllByRole('link', { name: /new rfq/i })).not.toHaveLength(0)
  })

  it('has no axe violations', async () => {
    server.use(...handlers())
    const { container } = renderWithProviders(<RfqList />)
    await screen.findByRole('link', { name: /RFQ-2026-000001/ })

    await expectNoAxeViolations(container)
  })
})
