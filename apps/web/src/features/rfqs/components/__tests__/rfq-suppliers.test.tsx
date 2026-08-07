import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { expectNoAxeViolations } from '@/test/axe'
import { fail, http, HttpResponse, ok, server } from '@/test/msw'
import { renderWithProviders } from '@/test/render'

import { RfqSuppliers } from '../rfq-suppliers'
import { participation, rfq as makeRfq } from './fixtures'

const searchHit = {
  id: 's2',
  supplierCode: 'SUP-000002',
  companyName: 'Global Foods',
  country: 'IN',
  city: 'Kochi',
  status: 'APPROVED' as const,
  isVerified: true,
}

function handlers({ participants = [] as ReturnType<typeof participation>[] } = {}) {
  return [
    http.get('/api/rfqs/r1/suppliers', () =>
      HttpResponse.json(
        ok(participants, {
          extra: {
            count: participants.length,
            submitted: participants.filter((p) => p.status === 'SUBMITTED').length,
          },
        }),
      ),
    ),
    http.get('/api/suppliers/search', () => HttpResponse.json(ok([searchHit]))),
  ]
}

describe('RfqSuppliers', () => {
  it('lists who was invited and where they stand', async () => {
    server.use(...handlers({ participants: [participation()] }))
    renderWithProviders(<RfqSuppliers rfq={makeRfq()} />)

    const table = await screen.findByRole('table', { name: /invited suppliers/i })
    expect(within(table).getByText('Acme Spices')).toBeInTheDocument()
    expect(within(table).getByText('Invited')).toBeInTheDocument()
  })

  it('warns that an APPROVED RFQ with nobody invited cannot be published', async () => {
    server.use(...handlers())
    renderWithProviders(<RfqSuppliers rfq={makeRfq({ status: 'APPROVED' })} />)

    expect(await screen.findByText(/cannot be published yet/i)).toBeInTheDocument()
  })

  it('does not offer to invite once the round is closed', async () => {
    server.use(...handlers({ participants: [participation()] }))
    renderWithProviders(<RfqSuppliers rfq={makeRfq({ status: 'CLOSED' })} />)

    await screen.findByRole('table', { name: /invited suppliers/i })
    expect(screen.queryByRole('button', { name: /invite suppliers/i })).not.toBeInTheDocument()
  })

  it('hides inviting from a role that cannot update', async () => {
    server.use(...handlers())
    renderWithProviders(<RfqSuppliers rfq={makeRfq()} />, { roles: ['READ_ONLY'] })

    await screen.findByText('No suppliers invited')
    expect(screen.queryByRole('button', { name: /invite suppliers/i })).not.toBeInTheDocument()
  })

  describe('inviting', () => {
    it('waits for two characters before searching', async () => {
      const user = userEvent.setup()
      const searched = vi.fn()
      server.use(
        ...handlers(),
        http.get('/api/suppliers/search', () => {
          searched()
          return HttpResponse.json(ok([searchHit]))
        }),
      )
      renderWithProviders(<RfqSuppliers rfq={makeRfq()} />)

      await user.click(await screen.findByRole('button', { name: /invite suppliers/i }))
      await user.type(screen.getByLabelText(/search suppliers/i), 'g')

      expect(screen.getByText(/at least two characters/i)).toBeInTheDocument()
      expect(searched).not.toHaveBeenCalled()
    })

    it('posts the selected supplier ids', async () => {
      const user = userEvent.setup()
      let body: { supplierIds: string[] } | undefined
      server.use(
        ...handlers(),
        http.post('/api/rfqs/r1/suppliers', async ({ request }) => {
          body = (await request.json()) as { supplierIds: string[] }
          return HttpResponse.json(ok([participation({ supplierId: 's2' })]))
        }),
      )
      renderWithProviders(<RfqSuppliers rfq={makeRfq()} />)

      await user.click(await screen.findByRole('button', { name: /invite suppliers/i }))
      await user.type(screen.getByLabelText(/search suppliers/i), 'global')
      await user.click(await screen.findByRole('checkbox'))
      await user.click(screen.getByRole('button', { name: /^invite 1$/i }))

      await waitFor(() => expect(body).toEqual({ supplierIds: ['s2'] }))
    })

    it('shows an already-invited supplier as un-selectable', async () => {
      const user = userEvent.setup()
      server.use(...handlers({ participants: [participation({ supplierId: 's2' })] }))
      renderWithProviders(<RfqSuppliers rfq={makeRfq()} />)

      await user.click(await screen.findByRole('button', { name: /invite suppliers/i }))
      await user.type(screen.getByLabelText(/search suppliers/i), 'global')

      const checkbox = await screen.findByRole('checkbox')
      expect(checkbox).toBeDisabled()
    })

    it('keeps Invite disabled until something is selected', async () => {
      const user = userEvent.setup()
      server.use(...handlers())
      renderWithProviders(<RfqSuppliers rfq={makeRfq()} />)

      await user.click(await screen.findByRole('button', { name: /invite suppliers/i }))
      expect(screen.getByRole('button', { name: /^invite$/i })).toBeDisabled()
    })
  })

  describe('declining', () => {
    it('will not submit a decline with no reason', async () => {
      const user = userEvent.setup()
      server.use(...handlers({ participants: [participation()] }))
      renderWithProviders(<RfqSuppliers rfq={makeRfq()} />)

      await user.click(await screen.findByRole('button', { name: /^decline$/i }))
      // The API requires a reason; the button stays disabled rather than
      // sending a request that would come back 422.
      expect(screen.getByRole('button', { name: /record decline/i })).toBeDisabled()
    })

    it('sends the reason and the participation version as If-Match', async () => {
      const user = userEvent.setup()
      let ifMatch: string | null = null
      let body: Record<string, unknown> | undefined
      server.use(
        ...handlers({ participants: [participation({ version: 4 })] }),
        http.patch('/api/rfqs/r1/suppliers/p1', async ({ request }) => {
          ifMatch = request.headers.get('if-match')
          body = (await request.json()) as Record<string, unknown>
          return HttpResponse.json(ok(participation({ status: 'DECLINED' })))
        }),
      )
      renderWithProviders(<RfqSuppliers rfq={makeRfq()} />)

      await user.click(await screen.findByRole('button', { name: /^decline$/i }))
      await user.type(screen.getByLabelText(/^reason/i), 'Capacity is committed.')
      await user.click(screen.getByRole('button', { name: /record decline/i }))

      await waitFor(() => expect(body).toBeDefined())
      expect(body).toEqual({ status: 'DECLINED', declineReason: 'Capacity is committed.' })
      expect(ifMatch).toBe('W/"v4"')
    })

    it('does not offer Decline once a bid is in', async () => {
      server.use(...handlers({ participants: [participation({ status: 'SUBMITTED' })] }))
      renderWithProviders(<RfqSuppliers rfq={makeRfq()} />)

      await screen.findByRole('table', { name: /invited suppliers/i })
      expect(screen.queryByRole('button', { name: /^decline$/i })).not.toBeInTheDocument()
    })
  })

  it('surfaces a failed load rather than an empty panel', async () => {
    server.use(
      http.get('/api/rfqs/r1/suppliers', () =>
        HttpResponse.json(fail([{ code: 'X', message: 'boom' }]), { status: 500 }),
      ),
    )
    renderWithProviders(<RfqSuppliers rfq={makeRfq()} />)

    expect(await screen.findByRole('button', { name: /try again/i })).toBeInTheDocument()
    expect(screen.queryByText('No suppliers invited')).not.toBeInTheDocument()
  })

  it('has no axe violations', async () => {
    server.use(...handlers({ participants: [participation()] }))
    const { container } = renderWithProviders(<RfqSuppliers rfq={makeRfq()} />)
    await screen.findByRole('table', { name: /invited suppliers/i })

    await expectNoAxeViolations(container)
  })
})

