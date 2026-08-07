import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { expectNoAxeViolations } from '@/test/axe'
import { http, HttpResponse, ok, server } from '@/test/msw'
import { renderWithProviders } from '@/test/render'

import { SupplierDrawer } from '../components/supplier-drawer'
import type { ShortlistSupplier, SupplierScore } from '../types'

const supplier = (over: Partial<ShortlistSupplier> = {}): ShortlistSupplier =>
  ({
    id: 's1',
    supplierCode: 'SUP-000001',
    companyName: 'Nizam Spice Processors',
    legalName: 'Nizam Spice Processors Pvt Ltd',
    businessType: 'MANUFACTURER',
    email: 'trade@nizam.test',
    phone: '+91 40 1234 5678',
    country: 'IN',
    state: null,
    city: 'Hyderabad',
    status: 'APPROVED',
    isVerified: true,
    verifiedAt: null,
    accountId: null,
    version: 1,
    createdAt: '',
    updatedAt: '',
    deletedAt: null,
    exportCountries: ['AE'],
    packaging: '25kg PP bags',
    paymentTerms: '30% advance',
    moq: '1 container',
    leadTimeDays: 21,
    productionCapacity: null,
    certifications: [],
    ...over,
  }) as ShortlistSupplier

const score: SupplierScore = {
  supplierId: 's1',
  score: 80,
  band: 'ready',
  lastContactedAt: null,
  components: [
    {
      key: 'verification',
      label: 'Verification',
      points: 25,
      max: 25,
      detail: 'Approved and verified.',
    },
    {
      key: 'responsiveness',
      label: 'Responsiveness',
      points: 8,
      max: 15,
      detail: 'Replied to 1 of 2 RFQs.',
    },
  ],
}

beforeEach(() => {
  server.use(
    http.get('/api/suppliers/:id/score', () => HttpResponse.json(ok(score))),
    http.get('/api/suppliers/:id/contacts', () => HttpResponse.json(ok([]))),
    http.get('/api/suppliers/:id/certifications', () => HttpResponse.json(ok([]))),
    http.get('/api/suppliers/:id/documents', () => HttpResponse.json(ok([]))),
    http.get('/api/suppliers/:id/notes', () => HttpResponse.json(ok([], { nextCursor: null }))),
    http.get('/api/suppliers/:id/products', () => HttpResponse.json(ok([], { nextCursor: null }))),
    http.get('/api/suppliers/:id/rfqs', () => HttpResponse.json(ok([]))),
    http.get('/api/suppliers/:id/quotations', () => HttpResponse.json(ok([]))),
    http.get('/api/rfqs', () => HttpResponse.json(ok([]))),
  )
})

const open = (over: Partial<ShortlistSupplier> = {}) =>
  renderWithProviders(
    <SupplierDrawer supplier={supplier(over)} score={score} open onClose={vi.fn()} />,
  )

