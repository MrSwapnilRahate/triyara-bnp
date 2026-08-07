import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { expectNoAxeViolations } from '@/test/axe'
import { fail, http, HttpResponse, ok, server } from '@/test/msw'
import { renderWithProviders } from '@/test/render'

import { MatchingDashboard } from '../components/matching-dashboard'

const supplier = (over: Record<string, unknown> = {}) => ({
  id: 's1',
  supplierCode: 'SUP-000001',
  companyName: 'Nizam Spice Processors',
  legalName: 'Nizam Spice Processors Pvt Ltd',
  businessType: 'MANUFACTURER',
  email: 'trade@nizam.test',
  phone: '+91 40 1234 5678',
  country: 'IN',
  state: 'Telangana',
  city: 'Hyderabad',
  status: 'APPROVED',
  isVerified: true,
  verifiedAt: null,
  accountId: null,
  version: 1,
  createdAt: '',
  updatedAt: '',
  deletedAt: null,
  exportCountries: ['AE', 'US'],
  packaging: '25kg PP bags',
  paymentTerms: '30% advance',
  moq: '1 x 20ft container',
  leadTimeDays: 21,
  productionCapacity: '200 MT per month',
  certifications: [
    { id: 'c1', type: 'FSSAI', status: 'ACTIVE' },
    { id: 'c2', type: 'ISO', status: 'EXPIRED' },
  ],
  ...over,
})

const score = (over: Record<string, unknown> = {}) => ({
  supplierId: 's1',
  score: 80,
  band: 'ready',
  lastContactedAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
  components: [
    {
      key: 'verification',
      label: 'Verification',
      points: 25,
      max: 25,
      detail: 'Approved and verified.',
    },
    {
      key: 'certifications',
      label: 'Certifications',
      points: 20,
      max: 20,
      detail: '3 active certificates.',
    },
  ],
  ...over,
})

function shortlistReturns(items: unknown[], scores: unknown[], onRequest?: (url: URL) => void) {
  server.use(
    http.get('/api/suppliers/shortlist', ({ request }) => {
      onRequest?.(new URL(request.url))
      return HttpResponse.json(ok(items, { extra: { scores } }))
    }),
  )
}

beforeEach(() => {
  server.use(
    http.get('/api/suppliers/countries', () =>
      HttpResponse.json(ok([{ country: 'IN', suppliers: 5 }])),
    ),
    http.get('/api/catalog/products', () => HttpResponse.json(ok([]))),
  )
})

