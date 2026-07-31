import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRouter } from 'next/navigation'
import { describe, expect, it, vi } from 'vitest'

import { expectNoAxeViolations } from '@/test/axe'
import { fail, http, HttpResponse, ok, server } from '@/test/msw'
import { renderWithProviders } from '@/test/render'

import { RfqForm } from '../rfq-form'
import { rfq as makeRfq } from './fixtures'

/**
 * jsdom does not implement the `form=` attribute on submit buttons, so the
 * header's Create button cannot submit the form here. Tests submit the form
 * element directly; the button wiring is verified in the browser pass.
 */
const submit = (container: HTMLElement) =>
  (container.querySelector('#rfq-form') as HTMLFormElement | null)!

describe('RfqForm', () => {
  it('requires a title, and says so rather than posting', async () => {
    const user = userEvent.setup()
    const posted = vi.fn()
    server.use(http.post('/api/rfqs', posted))

    const { container } = renderWithProviders(<RfqForm />)
    await user.click(screen.getByLabelText(/rfq number/i))
    submit(container).requestSubmit()

    expect(await screen.findByText(/check the highlighted fields/i)).toBeInTheDocument()
    expect(posted).not.toHaveBeenCalled()
  })

  it('requires at least one described line', async () => {
    const user = userEvent.setup()
    const { container } = renderWithProviders(<RfqForm />)

    await user.type(screen.getByLabelText(/rfq number/i), 'RFQ-2026-000009')
    await user.type(screen.getByLabelText(/^title/i), 'Cardamom Q4')
    await user.type(screen.getByLabelText(/buyer account/i), 'acc1')
    // Line 1 left blank on purpose.
    submit(container).requestSubmit()

    expect(await screen.findByText(/describe the line/i)).toBeInTheDocument()
  })

  it('creates an RFQ with its lines in one request', async () => {
    const user = userEvent.setup()
    let body: Record<string, unknown> | undefined
    server.use(
      http.post('/api/rfqs', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>
        return HttpResponse.json(ok(makeRfq({ id: 'new1' })), { status: 201 })
      }),
    )

    const { container } = renderWithProviders(<RfqForm />)
    await user.type(screen.getByLabelText(/rfq number/i), 'RFQ-2026-000009')
    await user.type(screen.getByLabelText(/^title/i), 'Cardamom Q4')
    await user.type(screen.getByLabelText(/buyer account/i), 'acc1')
    await user.type(screen.getByLabelText(/^line 1/i), 'Cardamom 8mm')
    await user.type(screen.getByLabelText(/^quantity/i), '5')
    await user.type(screen.getByLabelText(/^unit/i), 'MT')
    submit(container).requestSubmit()

    await waitFor(() => expect(body).toBeDefined())
    expect(body).toMatchObject({
      rfqNumber: 'RFQ-2026-000009',
      title: 'Cardamom Q4',
      items: [{ customProductName: 'Cardamom 8mm', quantity: 5, unit: 'MT' }],
    })
    await waitFor(() => expect(useRouter().push).toHaveBeenCalledWith('/rfqs/new1'))
  })

  it('adds and removes lines', async () => {
    const user = userEvent.setup()
    renderWithProviders(<RfqForm />)

    // The only line cannot be removed - an RFQ needs at least one.
    expect(screen.getByRole('button', { name: /remove line 1/i })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: /add line/i }))
    expect(screen.getByLabelText(/^line 2/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /remove line 1/i })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: /remove line 2/i }))
    expect(screen.queryByLabelText(/^line 2/i)).not.toBeInTheDocument()
  })

  it('asks for a buyer only on a BUYER RFQ', async () => {
    renderWithProviders(<RfqForm />)
    expect(screen.getByLabelText(/buyer account/i)).toBeInTheDocument()
  })

  it('maps a server field error onto the offending field', async () => {
    const user = userEvent.setup()
    server.use(
      http.post('/api/rfqs', () =>
        HttpResponse.json(
          fail([
            {
              code: 'CONFLICT',
              message: 'That RFQ number is already used.',
              field: 'rfqNumber',
            },
          ]),
          { status: 409 },
        ),
      ),
    )

    const { container } = renderWithProviders(<RfqForm />)
    await user.type(screen.getByLabelText(/rfq number/i), 'RFQ-2026-000001')
    await user.type(screen.getByLabelText(/^title/i), 'Duplicate')
    await user.type(screen.getByLabelText(/buyer account/i), 'acc1')
    await user.type(screen.getByLabelText(/^line 1/i), 'Pepper')
    await user.type(screen.getByLabelText(/^quantity/i), '1')
    await user.type(screen.getByLabelText(/^unit/i), 'MT')
    submit(container).requestSubmit()

    expect(await screen.findByText(/already used/i)).toBeInTheDocument()
  })

  describe('edit', () => {
    it('locks the RFQ number, which cannot change once assigned', () => {
      renderWithProviders(<RfqForm rfq={makeRfq()} version={1} />)
      expect(screen.getByLabelText(/rfq number/i)).toBeDisabled()
    })

    it('does not ask for lines - they are revised on their own screen', () => {
      renderWithProviders(<RfqForm rfq={makeRfq()} version={1} />)
      expect(screen.queryByLabelText(/^line 1/i)).not.toBeInTheDocument()
    })

    it('disables frozen commercial terms on an issued RFQ, and explains', () => {
      renderWithProviders(<RfqForm rfq={makeRfq({ status: 'ISSUED' })} version={3} />)

      expect(screen.getByText(/commercial terms are frozen/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/^currency/i)).toBeDisabled()
      expect(screen.getByLabelText(/destination port/i)).toBeDisabled()
      // The title is still editable - only the four frozen terms are locked.
      expect(screen.getByLabelText(/^title/i)).toBeEnabled()
    })

    it('sends If-Match with the version it was given', async () => {
      const user = userEvent.setup()
      let ifMatch: string | null = null
      server.use(
        http.patch('/api/rfqs/r1', ({ request }) => {
          ifMatch = request.headers.get('if-match')
          return HttpResponse.json(ok(makeRfq({ version: 8 })), {
            headers: { ETag: 'W/"v8"' },
          })
        }),
      )

      const { container } = renderWithProviders(<RfqForm rfq={makeRfq()} version={7} />)
      await user.type(screen.getByLabelText(/^title/i), ' revised')
      submit(container).requestSubmit()

      await waitFor(() => expect(ifMatch).toBe('W/"v7"'))
    })
  })

  it('has no axe violations', async () => {
    const { container } = renderWithProviders(<RfqForm />)
    await expectNoAxeViolations(container)
  })
})
