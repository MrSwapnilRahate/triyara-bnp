import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { expectNoAxeViolations } from '@/test/axe'
import { detail, fail, http, HttpResponse, ok, server } from '@/test/msw'
import { renderWithProviders } from '@/test/render'

import type { Quotation } from '../../types'
import { QuotationDetail } from '../quotation-detail'
import { quotation as makeQuotation, redacted } from './fixtures'

function handlers(q: Quotation, { sendStatus = 200 } = {}) {
  return [
    http.get('/api/quotations/q1', () => detail(q, q.version)),
    http.get('/api/quotations/q1/approvals', () => HttpResponse.json(ok([]))),
    http.get('/api/quotations/q1/revisions', () => HttpResponse.json(ok([]))),
    http.get('/api/quotations/q1/chain', () => HttpResponse.json(ok([q]))),
    http.post('/api/quotations/q1/send', () =>
      sendStatus === 200
        ? HttpResponse.json(ok({ ...q, status: 'SENT', version: q.version + 1 }), {
            headers: { ETag: `W/"v${q.version + 1}"` },
          })
        : HttpResponse.json(
            fail([{ code: 'CONFLICT', message: 'An APPROVED quotation cannot move to SENT.' }]),
            { status: sendStatus },
          ),
    ),
    http.post('/api/quotations/q1/approve', () =>
      HttpResponse.json(ok({ ...q, status: 'APPROVED', version: q.version + 1 })),
    ),
    http.post('/api/quotations/q1/approvals', () =>
      HttpResponse.json(ok({ ...q, status: 'PENDING_APPROVAL', version: q.version + 1 })),
    ),
  ]
}

