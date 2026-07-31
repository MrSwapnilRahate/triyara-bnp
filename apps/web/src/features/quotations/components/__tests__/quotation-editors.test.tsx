import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRouter } from 'next/navigation'
import { describe, expect, it, vi } from 'vitest'

import { expectNoAxeViolations } from '@/test/axe'
import { detail, fail, http, HttpResponse, ok, server } from '@/test/msw'
import { renderWithProviders } from '@/test/render'

import type { Quotation } from '../../types'
import { QuotationConditionsEditor } from '../quotation-conditions-editor'
import { QuotationForm } from '../quotation-form'
import { QuotationLinesEditor } from '../quotation-lines-editor'
import { quotation as makeQuotation, redacted } from './fixtures'

/**
 * jsdom does not implement the `form=` attribute on submit buttons, so a header
 * button cannot submit the form here. Tests submit the form element directly;
 * the button wiring is verified in the browser pass.
 */
const submit = (container: HTMLElement, id: string) =>
  (container.querySelector(`#${id}`) as HTMLFormElement | null)!

const detailHandlers = (q: Quotation) => [
  http.get('/api/quotations/q1', () => detail(q, q.version)),
]

/**
 * Line fields are addressed by id rather than by label. The Label component
 * renders a required marker inside its text, so "Unit" and "Unit price" cannot
 * be told apart by an anchored label regex.
 */
const field = (id: string) => document.getElementById(id) as HTMLInputElement

