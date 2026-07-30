import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { expectNoAxeViolations } from '@/test/axe'
import { detail, fail, http, HttpResponse, ok, server } from '@/test/msw'
import { renderWithProviders } from '@/test/render'

import type { Rfq } from '../../types'
import { RfqDetail } from '../rfq-detail'
import { participation, rfq as makeRfq } from './fixtures'

function handlers(rfq: Rfq, { publishStatus = 200 } = {}) {
  return [
    http.get('/api/rfqs/r1', () => detail(rfq, rfq.version)),
    http.get('/api/rfqs/r1/suppliers', () => HttpResponse.json(ok(rfq.suppliers))),
    http.get('/api/rfqs/r1/approvals', () => HttpResponse.json(ok([]))),
    http.get('/api/rfqs/r1/revisions', () => HttpResponse.json(ok([]))),
    http.get('/api/rfqs/r1/responses', () => HttpResponse.json(ok([]))),
    http.post('/api/rfqs/r1/publish', () =>
      publishStatus === 200
        ? HttpResponse.json(ok({ ...rfq, status: 'ISSUED', version: rfq.version + 1 }), {
            headers: { ETag: `W/"v${rfq.version + 1}"` },
          })
        : HttpResponse.json(
            fail([{ code: 'CONFLICT', message: 'Invite at least one supplier before issuing.' }]),
            { status: publishStatus },
          ),
    ),
  ]
}

