import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { expectNoAxeViolations } from '@/test/axe'
import { fail, http, HttpResponse, ok, server } from '@/test/msw'
import { renderWithProviders } from '@/test/render'

import { RfqResponses } from '../rfq-responses'
import { participation, response, rfq as makeRfq, rfqItem } from './fixtures'

const acme = participation()
const global = participation({
  id: 'p2',
  supplierId: 's2',
  supplier: {
    id: 's2',
    supplierCode: 'SUP-000002',
    companyName: 'Global Foods',
    status: 'APPROVED',
  },
})

const rfqWithBids = makeRfq({ status: 'IN_PROGRESS', suppliers: [acme, global] })

function handlers(items: unknown[], { status = 200 } = {}) {
  return [
    http.get('/api/rfqs/r1/responses', () =>
      status === 200
        ? HttpResponse.json(ok(items))
        : HttpResponse.json(fail([{ code: 'X', message: 'boom' }]), { status }),
    ),
  ]
}

describe('RfqResponses', () => {
  it('groups bids under the line they are for', async () => {
    server.use(
      ...handlers([
        response({ id: 'b1', rfqSupplierId: 'p1', price: '120' }),
        response({ id: 'b2', rfqSupplierId: 'p2', price: '100' }),
      ]),
    )
    renderWithProviders(<RfqResponses rfq={rfqWithBids} />)

    const table = await screen.findByRole('table', { name: /bids for line 1/i })
    expect(within(table).getByText('Acme Spices')).toBeInTheDocument()
    expect(within(table).getByText('Global Foods')).toBeInTheDocument()
  })

  it('marks the lowest bid when every bid shares a currency', async () => {
    server.use(
      ...handlers([
        response({ id: 'b1', rfqSupplierId: 'p1', price: '120', currency: 'USD' }),
        response({ id: 'b2', rfqSupplierId: 'p2', price: '100', currency: 'USD' }),
      ]),
    )
    renderWithProviders(<RfqResponses rfq={rfqWithBids} />)

    const rows = await screen.findAllByRole('row')
    const lowest = rows.find((row) => within(row).queryByText('Lowest'))
    expect(lowest).toBeDefined()
    // The cheaper supplier carries the marker, not merely the first row.
    expect(within(lowest!).getByText('Global Foods')).toBeInTheDocument()
  })

  it('withholds the marker when currencies differ, and says why', async () => {
    server.use(
      ...handlers([
        response({ id: 'b1', rfqSupplierId: 'p1', price: '120', currency: 'USD' }),
        response({ id: 'b2', rfqSupplierId: 'p2', price: '100', currency: 'EUR' }),
      ]),
    )
    renderWithProviders(<RfqResponses rfq={rfqWithBids} />)

    // A "lowest" across currencies would be an artefact of the exchange rate.
    expect(
      await screen.findByText(/different currencies, so they are not ranked/i),
    ).toBeInTheDocument()
    expect(screen.queryByText('Lowest')).not.toBeInTheDocument()
  })

  it('shows the revision number on a re-bid', async () => {
    server.use(...handlers([response({ revisionNumber: 3 })]))
    renderWithProviders(<RfqResponses rfq={rfqWithBids} />)

    expect(await screen.findByText('rev 3')).toBeInTheDocument()
  })

  it('explains that bids arrive after publishing while still a draft', async () => {
    server.use(...handlers([]))
    renderWithProviders(<RfqResponses rfq={makeRfq({ status: 'DRAFT' })} />)

    expect(await screen.findByText(/bids arrive once the rfq is published/i)).toBeInTheDocument()
  })

  it('distinguishes a failed load from no bids', async () => {
    server.use(...handlers([], { status: 500 }))
    renderWithProviders(<RfqResponses rfq={rfqWithBids} />)

    expect(await screen.findByRole('button', { name: /try again/i })).toBeInTheDocument()
    expect(screen.queryByText(/nothing has come back yet/i)).not.toBeInTheDocument()
  })

  it('renders a line with no bids as absent rather than as an empty table', async () => {
    const twoLines = makeRfq({
      status: 'IN_PROGRESS',
      suppliers: [acme],
      items: [rfqItem(), rfqItem({ id: 'i2', lineNumber: 2, customProductName: 'Turmeric' })],
    })
    server.use(...handlers([response({ rfqItemId: 'i1' })]))
    renderWithProviders(<RfqResponses rfq={twoLines} />)

    await screen.findByRole('table', { name: /bids for line 1/i })
    expect(screen.queryByRole('table', { name: /bids for line 2/i })).not.toBeInTheDocument()
  })

  it('has no axe violations', async () => {
    server.use(...handlers([response()]))
    const { container } = renderWithProviders(<RfqResponses rfq={rfqWithBids} />)
    await screen.findByRole('table', { name: /bids for line 1/i })

    await expectNoAxeViolations(container)
  })
})