describe('QuotationForm', () => {
  it('requires a buyer and a number rather than posting', async () => {
    const posted = vi.fn()
    server.use(http.post('/api/quotations', posted))

    const { container } = renderWithProviders(<QuotationForm />)
    submit(container, 'quotation-form').requestSubmit()

    expect(await screen.findByText(/check the highlighted fields/i)).toBeInTheDocument()
    expect(posted).not.toHaveBeenCalled()
  })

  it('creates a quotation with its lines in one request', async () => {
    const user = userEvent.setup()
    let body: Record<string, unknown> | undefined
    server.use(
      http.post('/api/quotations', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>
        return HttpResponse.json(ok(makeQuotation({ id: 'new1' })), { status: 201 })
      }),
    )

    const { container } = renderWithProviders(<QuotationForm />)
    await user.type(screen.getByLabelText(/quotation number/i), 'QT-2026-000009')
    await user.type(screen.getByLabelText(/buyer account/i), 'acc1')
    await user.type(field('items.0.customProductName'), 'Turmeric')
    await user.type(field('items.0.quantity'), '5')
    await user.type(field('items.0.unit'), 'MT')
    await user.type(field('items.0.unitPrice'), '100')
    submit(container, 'quotation-form').requestSubmit()

    await waitFor(() => expect(body).toBeDefined())
    expect(body).toMatchObject({
      quotationNumber: 'QT-2026-000009',
      buyerId: 'acc1',
      items: [{ customProductName: 'Turmeric', quantity: 5, unit: 'MT', unitPrice: 100 }],
    })
    await waitFor(() => expect(useRouter().push).toHaveBeenCalledWith('/quotations/new1'))
  })

  it('does not ask a cost-blind role for unit cost', async () => {
    // Asking for a number the API will not show back manufactures confusion,
    // and a blank would silently zero a margin the server is hiding.
    renderWithProviders(<QuotationForm />, { roles: ['EXPORT_MANAGER'] })
    expect(field('items.0.unitCost')).toBeNull()
  })

  it('asks an ADMIN for unit cost', () => {
    renderWithProviders(<QuotationForm />, { roles: ['ADMIN'] })
    expect(field('items.0.unitCost')).not.toBeNull()
  })

  it('maps a server field error onto the offending field', async () => {
    const user = userEvent.setup()
    server.use(
      http.post('/api/quotations', () =>
        HttpResponse.json(
          fail([
            { code: 'CONFLICT', message: 'That number is already used.', field: 'quotationNumber' },
          ]),
          { status: 409 },
        ),
      ),
    )

    const { container } = renderWithProviders(<QuotationForm />)
    await user.type(screen.getByLabelText(/quotation number/i), 'QT-2026-000001')
    await user.type(screen.getByLabelText(/buyer account/i), 'acc1')
    await user.type(field('items.0.customProductName'), 'Turmeric')
    await user.type(field('items.0.quantity'), '5')
    await user.type(field('items.0.unit'), 'MT')
    await user.type(field('items.0.unitPrice'), '100')
    submit(container, 'quotation-form').requestSubmit()

    expect(await screen.findByText(/already used/i)).toBeInTheDocument()
  })

  describe('edit', () => {
    it('locks the number and omits the line editor', () => {
      renderWithProviders(<QuotationForm quotation={makeQuotation()} version={1} />)
      expect(screen.getByLabelText(/quotation number/i)).toBeDisabled()
      expect(screen.queryByLabelText(/^line 1/i)).not.toBeInTheDocument()
    })

    it('refuses to save a frozen quotation and explains', () => {
      renderWithProviders(
        <QuotationForm quotation={makeQuotation({ status: 'SENT' })} version={3} />,
      )
      expect(screen.getByText(/can no longer be edited/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled()
    })

    it('sends If-Match with the version it was given', async () => {
      const user = userEvent.setup()
      let ifMatch: string | null = null
      server.use(
        http.patch('/api/quotations/q1', ({ request }) => {
          ifMatch = request.headers.get('if-match')
          return HttpResponse.json(ok(makeQuotation({ version: 8 })), {
            headers: { ETag: 'W/"v8"' },
          })
        }),
      )

      const { container } = renderWithProviders(
        <QuotationForm quotation={makeQuotation()} version={7} />,
      )
      await user.type(screen.getByLabelText(/^title/i), ' revised')
      submit(container, 'quotation-form').requestSubmit()

      await waitFor(() => expect(ifMatch).toBe('W/"v7"'))
    })
  })

  it('has no axe violations', async () => {
    const { container } = renderWithProviders(<QuotationForm />)
    await expectNoAxeViolations(container)
  })
})

describe('QuotationLinesEditor', () => {
  it('prefills from the stored lines', async () => {
    server.use(...detailHandlers(makeQuotation()))
    renderWithProviders(<QuotationLinesEditor id="q1" mode="replace" />)

    expect(await screen.findByDisplayValue('Turmeric powder')).toBeInTheDocument()
    expect(screen.getByDisplayValue('100')).toBeInTheDocument()
  })

  it('hides unit cost from a cost-blind role even when prefilling', async () => {
    server.use(...detailHandlers(redacted()))
    renderWithProviders(<QuotationLinesEditor id="q1" mode="replace" />, {
      roles: ['EXPORT_MANAGER'],
    })

    await screen.findByDisplayValue('Turmeric powder')
    expect(field('items.0.unitCost')).toBeNull()
  })

  it('replaces the lines with If-Match', async () => {
    const user = userEvent.setup()
    let ifMatch: string | null = null
    server.use(
      ...detailHandlers(makeQuotation({ version: 4 })),
      http.post('/api/quotations/q1/items', ({ request }) => {
        ifMatch = request.headers.get('if-match')
        return HttpResponse.json(ok([]), {
          headers: { ETag: 'W/"v5"' },
        })
      }),
    )

    const { container } = renderWithProviders(<QuotationLinesEditor id="q1" mode="replace" />)
    await screen.findByDisplayValue('Turmeric powder')
    await user.clear(field('items.0.unitPrice'))
    await user.type(field('items.0.unitPrice'), '120')
    submit(container, 'quotation-lines-form').requestSubmit()

    await waitFor(() => expect(ifMatch).toBe('W/"v4"'))
  })

  it('refuses to replace lines on a frozen quotation, and says to revise', async () => {
    server.use(...detailHandlers(makeQuotation({ status: 'SENT' })))
    renderWithProviders(<QuotationLinesEditor id="q1" mode="replace" />)

    expect(await screen.findByText(/can no longer be edited/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save lines/i })).toBeDisabled()
  })

  describe('revise mode', () => {
    it('requires a reason before creating a revision', async () => {
      const posted = vi.fn()
      server.use(
        ...detailHandlers(makeQuotation({ status: 'SENT' })),
        http.post('/api/quotations/q1/revise', posted),
      )

      const { container } = renderWithProviders(<QuotationLinesEditor id="q1" mode="revise" />)
      await screen.findByDisplayValue('Turmeric powder')
      submit(container, 'quotation-lines-form').requestSubmit()

      expect(await screen.findByText(/a reason is required/i)).toBeInTheDocument()
      expect(posted).not.toHaveBeenCalled()
    })

    it('creates the successor and navigates to it, not back to the original', async () => {
      const user = userEvent.setup()
      server.use(
        ...detailHandlers(makeQuotation({ status: 'SENT' })),
        http.post('/api/quotations/q1/revise', () =>
          HttpResponse.json(ok(makeQuotation({ id: 'q2', revisionNumber: 2 })), { status: 201 }),
        ),
      )

      const { container } = renderWithProviders(<QuotationLinesEditor id="q1" mode="revise" />)
      await screen.findByDisplayValue('Turmeric powder')
      await user.type(screen.getByLabelText(/reason for the revision/i), 'Freight renegotiated.')
      submit(container, 'quotation-lines-form').requestSubmit()

      // The successor is a different record; going back to q1 would show the
      // superseded document.
      await waitFor(() => expect(useRouter().push).toHaveBeenCalledWith('/quotations/q2'))
    })

    it('refuses to revise a quotation that is still editable', async () => {
      server.use(...detailHandlers(makeQuotation({ status: 'DRAFT' })))
      renderWithProviders(<QuotationLinesEditor id="q1" mode="revise" />)

      expect(await screen.findByText(/cannot be revised/i)).toBeInTheDocument()
    })

    it('refuses to revise an already-superseded quotation', async () => {
      server.use(
        ...detailHandlers(
          makeQuotation({ status: 'SENT', supersededAt: '2026-02-01T00:00:00.000Z' }),
        ),
      )
      renderWithProviders(<QuotationLinesEditor id="q1" mode="revise" />)

      expect(await screen.findByText(/already been superseded/i)).toBeInTheDocument()
    })
  })
})