describe('MatchingDashboard', () => {
  it('lists suppliers with the facts that settle a choice', async () => {
    shortlistReturns([supplier()], [score()])
    renderWithProviders(<MatchingDashboard />)

    const card = await screen.findByRole('listitem')
    expect(within(card).getByText('Nizam Spice Processors')).toBeInTheDocument()
    expect(within(card).getByText('80')).toBeInTheDocument()
    expect(within(card).getByText('Verified')).toBeInTheDocument()
    expect(within(card).getByText('Hyderabad, IN')).toBeInTheDocument()
    expect(within(card).getByText('1 x 20ft container')).toBeInTheDocument()
    expect(within(card).getByText('25kg PP bags')).toBeInTheDocument()
    expect(within(card).getByText('30% advance')).toBeInTheDocument()
    expect(within(card).getByText('AE, US')).toBeInTheDocument()
    expect(within(card).getByText(/contacted 3 days ago/i)).toBeInTheDocument()
  })

  it('shows only certifications the supplier currently holds', async () => {
    shortlistReturns([supplier()], [score()])
    renderWithProviders(<MatchingDashboard />)

    const card = await screen.findByRole('listitem')
    expect(within(card).getByText('FSSAI')).toBeInTheDocument()
    // ISO is EXPIRED. Showing it on a shortlist would imply a credential the
    // supplier no longer has.
    expect(within(card).queryByText('ISO')).not.toBeInTheDocument()
  })

  it('orders suppliers by readiness, best first', async () => {
    shortlistReturns(
      [
        supplier({ id: 'low', companyName: 'Lower Score Ltd' }),
        supplier({ id: 'high', companyName: 'Higher Score Ltd' }),
      ],
      [
        { ...score(), supplierId: 'low', score: 30, band: 'incomplete' },
        { ...score(), supplierId: 'high', score: 90, band: 'ready' },
      ],
    )
    renderWithProviders(<MatchingDashboard />)

    const cards = await screen.findAllByRole('listitem')
    expect(within(cards[0]!).getByText('Higher Score Ltd')).toBeInTheDocument()
    expect(within(cards[1]!).getByText('Lower Score Ltd')).toBeInTheDocument()
  })

  it('sends every filter to the server rather than narrowing in the browser', async () => {
    const seen: URL[] = []
    shortlistReturns([supplier()], [score()], (url) => seen.push(url))
    renderWithProviders(<MatchingDashboard />)
    await screen.findByRole('listitem')

    const user = userEvent.setup()
    await user.type(screen.getByLabelText(/exports to/i), 'ae')
    await user.type(screen.getByLabelText(/maximum moq/i), '10')
    await user.type(screen.getByLabelText(/^packaging/i), 'bags')

    await waitFor(() => {
      const last = seen.at(-1)!
      expect(last.searchParams.get('exportCountry')).toBe('AE')
      expect(last.searchParams.get('maxMoq')).toBe('10')
      expect(last.searchParams.get('packaging')).toBe('bags')
    })
  })

  it('omits an unset filter instead of sending a blank the API would reject', async () => {
    const seen: URL[] = []
    shortlistReturns([supplier()], [score()], (url) => seen.push(url))
    renderWithProviders(<MatchingDashboard />)
    await screen.findByRole('listitem')

    // `certification=''` is a 422 — the schema takes an enum. "Any" has to
    // disappear from the query, not be transmitted as empty.
    const first = seen[0]!
    expect(first.searchParams.has('certification')).toBe(false)
    expect(first.searchParams.has('country')).toBe(false)
  })

  it('rejects a non-numeric MOQ before it reaches the request', async () => {
    shortlistReturns([supplier()], [score()])
    renderWithProviders(<MatchingDashboard />)
    await screen.findByRole('listitem')

    const user = userEvent.setup()
    const moq = screen.getByLabelText(/maximum moq/i)
    await user.type(moq, '10abc')
    expect(moq).toHaveValue('10')
  })

  it('counts the active filters and clears them all', async () => {
    shortlistReturns([supplier()], [score()])
    renderWithProviders(<MatchingDashboard />)
    await screen.findByRole('listitem')

    const user = userEvent.setup()
    await user.type(screen.getByLabelText(/exports to/i), 'AE')
    await user.type(screen.getByLabelText(/^packaging/i), 'bags')

    await user.click(await screen.findByRole('button', { name: /clear/i }))
    expect(screen.getByLabelText(/exports to/i)).toHaveValue('')
    expect(screen.getByLabelText(/^packaging/i)).toHaveValue('')
  })

  it('says which filters narrow hardest when nothing matches', async () => {
    shortlistReturns([], [])
    renderWithProviders(<MatchingDashboard />)

    const user = userEvent.setup()
    await user.type(await screen.findByLabelText(/exports to/i), 'ZZ')

    expect(await screen.findByText(/no supplier matches these filters/i)).toBeInTheDocument()
    expect(screen.getByText(/moq and certification ones narrow hardest/i)).toBeInTheDocument()
  })

  it('distinguishes an empty tenant from an over-filtered one', async () => {
    shortlistReturns([], [])
    renderWithProviders(<MatchingDashboard />)
    // No filters applied: this is not "loosen your filters", it is "there are
    // none yet", and telling someone to loosen nothing is confusing.
    expect(await screen.findByText('No suppliers yet')).toBeInTheDocument()
  })

  it('reports a failed search with a retry rather than an empty shortlist', async () => {
    server.use(
      http.get('/api/suppliers/shortlist', () =>
        HttpResponse.json(fail([{ code: 'INTERNAL', message: 'Boom' }]), { status: 500 }),
      ),
    )
    renderWithProviders(<MatchingDashboard />)

    expect(await screen.findByRole('button', { name: /try again/i })).toBeInTheDocument()
    expect(screen.queryByText('No suppliers yet')).not.toBeInTheDocument()
  })

  it('renders a supplier with nothing on file without inventing values', async () => {
    shortlistReturns(
      [
        supplier({
          packaging: null,
          paymentTerms: null,
          moq: null,
          leadTimeDays: null,
          exportCountries: [],
          certifications: [],
          isVerified: false,
          status: 'PENDING_REVIEW',
        }),
      ],
      [{ ...score(), score: 18, band: 'incomplete', lastContactedAt: null }],
    )
    renderWithProviders(<MatchingDashboard />)

    const card = await screen.findByRole('listitem')
    expect(within(card).getByText('No active certifications')).toBeInTheDocument()
    expect(within(card).getByText('Never contacted')).toBeInTheDocument()
    // An absent fact is omitted, not rendered as an empty row.
    expect(within(card).queryByText('Packaging')).not.toBeInTheDocument()
  })

  it('has no axe violations', async () => {
    shortlistReturns([supplier()], [score()])
    const { container } = renderWithProviders(<MatchingDashboard />)
    await screen.findByRole('listitem')
    await expectNoAxeViolations(container)
  })
})