describe('RfqDetail', () => {
  it('renders the header with number, status and terms', async () => {
    server.use(...handlers(makeRfq()))
    renderWithProviders(<RfqDetail id="r1" />)

    expect(await screen.findByText('Q3 black pepper')).toBeInTheDocument()
    expect(screen.getByText('RFQ-2026-000001')).toBeInTheDocument()
    expect(screen.getByText('Draft')).toBeInTheDocument()
  })

  describe('workflow actions', () => {
    it('offers "Send for approval" on a DRAFT with lines', async () => {
      server.use(...handlers(makeRfq()))
      renderWithProviders(<RfqDetail id="r1" />)

      expect(await screen.findByRole('button', { name: /send for approval/i })).toBeEnabled()
    })

    it('blocks "Send for approval" when the RFQ has no lines, and says why', async () => {
      server.use(...handlers(makeRfq({ items: [] })))
      renderWithProviders(<RfqDetail id="r1" />)

      const button = await screen.findByRole('button', { name: /send for approval/i })
      expect(button).toBeDisabled()
      // The reason must be readable, and tied to the control for assistive tech.
      const describedBy = button.getAttribute('aria-describedby')
      expect(describedBy).toBeTruthy()
      expect(document.getElementById(describedBy!)).toHaveTextContent(/add at least one line/i)
    })

    it('blocks Publish on an APPROVED RFQ with no suppliers, and says why', async () => {
      server.use(...handlers(makeRfq({ status: 'APPROVED' })))
      renderWithProviders(<RfqDetail id="r1" />)

      const button = await screen.findByRole('button', { name: /^publish$/i })
      expect(button).toBeDisabled()
      const describedBy = button.getAttribute('aria-describedby')
      expect(document.getElementById(describedBy!)).toHaveTextContent(
        /invite at least one supplier/i,
      )
    })

    it('enables Publish once a supplier is invited', async () => {
      server.use(...handlers(makeRfq({ status: 'APPROVED', suppliers: [participation()] })))
      renderWithProviders(<RfqDetail id="r1" />)

      expect(await screen.findByRole('button', { name: /^publish$/i })).toBeEnabled()
    })

    it('confirms before publishing, naming how many suppliers it goes to', async () => {
      const user = userEvent.setup()
      server.use(...handlers(makeRfq({ status: 'APPROVED', suppliers: [participation()] })))
      renderWithProviders(<RfqDetail id="r1" />)

      await user.click(await screen.findByRole('button', { name: /^publish$/i }))

      const dialog = await screen.findByRole('alertdialog')
      expect(within(dialog).getByText(/1 invited supplier\b/)).toBeInTheDocument()
    })

    it('keeps the dialog open and shows the reason when publish is refused', async () => {
      const user = userEvent.setup()
      server.use(
        ...handlers(makeRfq({ status: 'APPROVED', suppliers: [participation()] }), {
          publishStatus: 409,
        }),
      )
      renderWithProviders(<RfqDetail id="r1" />)

      await user.click(await screen.findByRole('button', { name: /^publish$/i }))
      const dialog = await screen.findByRole('alertdialog')
      await user.click(within(dialog).getByRole('button', { name: /^publish$/i }))

      await waitFor(() =>
        expect(
          within(dialog).getByText(/invite at least one supplier before issuing/i),
        ).toBeInTheDocument(),
      )
      expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    })

    it('does not offer Publish on a DRAFT - the move is not legal from here', async () => {
      server.use(...handlers(makeRfq({ status: 'DRAFT' })))
      renderWithProviders(<RfqDetail id="r1" />)

      await screen.findByText('Q3 black pepper')
      expect(screen.queryByRole('button', { name: /^publish$/i })).not.toBeInTheDocument()
    })

    it('offers Close from EVALUATING but not from DRAFT', async () => {
      server.use(...handlers(makeRfq({ status: 'EVALUATING' })))
      const { unmount } = renderWithProviders(<RfqDetail id="r1" />)
      expect(await screen.findByRole('button', { name: /^close$/i })).toBeInTheDocument()
      unmount()

      server.use(...handlers(makeRfq({ status: 'DRAFT' })))
      renderWithProviders(<RfqDetail id="r1" />)
      await screen.findByText('Q3 black pepper')
      expect(screen.queryByRole('button', { name: /^close$/i })).not.toBeInTheDocument()
    })
  })

  describe('authorization', () => {
    it('hides Reopen from EXPORT_MANAGER, which lacks manage Account', async () => {
      server.use(...handlers(makeRfq({ status: 'CANCELLED' })))
      renderWithProviders(<RfqDetail id="r1" />, { roles: ['EXPORT_MANAGER'] })

      await screen.findByText('Q3 black pepper')
      expect(screen.queryByRole('button', { name: /reopen/i })).not.toBeInTheDocument()
    })

    it('offers Reopen to ADMIN', async () => {
      server.use(...handlers(makeRfq({ status: 'CANCELLED' })))
      renderWithProviders(<RfqDetail id="r1" />, { roles: ['ADMIN'] })

      expect(await screen.findByRole('button', { name: /reopen/i })).toBeInTheDocument()
    })

    it('hides Approve from EXPORT_MANAGER but shows it to ADMIN', async () => {
      server.use(...handlers(makeRfq({ status: 'PENDING_APPROVAL' })))
      const { unmount } = renderWithProviders(<RfqDetail id="r1" />, {
        roles: ['EXPORT_MANAGER'],
      })
      await screen.findByText('Q3 black pepper')
      expect(screen.queryByRole('button', { name: /^approve$/i })).not.toBeInTheDocument()
      unmount()

      server.use(...handlers(makeRfq({ status: 'PENDING_APPROVAL' })))
      renderWithProviders(<RfqDetail id="r1" />, { roles: ['ADMIN'] })
      expect(await screen.findByRole('button', { name: /^approve$/i })).toBeInTheDocument()
    })

    it('hides Edit from a read-only role', async () => {
      server.use(...handlers(makeRfq()))
      renderWithProviders(<RfqDetail id="r1" />, { roles: ['READ_ONLY'] })

      await screen.findByText('Q3 black pepper')
      expect(screen.queryByRole('link', { name: /^edit$/i })).not.toBeInTheDocument()
    })
  })

  it('explains that terms are frozen once the RFQ is issued', async () => {
    server.use(...handlers(makeRfq({ status: 'ISSUED' })))
    renderWithProviders(<RfqDetail id="r1" />)

    expect(await screen.findByText(/commercial terms are frozen/i)).toBeInTheDocument()
  })

  it('hides "Revise lines" once the outcome is settled', async () => {
    server.use(...handlers(makeRfq({ status: 'CLOSED' })))
    renderWithProviders(<RfqDetail id="r1" />)

    await screen.findByText('Q3 black pepper')
    expect(screen.queryByRole('link', { name: /revise lines/i })).not.toBeInTheDocument()
  })

  it('surfaces a load failure rather than an empty screen', async () => {
    server.use(
      http.get('/api/rfqs/r1', () =>
        HttpResponse.json(fail([{ code: 'NOT_FOUND', message: 'RFQ not found.' }]), {
          status: 404,
        }),
      ),
    )
    renderWithProviders(<RfqDetail id="r1" />)

    expect(await screen.findByRole('button', { name: /try again/i })).toBeInTheDocument()
  })

  it('has no axe violations', async () => {
    server.use(...handlers(makeRfq({ suppliers: [participation()] })))
    const { container } = renderWithProviders(<RfqDetail id="r1" />)
    await screen.findByText('Q3 black pepper')

    await expectNoAxeViolations(container)
  })
})