describe('SupplierDrawer', () => {
  it('opens on the score and explains how it was reached', async () => {
    open()
    expect(await screen.findByText('80/100')).toBeInTheDocument()
    expect(screen.getByText('Approved and verified.')).toBeInTheDocument()
    expect(screen.getByText('Replied to 1 of 2 RFQs.')).toBeInTheDocument()
  })

  it('offers every tab the brief asks for', async () => {
    open()
    await screen.findByText('80/100')
    for (const label of [
      'Overview',
      'Contacts',
      'Certifications',
      'Documents',
      'Notes',
      'Offerings',
      'RFQs',
      'Quotations',
    ]) {
      expect(screen.getByRole('tab', { name: label })).toBeInTheDocument()
    }
  })

  it('fetches a tab only when it is opened', async () => {
    const asked: string[] = []
    server.use(
      http.get('/api/suppliers/:id/contacts', () => {
        asked.push('contacts')
        return HttpResponse.json(ok([]))
      }),
    )
    open()
    await screen.findByText('80/100')
    // Eight simultaneous requests on open would make the drawer slower than
    // the page it exists to avoid.
    expect(asked).toHaveLength(0)

    await userEvent.setup().click(screen.getByRole('tab', { name: 'Contacts' }))
    await waitFor(() => expect(asked).toEqual(['contacts']))
  })

  it('shows the RFQ history including whether they replied', async () => {
    server.use(
      http.get('/api/suppliers/:id/rfqs', () =>
        HttpResponse.json(
          ok([
            {
              id: 'rs1',
              status: 'SUBMITTED',
              invitedAt: '2026-06-01T00:00:00.000Z',
              respondedAt: '2026-06-03T00:00:00.000Z',
              isLate: false,
              quotationTotal: null,
              quotationCurrency: null,
              rfq: {
                id: 'r1',
                rfqNumber: 'RFQ-2026-000001',
                title: 'Turmeric for Q3',
                status: 'ISSUED',
                priority: 'NORMAL',
                createdAt: '',
              },
            },
          ]),
        ),
      ),
    )
    open()
    await screen.findByText('80/100')
    await userEvent.setup().click(screen.getByRole('tab', { name: 'RFQs' }))

    expect(await screen.findByText('Turmeric for Q3')).toBeInTheDocument()
    expect(screen.getByText(/replied/i)).toBeInTheDocument()
  })

  it('marks the quotations a supplier actually won', async () => {
    server.use(
      http.get('/api/suppliers/:id/quotations', () =>
        HttpResponse.json(
          ok([
            {
              id: 'q1',
              supplierPrice: '1800',
              supplierCurrency: 'USD',
              landedUnitCost: '1850',
              incoterm: 'CIF',
              port: 'Jebel Ali',
              rank: 1,
              isSelected: true,
              createdAt: '',
              quotationItem: {
                id: 'qi1',
                description: 'Turmeric fingers',
                quotation: {
                  id: 'qq1',
                  quotationNumber: 'QT-2026-0001',
                  status: 'SENT',
                  currency: 'USD',
                  createdAt: '',
                },
              },
            },
          ]),
        ),
      ),
    )
    open()
    await screen.findByText('80/100')
    await userEvent.setup().click(screen.getByRole('tab', { name: 'Quotations' }))

    expect(await screen.findByText('QT-2026-0001')).toBeInTheDocument()
    // Quoted often but chosen rarely reads very differently from chosen every
    // time, so the outcome is the fact worth surfacing.
    expect(screen.getByText('Chosen')).toBeInTheDocument()
  })

  it('offers call, WhatsApp and email from the contact details already loaded', async () => {
    open()
    await screen.findByText('80/100')

    expect(screen.getByRole('link', { name: /call/i })).toHaveAttribute('href', 'tel:+914012345678')
    expect(screen.getByRole('link', { name: /whatsapp/i })).toHaveAttribute(
      'href',
      'https://wa.me/914012345678',
    )
    expect(screen.getByRole('link', { name: /email/i })).toHaveAttribute(
      'href',
      'mailto:trade@nizam.test',
    )
  })

  it('disables a channel the supplier does not have rather than hiding it', async () => {
    open({ phone: null, email: null })
    await screen.findByText('80/100')

    // Hiding them would reflow the action row as data arrives; disabled says
    // "we have no number" rather than "this action does not exist".
    expect(screen.getByRole('button', { name: /call/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /email/i })).toBeDisabled()
  })

  it('links through to the full supplier record', async () => {
    open()
    await screen.findByText('80/100')
    expect(screen.getByRole('link', { name: /open supplier/i })).toHaveAttribute(
      'href',
      '/suppliers/s1',
    )
  })

  it('says so plainly when there is no RFQ to invite into', async () => {
    open()
    await screen.findByText('80/100')
    await userEvent.setup().click(screen.getByRole('button', { name: /invite to rfq/i }))

    expect(await screen.findByText('No open RFQs')).toBeInTheDocument()
  })

  it('invites the supplier to a chosen RFQ', async () => {
    const posted = vi.fn()
    server.use(
      http.get('/api/rfqs', ({ request }) => {
        const url = new URL(request.url)
        // The screen must ask for open RFQs only; it does not decide which
        // states those are.
        expect(url.searchParams.get('openOnly')).toBe('true')
        return HttpResponse.json(
          ok([{ id: 'r1', rfqNumber: 'RFQ-1', title: 'Turmeric', status: 'ISSUED' }]),
        )
      }),
      http.post('/api/rfqs/:id/suppliers', async ({ request, params }) => {
        posted({ rfqId: params.id, body: await request.json() })
        return HttpResponse.json(ok({ invited: 1 }), { status: 201 })
      }),
    )

    open()
    await screen.findByText('80/100')
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /invite to rfq/i }))

    await user.click(await screen.findByLabelText(/choose an rfq/i))
    await user.click(await screen.findByRole('option', { name: /RFQ-1/ }))
    await user.click(screen.getByRole('button', { name: /send invitation/i }))

    await waitFor(() => expect(posted).toHaveBeenCalled())
    expect(posted.mock.calls[0]![0]).toMatchObject({
      rfqId: 'r1',
      body: { supplierIds: ['s1'] },
    })
  })

  it('has no axe violations', async () => {
    const { container } = open()
    await screen.findByText('80/100')
    await expectNoAxeViolations(container)
  })
})