describe('RfqSuppliers - award', () => {
  const bidder = () =>
    participation({
      status: 'SUBMITTED',
      submittedAt: '2026-02-01T00:00:00.000Z',
      quotationTotal: '12500.00',
    })

  const evaluating = (over = {}) =>
    makeRfq({ status: 'EVALUATING', suppliers: [bidder()], version: 3, ...over })

  it('offers Award only to a supplier who submitted a bid', async () => {
    server.use(
      ...handlers({ participants: [bidder(), participation({ id: 'p2', supplierId: 's2' })] }),
    )
    renderWithProviders(<RfqSuppliers rfq={evaluating()} />)

    const table = await screen.findByRole('table', { name: /invited suppliers/i })
    await waitFor(() =>
      expect(within(table).getAllByRole('button', { name: /award supplier/i })).toHaveLength(1),
    )
  })

  it('does not offer Award before the round is being evaluated', async () => {
    server.use(...handlers({ participants: [bidder()] }))
    renderWithProviders(<RfqSuppliers rfq={makeRfq({ status: 'IN_PROGRESS' })} />)

    await screen.findByRole('table', { name: /invited suppliers/i })
    expect(screen.queryByRole('button', { name: /award supplier/i })).not.toBeInTheDocument()
  })

  it('names the supplier and warns the decision is final before confirming', async () => {
    const user = userEvent.setup()
    server.use(...handlers({ participants: [bidder()] }))
    renderWithProviders(<RfqSuppliers rfq={evaluating()} />)

    await user.click(await screen.findByRole('button', { name: /award supplier/i }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/You are about to award this RFQ to/)).toBeInTheDocument()
    expect(within(dialog).getAllByText(/Acme Spices/).length).toBeGreaterThan(0)
    expect(
      within(dialog).getByText(/cannot be reversed without administrator intervention/i),
    ).toBeInTheDocument()
  })

  it('sends the participation id and the RFQ version, then confirms', async () => {
    const user = userEvent.setup()
    let sent: { body: unknown; ifMatch: string | null } | null = null
    server.use(
      ...handlers({ participants: [bidder()] }),
      http.post('/api/rfqs/r1/award', async ({ request }) => {
        sent = { body: await request.json(), ifMatch: request.headers.get('if-match') }
        return HttpResponse.json(
          ok({ ...evaluating(), status: 'AWARDED', awardedSupplierId: 's1', version: 4 }),
        )
      }),
    )
    renderWithProviders(<RfqSuppliers rfq={evaluating()} />)

    await user.click(await screen.findByRole('button', { name: /award supplier/i }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /^award acme spices$/i }))

    await waitFor(() => expect(sent).not.toBeNull())
    expect(sent!.body).toEqual({ participationId: 'p1' })
    // Optimistic concurrency reaches the wire, not just the service.
    expect(sent!.ifMatch).toBe('W/"v3"')
  })

  it('shows the winner and withdraws the Award button once awarded', async () => {
    server.use(...handlers({ participants: [participation({ status: 'AWARDED' })] }))
    renderWithProviders(
      <RfqSuppliers rfq={makeRfq({ status: 'AWARDED', awardedSupplierId: 's1' })} />,
    )

    const table = await screen.findByRole('table', { name: /invited suppliers/i })
    // The status column is the single place the outcome is stated.
    expect(within(table).getByText('Awarded')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /award supplier/i })).not.toBeInTheDocument()
    // The winning row is marked so the eye lands on it without re-reading statuses.
    const winner = within(table).getByText('Acme Spices').closest('tr')
    expect(winner?.className).toMatch(/success/)
  })

  it('surfaces a rejected award without claiming success', async () => {
    const user = userEvent.setup()
    server.use(
      ...handlers({ participants: [bidder()] }),
      http.post('/api/rfqs/r1/award', () =>
        HttpResponse.json(
          fail([{ code: 'CONFLICT', message: 'This RFQ has already been awarded.' }]),
          { status: 409 },
        ),
      ),
    )
    renderWithProviders(<RfqSuppliers rfq={evaluating()} />)

    await user.click(await screen.findByRole('button', { name: /award supplier/i }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /^award acme spices$/i }))

    expect(await screen.findByText(/already been awarded/i)).toBeInTheDocument()
  })

  it('has no accessibility violations with the award dialog open', async () => {
    const user = userEvent.setup()
    server.use(...handlers({ participants: [bidder()] }))
    const { container } = renderWithProviders(<RfqSuppliers rfq={evaluating()} />)

    await user.click(await screen.findByRole('button', { name: /award supplier/i }))
    await screen.findByRole('dialog')
    await expectNoAxeViolations(container)
  })
})