describe('QuotationDetail', () => {
  it('renders the header with number, revision, status and total', async () => {
    server.use(...handlers(makeQuotation()))
    renderWithProviders(<QuotationDetail id="q1" />)

    expect(await screen.findByText('Q3 spice programme')).toBeInTheDocument()
    expect(screen.getByText(/QT-2026-000001 · rev 1/)).toBeInTheDocument()
    expect(screen.getByText('Draft')).toBeInTheDocument()
  })

  describe('stored totals', () => {
    it('renders every stored figure without computing anything', async () => {
      server.use(...handlers(makeQuotation()))
      renderWithProviders(<QuotationDetail id="q1" />)
      await screen.findByText('Q3 spice programme')

      // Each of these is a value that arrived over the wire. The UI must not
      // derive the total from the parts - the server owns the arithmetic.
      expect(screen.getAllByText('$1,000.00').length).toBeGreaterThan(0)
      expect(screen.getAllByText('$1,155.00').length).toBeGreaterThan(0)
      expect(screen.getByText('$55.00')).toBeInTheDocument()
    })

    it('shows cost and margin to a role that may see them', async () => {
      server.use(...handlers(makeQuotation()))
      renderWithProviders(<QuotationDetail id="q1" />, { roles: ['ADMIN'] })
      await screen.findByText('Q3 spice programme')

      expect(screen.getByText('Cost')).toBeInTheDocument()
      expect(screen.getByText('20.0%')).toBeInTheDocument()
    })

    it('omits cost and margin entirely when the API redacted them', async () => {
      // The API nulls these for a caller without `manage Account`. The UI must
      // not render an empty margin row - that invites the reader to wonder what
      // the number is - and must never reconstruct it from price and total.
      const user = userEvent.setup()
      server.use(...handlers(redacted()))
      renderWithProviders(<QuotationDetail id="q1" />, { roles: ['EXPORT_MANAGER'] })
      await screen.findByText('Q3 spice programme')

      // Overview: the cost and margin rows are absent from the totals card.
      expect(screen.queryByText('Cost')).not.toBeInTheDocument()
      expect(screen.queryByText('Margin')).not.toBeInTheDocument()

      // Items: the absence is stated rather than left as a mystery.
      await user.click(screen.getByRole('tab', { name: /items/i }))
      expect(
        await screen.findByText(/cost and margin are not visible to your role/i),
      ).toBeInTheDocument()
    })

    it('drops the cost columns from the line table when redacted', async () => {
      const user = userEvent.setup()
      server.use(...handlers(redacted()))
      renderWithProviders(<QuotationDetail id="q1" />, { roles: ['EXPORT_MANAGER'] })
      await screen.findByText('Q3 spice programme')
      await user.click(screen.getByRole('tab', { name: /items/i }))

      const table = await screen.findByRole('table', { name: /quotation lines/i })
      expect(within(table).queryByText('Unit cost')).not.toBeInTheDocument()
      expect(within(table).getByText('Unit price')).toBeInTheDocument()
    })
  })

  describe('workflow actions', () => {
    it('offers "Send for approval" and Approve on a DRAFT with lines', async () => {
      server.use(...handlers(makeQuotation()))
      renderWithProviders(<QuotationDetail id="q1" />)

      expect(await screen.findByRole('button', { name: /send for approval/i })).toBeEnabled()
      expect(screen.getByRole('button', { name: /^approve$/i })).toBeEnabled()
    })

    it('blocks approval with no lines, and says why', async () => {
      server.use(...handlers(makeQuotation({ items: [] })))
      renderWithProviders(<QuotationDetail id="q1" />)

      const button = await screen.findByRole('button', { name: /^approve$/i })
      expect(button).toBeDisabled()
      const describedBy = button.getAttribute('aria-describedby')
      expect(document.getElementById(describedBy!)).toHaveTextContent(
        /priced lines before approval/i,
      )
    })

    it('does not offer Send on a DRAFT - the move is not legal from here', async () => {
      server.use(...handlers(makeQuotation({ status: 'DRAFT' })))
      renderWithProviders(<QuotationDetail id="q1" />)
      await screen.findByText('Q3 spice programme')

      expect(screen.queryByRole('button', { name: /^send$/i })).not.toBeInTheDocument()
    })

    it('offers Send from APPROVED', async () => {
      server.use(...handlers(makeQuotation({ status: 'APPROVED' })))
      renderWithProviders(<QuotationDetail id="q1" />)

      expect(await screen.findByRole('button', { name: /^send$/i })).toBeInTheDocument()
    })

    it('offers Accept and Expire from SENT, but not Approve', async () => {
      server.use(...handlers(makeQuotation({ status: 'SENT' })))
      renderWithProviders(<QuotationDetail id="q1" />)

      expect(await screen.findByRole('button', { name: /^accept$/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /^expire$/i })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /^approve$/i })).not.toBeInTheDocument()
    })

    it('offers nothing from ACCEPTED, which is terminal', async () => {
      server.use(...handlers(makeQuotation({ status: 'ACCEPTED' })))
      renderWithProviders(<QuotationDetail id="q1" />)
      await screen.findByText('Q3 spice programme')

      for (const name of [/^send$/i, /^accept$/i, /^expire$/i, /^approve$/i, /^reject$/i]) {
        expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
      }
    })

    it('warns that sending freezes pricing, before it happens', async () => {
      const user = userEvent.setup()
      server.use(...handlers(makeQuotation({ status: 'APPROVED' })))
      renderWithProviders(<QuotationDetail id="q1" />)

      await user.click(await screen.findByRole('button', { name: /^send$/i }))
      const dialog = await screen.findByRole('alertdialog')
      expect(within(dialog).getByText(/pricing freezes/i)).toBeInTheDocument()
    })

    it('keeps the dialog open and shows the reason when send is refused', async () => {
      const user = userEvent.setup()
      server.use(...handlers(makeQuotation({ status: 'APPROVED' }), { sendStatus: 409 }))
      renderWithProviders(<QuotationDetail id="q1" />)

      await user.click(await screen.findByRole('button', { name: /^send$/i }))
      const dialog = await screen.findByRole('alertdialog')
      await user.click(within(dialog).getByRole('button', { name: /^send$/i }))

      await waitFor(() =>
        expect(within(dialog).getByText(/cannot move to SENT/i)).toBeInTheDocument(),
      )
      expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    })
  })

  describe('authorization', () => {
    it('hides Withdraw from EXPORT_MANAGER, which lacks delete Account', async () => {
      server.use(...handlers(makeQuotation()))
      renderWithProviders(<QuotationDetail id="q1" />, { roles: ['EXPORT_MANAGER'] })
      await screen.findByText('Q3 spice programme')

      expect(screen.queryByRole('button', { name: /withdraw/i })).not.toBeInTheDocument()
    })

    it('offers Withdraw to ADMIN, and warns that it hides the record', async () => {
      const user = userEvent.setup()
      server.use(...handlers(makeQuotation()))
      renderWithProviders(<QuotationDetail id="q1" />, { roles: ['ADMIN'] })

      await user.click(await screen.findByRole('button', { name: /withdraw/i }))
      const dialog = await screen.findByRole('alertdialog')
      // The soft-delete coupling surprises people, so it is stated.
      expect(within(dialog).getByText(/removes it from the quotation list/i)).toBeInTheDocument()
    })

    it('hides Edit from a read-only role', async () => {
      server.use(...handlers(makeQuotation()))
      renderWithProviders(<QuotationDetail id="q1" />, { roles: ['READ_ONLY'] })
      await screen.findByText('Q3 spice programme')

      expect(screen.queryByRole('link', { name: /^edit$/i })).not.toBeInTheDocument()
    })
  })

  describe('frozen state', () => {
    it('explains the commitment and offers Revise once SENT', async () => {
      server.use(...handlers(makeQuotation({ status: 'SENT' })))
      renderWithProviders(<QuotationDetail id="q1" />)

      expect(await screen.findByText(/this quotation is a commitment/i)).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /revise/i })).toBeInTheDocument()
      expect(screen.queryByRole('link', { name: /^edit$/i })).not.toBeInTheDocument()
    })

    it('does not offer Revise on an already-superseded quotation', async () => {
      server.use(
        ...handlers(makeQuotation({ status: 'SENT', supersededAt: '2026-02-01T00:00:00.000Z' })),
      )
      renderWithProviders(<QuotationDetail id="q1" />)
      await screen.findByText('Q3 spice programme')

      expect(screen.queryByRole('link', { name: /revise/i })).not.toBeInTheDocument()
    })

    it('flags a lapsed validity date on a still-open quotation', async () => {
      server.use(
        ...handlers(makeQuotation({ status: 'SENT', validUntil: '2020-01-01T00:00:00.000Z' })),
      )
      renderWithProviders(<QuotationDetail id="q1" />)

      expect(await screen.findByText(/past its validity date/i)).toBeInTheDocument()
    })
  })

  it('surfaces a load failure rather than an empty screen', async () => {
    server.use(
      http.get('/api/quotations/q1', () =>
        HttpResponse.json(fail([{ code: 'NOT_FOUND', message: 'Quotation not found.' }]), {
          status: 404,
        }),
      ),
    )
    renderWithProviders(<QuotationDetail id="q1" />)

    expect(await screen.findByRole('button', { name: /try again/i })).toBeInTheDocument()
  })

  it('has no axe violations', async () => {
    server.use(...handlers(makeQuotation()))
    const { container } = renderWithProviders(<QuotationDetail id="q1" />)
    await screen.findByText('Q3 spice programme')

    await expectNoAxeViolations(container)
  })
})
