import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRouter } from 'next/navigation'
import { describe, expect, it } from 'vitest'

import { expectNoAxeViolations } from '@/test/axe'
import { fail, http, HttpResponse, ok, server } from '@/test/msw'
import { renderWithProviders } from '@/test/render'

import { QuotationList } from '../quotation-list'
import { quotationListItem } from './fixtures'

function handlers({
  items = [quotationListItem()],
  status = 200,
  nextCursor = null as string | null,
} = {}) {
  return [
    http.get('/api/quotations', () =>
      status === 200
        ? HttpResponse.json(ok(items, { nextCursor }))
        : HttpResponse.json(fail([{ code: 'BOOM', message: 'Upstream failed.' }]), { status }),
    ),
  ]
}

describe('QuotationList', () => {
  it('renders a row per quotation with number, status and total', async () => {
    server.use(...handlers())
    renderWithProviders(<QuotationList />)

    const row = await screen.findByRole('link', { name: /QT-2026-000001/ })
    expect(within(row).getByText('Q3 spice programme')).toBeInTheDocument()
    expect(within(row).getByText('Draft')).toBeInTheDocument()
    expect(within(row).getByText('$1,155.00')).toBeInTheDocument()
  })

  it('flags a lapsed quotation that is still open', async () => {
    server.use(
      ...handlers({
        items: [quotationListItem({ status: 'SENT', validUntil: '2020-01-01T00:00:00.000Z' })],
      }),
    )
    renderWithProviders(<QuotationList />)

    expect(await screen.findByText('Lapsed')).toBeInTheDocument()
  })

  it('does not flag a lapsed date once the quotation is accepted', async () => {
    server.use(
      ...handlers({
        items: [quotationListItem({ status: 'ACCEPTED', validUntil: '2020-01-01T00:00:00.000Z' })],
      }),
    )
    renderWithProviders(<QuotationList />)

    await screen.findByRole('link', { name: /QT-2026-000001/ })
    expect(screen.queryByText('Lapsed')).not.toBeInTheDocument()
  })

  it('marks a superseded revision', async () => {
    server.use(
      ...handlers({
        items: [quotationListItem({ revisionNumber: 2, supersededAt: '2026-02-01T00:00:00.000Z' })],
      }),
    )
    renderWithProviders(<QuotationList />)

    expect(await screen.findByText('Superseded')).toBeInTheDocument()
  })

  it('opens a quotation on Enter, so the table is keyboard navigable', async () => {
    const user = userEvent.setup()
    server.use(...handlers())
    renderWithProviders(<QuotationList />)

    const row = await screen.findByRole('link', { name: /QT-2026-000001/ })
    row.focus()
    await user.keyboard('{Enter}')

    expect(useRouter().push).toHaveBeenCalledWith('/quotations/q1')
  })

  it('shows the first-run empty state, not the filtered one, when nothing exists', async () => {
    server.use(...handlers({ items: [] }))
    renderWithProviders(<QuotationList />)

    expect(await screen.findByText('No quotations yet')).toBeInTheDocument()
    expect(screen.queryByText(/match these filters/)).not.toBeInTheDocument()
  })

  it('distinguishes a failed list from an empty one', async () => {
    server.use(...handlers({ status: 500 }))
    renderWithProviders(<QuotationList />)

    expect(await screen.findByRole('button', { name: /try again/i })).toBeInTheDocument()
    expect(screen.queryByText('No quotations yet')).not.toBeInTheDocument()
  })

  it('hides New quotation from a role that cannot create', async () => {
    server.use(...handlers({ items: [] }))
    renderWithProviders(<QuotationList />, { roles: ['READ_ONLY'] })

    await screen.findByText('No quotations yet')
    expect(screen.queryByRole('link', { name: /new quotation/i })).not.toBeInTheDocument()
  })

  it('has no axe violations', async () => {
    server.use(...handlers())
    const { container } = renderWithProviders(<QuotationList />)
    await screen.findByRole('link', { name: /QT-2026-000001/ })

    await expectNoAxeViolations(container)
  })
})