describe('QuotationConditionsEditor', () => {
  it('prefills charges and taxes from the quotation', async () => {
    server.use(...detailHandlers(makeQuotation()))
    renderWithProviders(<QuotationConditionsEditor id="q1" />)

    expect(await screen.findByDisplayValue('Ocean freight')).toBeInTheDocument()
    expect(screen.getByDisplayValue('5')).toBeInTheDocument()
  })

  it('offers no tax amount field, because the server computes it', async () => {
    server.use(...detailHandlers(makeQuotation()))
    renderWithProviders(<QuotationConditionsEditor id="q1" />)
    await screen.findByDisplayValue('Ocean freight')

    expect(screen.getByText(/amounts are computed, not entered/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/tax amount/i)).not.toBeInTheDocument()
  })

  it('sends both collections together with If-Match', async () => {
    const user = userEvent.setup()
    let ifMatch: string | null = null
    let body: { charges: unknown[]; taxes: unknown[] } | undefined
    server.use(
      ...detailHandlers(makeQuotation({ version: 3 })),
      http.put('/api/quotations/q1/conditions', async ({ request }) => {
        ifMatch = request.headers.get('if-match')
        body = (await request.json()) as { charges: unknown[]; taxes: unknown[] }
        return HttpResponse.json(ok({ charges: [], taxes: [] }))
      }),
    )

    renderWithProviders(<QuotationConditionsEditor id="q1" />)
    await screen.findByDisplayValue('Ocean freight')
    await user.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(body).toBeDefined())
    expect(ifMatch).toBe('W/"v3"')
    expect(body!.charges).toHaveLength(1)
    expect(body!.taxes).toHaveLength(1)
  })

  it('clears a collection by removing its rows', async () => {
    const user = userEvent.setup()
    let body: { charges: unknown[]; taxes: unknown[] } | undefined
    server.use(
      ...detailHandlers(makeQuotation()),
      http.put('/api/quotations/q1/conditions', async ({ request }) => {
        body = (await request.json()) as { charges: unknown[]; taxes: unknown[] }
        return HttpResponse.json(ok({ charges: [], taxes: [] }))
      }),
    )

    renderWithProviders(<QuotationConditionsEditor id="q1" />)
    await screen.findByDisplayValue('Ocean freight')
    await user.click(screen.getByRole('button', { name: /remove charge 1/i }))
    await user.click(screen.getByRole('button', { name: /^save$/i }))

    // An empty array is the instruction to clear, not an omission.
    await waitFor(() => expect(body).toBeDefined())
    expect(body!.charges).toEqual([])
  })

  it('refuses to save on a frozen quotation', async () => {
    server.use(...detailHandlers(makeQuotation({ status: 'SENT' })))
    renderWithProviders(<QuotationConditionsEditor id="q1" />)

    expect(await screen.findByText(/pricing is frozen/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^save$/i })).toBeDisabled()
  })

  it('has no axe violations', async () => {
    server.use(...detailHandlers(makeQuotation()))
    const { container } = renderWithProviders(<QuotationConditionsEditor id="q1" />)
    await screen.findByDisplayValue('Ocean freight')

    await expectNoAxeViolations(container)
  })
})
